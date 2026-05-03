import { supabase } from '../lib/supabase';
import type { DbProfile } from '../types';

export async function getProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<DbProfile>();
}

export async function upsertProfile(
  userId: string,
  data: Partial<Pick<DbProfile, 'username' | 'belt_level' | 'height_cm'>>,
) {
  return supabase
    .from('profiles')
    .upsert({ id: userId, ...data }, { onConflict: 'id' })
    .select()
    .single<DbProfile>();
}
