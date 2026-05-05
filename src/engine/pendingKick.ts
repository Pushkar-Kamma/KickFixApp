/**
 * In-memory bridge for handing off a freshly captured kick from
 * CameraScreen → KickReviewScreen without waiting on async storage / Supabase.
 *
 * Solves the race where the camera navigates to review before the AsyncStorage
 * write of the frame buffer has resolved.
 *
 * Entries auto-expire after EXPIRY_MS so we don't leak memory if the user
 * never opens the review screen.
 */

import type { PoseFrame } from '../engine/biomech';

interface PendingKick {
  frames: PoseFrame[];
  peakIdx: number;
  chamberIdx: number;
  leg: 'Left' | 'Right';
  kickMode: string;
  ts: number;
}

const EXPIRY_MS = 60_000; // 1 minute
const store = new Map<string, PendingKick>();

export function setPendingKick(key: string, value: Omit<PendingKick, 'ts'>): void {
  store.set(key, { ...value, ts: Date.now() });
  // Opportunistic GC of expired entries
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now - v.ts > EXPIRY_MS) store.delete(k);
  }
}

export function takePendingKick(key: string): PendingKick | null {
  const v = store.get(key);
  if (!v) return null;
  store.delete(key); // consume on read
  return v;
}

export function peekPendingKick(key: string): PendingKick | null {
  return store.get(key) ?? null;
}
