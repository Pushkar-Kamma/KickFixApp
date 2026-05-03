import { supabase } from '../lib/supabase';
import type { DbKick, EngineData } from '../types';

export async function saveKick(
  userId: string,
  sessionId: string,
  kickType: string,
  engineData: EngineData,
) {
  return supabase
    .from('kicks')
    .insert({
      user_id: userId,
      session_id: sessionId,
      kick_type: kickType,
      engine_data: engineData,
    })
    .select()
    .single<DbKick>();
}

export async function getKicksForSession(sessionId: string) {
  return supabase
    .from('kicks')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .returns<DbKick[]>();
}

export async function getRecentKicks(userId: string, limit = 20) {
  return supabase
    .from('kicks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<DbKick[]>();
}
