/**
 * Write-ahead log for the `kicks` summary table.
 *
 * If saveKick fails (offline / network error), entries are queued here and
 * flushed in the background on a later attempt. Pairs with kickFrames WAL
 * but is independent — frames depend on a kick row existing first, so the
 * order matters: drain kicks WAL before kickFrames WAL.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { bumpTelemetry } from './telemetry';
import type { DbKick, EngineData } from '../types';

const WAL_KEY = '@kickfix:wal:kicks';
const MAX_WAL = 100;

interface WALEntry {
  /** Temp client-side id used to reconcile with `kick_frames` WAL until saved. */
  tempId: string;
  userId: string;
  sessionId: string;
  kickType: string;
  engineData: EngineData;
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

/** Append a failed save to the WAL (capped). */
export async function queueKickSave(entry: Omit<WALEntry, 'ts'>): Promise<void> {
  const wal = await readWAL();
  wal.push({ ...entry, ts: Date.now() });
  while (wal.length > MAX_WAL) wal.shift();
  await writeWAL(wal);
}

/**
 * Flush queued kick saves to Supabase. Returns a map of tempId → realId
 * for entries that successfully saved (so callers can reconcile downstream
 * dependents like kick_frames). Failed entries stay in the WAL.
 */
export async function flushKicksWAL(): Promise<Record<string, string>> {
  const wal = await readWAL();
  if (wal.length === 0) return {};

  const remaining: WALEntry[] = [];
  const reconciled: Record<string, string> = {};

  for (const entry of wal) {
    try {
      const { data, error } = await supabase
        .from('kicks')
        .insert({
          user_id: entry.userId,
          session_id: entry.sessionId,
          kick_type: entry.kickType,
          engine_data: entry.engineData,
        })
        .select()
        .single<DbKick>();
      if (error || !data) {
        remaining.push(entry);
      } else {
        reconciled[entry.tempId] = data.id;
        bumpTelemetry(entry.userId, 'savedKicks').catch(() => {});
      }
    } catch {
      remaining.push(entry);
    }
  }
  await writeWAL(remaining);
  return reconciled;
}

export async function getKicksWALSize(): Promise<number> {
  const wal = await readWAL();
  return wal.length;
}
