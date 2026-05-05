import { supabase } from '../lib/supabase';
import type { DbKick, EngineData } from '../types';
import { readCachedRecentKicks, writeCachedRecentKicks } from './kicksCache';

export async function saveKick(
  userId: string,
  sessionId: string,
  kickType: string,
  engineData: EngineData,
) {
  const result = await supabase
    .from('kicks')
    .insert({
      user_id: userId,
      session_id: sessionId,
      kick_type: kickType,
      engine_data: engineData,
    })
    .select()
    .single<DbKick>();

  // Best-effort: prepend to local cache so history is up to date next time it opens.
  if (result.data) {
    readCachedRecentKicks(userId)
      .then(cached => writeCachedRecentKicks(userId, [result.data!, ...cached]))
      .catch(() => {});
  }
  return result;
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

export async function deleteKick(kickId: string) {
  return supabase.from('kicks').delete().eq('id', kickId);
}
