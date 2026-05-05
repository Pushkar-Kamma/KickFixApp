/**
 * Kick frame storage — saves landmark buffer for the replay/review screen.
 *
 * IMPORTANT: We do NOT save video. Only MediaPipe landmark coordinates
 * (33 image-space + 33 world-space points per frame) are persisted. The
 * skeleton replay in KickReviewScreen is rendered from these landmarks.
 *
 * Strategy:
 *   1. Always write to AsyncStorage write-ahead log first (sync, instant).
 *   2. If online, flush WAL to Supabase in the background.
 *   3. Review screen reads from local cache first, falls back to Supabase.
 *
 * Compact format reduces a 25-frame kick from ~150KB to ~25KB.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { CompactFrame, DbKickFrames } from '../types';
import type { PoseFrame } from '../engine/biomech';
import type { Landmark } from '../engine/biomech';

const SETTING_KEY = '@kickfix:saveReplays';
const WAL_KEY = '@kickfix:wal:kickFrames';
const CACHE_PREFIX = '@kickfix:kick:';
/** Hard cap to prevent unbounded WAL growth if Supabase is unreachable for a long time. */
const MAX_WAL_ENTRIES = 50;
/** Max number of cached replays to keep on device. */
const MAX_CACHED_KICKS = 30;

/* ── Settings ── */
export async function getSaveReplaysEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(SETTING_KEY);
    if (v === null) return true; // default ON
    return v === '1';
  } catch {
    return true;
  }
}
export async function setSaveReplaysEnabled(enabled: boolean): Promise<void> {
  try { await AsyncStorage.setItem(SETTING_KEY, enabled ? '1' : '0'); } catch {}
}

/* ── Compact encoding ── */
function r4(n: number): number { return Math.round(n * 10000) / 10000; }

function compactLm(lms: Landmark[]) {
  return lms.map(p => [r4(p.x), r4(p.y), r4(p.z), r4(p.visibility ?? 0), r4(p.presence ?? 0)] as [number, number, number, number, number]);
}

export function compactPoseFrames(frames: PoseFrame[]): CompactFrame[] {
  if (!frames.length) return [];
  const t0 = frames[0].t;
  return frames.map(f => ({
    i: compactLm(f.image),
    w: compactLm(f.world),
    t: Math.round(f.t - t0),
  }));
}

export function expandPoseFrames(frames: CompactFrame[]): PoseFrame[] {
  return frames.map(f => ({
    image: f.i.map(p => ({ x: p[0], y: p[1], z: p[2], visibility: p[3], presence: p[4] })),
    world: f.w.map(p => ({ x: p[0], y: p[1], z: p[2], visibility: p[3], presence: p[4] })),
    t: f.t,
  }));
}

/* ── Write-ahead log + Supabase ── */

interface WALEntry {
  kickId: string;
  userId: string;
  frames: CompactFrame[];
  peakIdx: number;
  chamberIdx: number;
  leg: 'Left' | 'Right';
  ts: number;
}

async function readWAL(): Promise<WALEntry[]> {
  try {
    const v = await AsyncStorage.getItem(WAL_KEY);
    return v ? (JSON.parse(v) as WALEntry[]) : [];
  } catch { return []; }
}
async function writeWAL(entries: WALEntry[]): Promise<void> {
  try { await AsyncStorage.setItem(WAL_KEY, JSON.stringify(entries)); } catch {}
}

/** Save kick frames. Returns immediately; flush happens in background. */
export async function saveKickFrames(args: {
  kickId: string;
  userId: string;
  frames: PoseFrame[];
  peakIdx: number;
  chamberIdx: number;
  leg: 'Left' | 'Right';
}): Promise<void> {
  const enabled = await getSaveReplaysEnabled();
  if (!enabled) return;

  const compact = compactPoseFrames(args.frames);
  const entry: WALEntry = {
    kickId: args.kickId,
    userId: args.userId,
    frames: compact,
    peakIdx: args.peakIdx,
    chamberIdx: args.chamberIdx,
    leg: args.leg,
    ts: Date.now(),
  };

  // Always cache locally so review screen works offline immediately
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${args.kickId}`, JSON.stringify(entry));
  } catch {}

  // Append to WAL for background sync — cap size to prevent runaway memory
  const wal = await readWAL();
  wal.push(entry);
  while (wal.length > MAX_WAL_ENTRIES) wal.shift(); // drop oldest
  await writeWAL(wal);

  // Try to flush in background (don't await)
  flushWAL().catch(() => {});

  // Best-effort cache cleanup (don't await, don't block)
  trimCache().catch(() => {});
}

/** Flush pending entries to Supabase. Safe to call from anywhere. */
export async function flushWAL(): Promise<void> {
  const wal = await readWAL();
  if (wal.length === 0) return;

  const remaining: WALEntry[] = [];
  for (const entry of wal) {
    try {
      const { error } = await supabase.from('kick_frames').insert({
        kick_id: entry.kickId,
        user_id: entry.userId,
        frames: entry.frames,
        peak_frame_idx: entry.peakIdx,
        chamber_frame_idx: entry.chamberIdx,
        leg: entry.leg,
      });
      if (error) {
        // network or schema error — keep in WAL
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry);
    }
  }
  await writeWAL(remaining);
}

/** Load frames for a kick, preferring local cache. */
export async function loadKickFrames(kickId: string): Promise<{
  frames: PoseFrame[];
  peakIdx: number;
  chamberIdx: number;
  leg: 'Left' | 'Right';
} | null> {
  // Try local cache
  try {
    const v = await AsyncStorage.getItem(`${CACHE_PREFIX}${kickId}`);
    if (v) {
      const e: WALEntry = JSON.parse(v);
      return {
        frames: expandPoseFrames(e.frames),
        peakIdx: e.peakIdx,
        chamberIdx: e.chamberIdx,
        leg: e.leg,
      };
    }
  } catch {}

  // Fall back to Supabase
  try {
    const { data, error } = await supabase
      .from('kick_frames')
      .select('*')
      .eq('kick_id', kickId)
      .single<DbKickFrames>();
    if (error || !data) return null;
    return {
      frames: expandPoseFrames(data.frames),
      peakIdx: data.peak_frame_idx,
      chamberIdx: data.chamber_frame_idx,
      leg: data.leg,
    };
  } catch { return null; }
}
/**
 * Trim cached kick replays so device storage doesn't grow unbounded.
 * Keeps the MAX_CACHED_KICKS most-recent kicks; deletes the rest.
 */
async function trimCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length <= MAX_CACHED_KICKS) return;
    // Read entries with their timestamps, sort newest first, drop the rest
    const pairs = await AsyncStorage.multiGet(cacheKeys);
    const dated = pairs.map(([k, v]) => {
      let ts = 0;
      try { ts = v ? (JSON.parse(v) as WALEntry).ts ?? 0 : 0; } catch {}
      return { key: k, ts };
    });
    dated.sort((a, b) => b.ts - a.ts);
    const toDelete = dated.slice(MAX_CACHED_KICKS).map(d => d.key);
    if (toDelete.length) await AsyncStorage.multiRemove(toDelete);
  } catch {}
}