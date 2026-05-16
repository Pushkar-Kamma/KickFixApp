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

/**
 * Permanently delete the signed-in user's account and all related data.
 * Calls the `delete_my_account()` Postgres function (see migrations/003).
 * On success, the user is automatically signed out by Supabase (auth row gone).
 */
export async function deleteMyAccount() {
  return supabase.rpc('delete_my_account');
}
