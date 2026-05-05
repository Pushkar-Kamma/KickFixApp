/**
 * Local cache for the recent kicks list.
 * - Read: instant render of cached list while Supabase fetch happens in background.
 * - Write: refreshed on every successful Supabase load.
 *
 * Stored under a per-user key so multiple accounts on the same device don't collide.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DbKick } from '../types';

const KEY = (userId: string) => `@kickfix:recentKicks:${userId}`;
const MAX_CACHED = 100;

export async function readCachedRecentKicks(userId: string): Promise<DbKick[]> {
  try {
    const v = await AsyncStorage.getItem(KEY(userId));
    if (!v) return [];
    const parsed = JSON.parse(v) as DbKick[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeCachedRecentKicks(userId: string, kicks: DbKick[]): Promise<void> {
  try {
    const trimmed = kicks.slice(0, MAX_CACHED);
    await AsyncStorage.setItem(KEY(userId), JSON.stringify(trimmed));
  } catch {}
}

export async function removeCachedKick(userId: string, kickId: string): Promise<void> {
  try {
    const cached = await readCachedRecentKicks(userId);
    const next = cached.filter(k => k.id !== kickId);
    await writeCachedRecentKicks(userId, next);
  } catch {}
}
