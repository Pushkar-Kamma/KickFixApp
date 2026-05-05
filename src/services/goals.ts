/**
 * Goals service — daily training targets + streak tracking.
 *
 * Persisted locally via AsyncStorage (per-user keys).
 * Today's progress is computed from the cached kicks + sessions on demand.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getRecentSessions } from './sessions';
import type { DbKick, DbSession } from '../types';

export interface UserGoals {
  dailyKicks?: number;
  dailyMinutes?: number;
  avgScoreTarget?: number;
}

export interface DailyProgress {
  kicksToday: number;
  minutesToday: number;
  avgScoreToday: number | null;     // null if no kicks today
  goalKicksMet: boolean;
  goalMinutesMet: boolean;
  goalScoreMet: boolean;
  /** True if all set goals were met today (ignores unset goals). */
  allGoalsMet: boolean;
  /** True if at least one goal is configured. */
  hasAnyGoal: boolean;
}

export interface StreakState {
  current: number;       // current streak in days
  longest: number;       // best streak ever
  lastMetDate: string;   // YYYY-MM-DD of last day all goals were met
}

const goalsKey = (userId: string) => `@kickfix:goals:${userId}`;
const streakKey = (userId: string) => `@kickfix:streak:${userId}`;

/* ── Goals CRUD ── */
export async function readGoals(userId: string): Promise<UserGoals> {
  try {
    const v = await AsyncStorage.getItem(goalsKey(userId));
    return v ? (JSON.parse(v) as UserGoals) : {};
  } catch {
    return {};
  }
}

export async function writeGoals(userId: string, goals: UserGoals): Promise<void> {
  try { await AsyncStorage.setItem(goalsKey(userId), JSON.stringify(goals)); } catch {}
}

/* ── Streak ── */
async function readStreak(userId: string): Promise<StreakState> {
  try {
    const v = await AsyncStorage.getItem(streakKey(userId));
    return v ? (JSON.parse(v) as StreakState) : { current: 0, longest: 0, lastMetDate: '' };
  } catch {
    return { current: 0, longest: 0, lastMetDate: '' };
  }
}
async function writeStreak(userId: string, s: StreakState): Promise<void> {
  try { await AsyncStorage.setItem(streakKey(userId), JSON.stringify(s)); } catch {}
}

export async function getStreak(userId: string): Promise<StreakState> {
  const s = await readStreak(userId);
  // If user missed yesterday (and we're past today), the streak should appear as 0
  // until they meet today's goals. We don't reset persistently here — only on update.
  // Still, decay-display logic: if lastMetDate is older than yesterday, current streak shows 0.
  const today = todayStr();
  const yesterday = daysAgoStr(1);
  if (s.lastMetDate && s.lastMetDate !== today && s.lastMetDate !== yesterday) {
    return { ...s, current: 0 };
  }
  return s;
}

/**
 * Check whether today's goals are met and update streak accordingly.
 * Call this after each kick is saved (cheap — just reads cached data).
 */
export async function maybeAdvanceStreak(userId: string, progress: DailyProgress): Promise<StreakState> {
  if (!progress.hasAnyGoal || !progress.allGoalsMet) {
    return await readStreak(userId); // no advance
  }
  const today = todayStr();
  const s = await readStreak(userId);
  if (s.lastMetDate === today) return s; // already counted today
  const yesterday = daysAgoStr(1);
  const continued = s.lastMetDate === yesterday;
  const next: StreakState = {
    current: continued ? s.current + 1 : 1,
    longest: Math.max(s.longest, continued ? s.current + 1 : 1),
    lastMetDate: today,
  };
  await writeStreak(userId, next);
  return next;
}

/* ── Today's progress ── */

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Compute today's progress.
 * - Kicks today: queries Supabase directly with a date filter (NOT the cache,
 *   which is capped at 100 lifetime kicks and would undercount heavy users).
 * - Minutes today: sums session durations for today.
 * - Avg score today: average of today's kick scores from the same query.
 */
export async function getDailyProgress(userId: string): Promise<DailyProgress> {
  const goals = await readGoals(userId);

  // Today's date boundary (local time → ISO for the DB query)
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  let kicksToday = 0;
  let avgScoreToday: number | null = null;
  try {
    const { data } = await supabase
      .from('kicks')
      .select('engine_data, created_at')
      .eq('user_id', userId)
      .gte('created_at', startIso)
      .returns<DbKick[]>();
    if (data && data.length) {
      kicksToday = data.length;
      const sum = data.reduce((s, k) => s + (k.engine_data?.score ?? 0), 0);
      avgScoreToday = Math.round(sum / data.length);
    }
  } catch {}

  // Sum session durations for today
  let minutesToday = 0;
  try {
    const { data: sessions } = await getRecentSessions(userId, 30);
    if (sessions) {
      for (const sess of sessions as DbSession[]) {
        if (!sess.started_at) continue;
        if (sess.started_at.slice(0, 10) !== todayStr()) continue;
        const start = new Date(sess.started_at).getTime();
        const end = sess.ended_at ? new Date(sess.ended_at).getTime() : Date.now();
        minutesToday += Math.max(0, (end - start) / 60000);
      }
    }
  } catch {}

  const hasAnyGoal = Boolean(goals.dailyKicks || goals.dailyMinutes || goals.avgScoreTarget);
  const goalKicksMet = goals.dailyKicks ? kicksToday >= goals.dailyKicks : false;
  const goalMinutesMet = goals.dailyMinutes ? minutesToday >= goals.dailyMinutes : false;
  const goalScoreMet = goals.avgScoreTarget && avgScoreToday !== null
    ? avgScoreToday >= goals.avgScoreTarget
    : false;

  // "All goals met" considers only the goals that are configured.
  const goalsToCheck: boolean[] = [];
  if (goals.dailyKicks) goalsToCheck.push(goalKicksMet);
  if (goals.dailyMinutes) goalsToCheck.push(goalMinutesMet);
  if (goals.avgScoreTarget) goalsToCheck.push(goalScoreMet);
  const allGoalsMet = goalsToCheck.length > 0 && goalsToCheck.every(Boolean);

  return {
    kicksToday,
    minutesToday: Math.round(minutesToday),
    avgScoreToday,
    goalKicksMet,
    goalMinutesMet,
    goalScoreMet,
    allGoalsMet,
    hasAnyGoal,
  };
}

export { todayStr };
