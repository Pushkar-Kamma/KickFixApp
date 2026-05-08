import { supabase } from '../lib/supabase';
import type { DbSession } from '../types';

export async function createSession(userId: string, kickMode?: string) {
  return supabase
    .from('sessions')
    .insert({ user_id: userId, started_at: new Date().toISOString(), kick_mode: kickMode ?? null })
    .select()
    .single<DbSession>();
}

export async function endSession(
  sessionId: string,
  stats: {
    total_kicks: number;
    good_kicks: number;
    bad_kicks: number;
    max_streak: number;
  },
) {
  return supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), ...stats })
    .eq('id', sessionId);
}

export async function getRecentSessions(userId: string, limit = 10) {
  return supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)
    .returns<DbSession[]>();
}

export async function getSessionStats(userId: string) {
  // Source of truth = the kicks table itself (sessions table only updates
  // total_kicks on endSession, which can drift if a session is killed mid-flow).
  const { data: kicks } = await supabase
    .from('kicks')
    .select('engine_data, session_id')
    .eq('user_id', userId);

  if (!kicks || kicks.length === 0) {
    return { totalKicks: 0, goodKicks: 0, badKicks: 0, bestStreak: 0, sessionCount: 0 };
  }

  let totalKicks = 0;
  let goodKicks = 0;
  let badKicks = 0;
  const sessionIds = new Set<string>();
  // Streak = longest consecutive run of kicks with score >= 70 (a "good" kick)
  let curStreak = 0;
  let bestStreak = 0;

  for (const k of kicks) {
    totalKicks += 1;
    if (k.session_id) sessionIds.add(k.session_id);
    const score = k.engine_data?.score ?? 0;
    if (score >= 70) {
      goodKicks += 1;
      curStreak += 1;
      if (curStreak > bestStreak) bestStreak = curStreak;
    } else {
      badKicks += 1;
      curStreak = 0;
    }
  }

  return { totalKicks, goodKicks, badKicks, bestStreak, sessionCount: sessionIds.size };
}
