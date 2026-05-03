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
  const { data, error } = await supabase
    .from('sessions')
    .select('total_kicks, good_kicks, bad_kicks, max_streak')
    .eq('user_id', userId);

  if (error || !data || data.length === 0) {
    return { totalKicks: 0, goodKicks: 0, badKicks: 0, bestStreak: 0, sessionCount: 0 };
  }

  let totalKicks = 0;
  let goodKicks = 0;
  let badKicks = 0;
  let bestStreak = 0;

  for (const s of data) {
    totalKicks += s.total_kicks ?? 0;
    goodKicks += s.good_kicks ?? 0;
    badKicks += s.bad_kicks ?? 0;
    if ((s.max_streak ?? 0) > bestStreak) bestStreak = s.max_streak ?? 0;
  }

  return { totalKicks, goodKicks, badKicks, bestStreak, sessionCount: data.length };
}
