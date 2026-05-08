/**
 * Local telemetry counters — track events that we don't want to ship to
 * Supabase (e.g. rejected low-quality kicks) but still want to surface to
 * the user / developer for tuning.
 *
 * All counters are stored in AsyncStorage, scoped per-userId.
 *
 * Use the new biomech engine entry-points to log; read via getTelemetry()
 * for display in a settings/debug screen later.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = (userId: string) => `@kickfix:telemetry:${userId}`;

export interface TelemetryCounters {
  /** Kicks that scored below the rejection threshold (45) and were not saved. */
  rejectedKicks: number;
  /** Kicks that were aborted mid-recording (e.g. lost tracking). */
  abortedKicks: number;
  /** Kicks that fell below MIN_KICK_FRAMES (too short to analyze). */
  tooShortKicks: number;
  /** Successful saves to Supabase. */
  savedKicks: number;
  /** saveKick HTTP failures (queued for retry). */
  saveFailures: number;
  /** Last update timestamp (ms). */
  lastUpdated: number;
}

const DEFAULT: TelemetryCounters = {
  rejectedKicks: 0,
  abortedKicks: 0,
  tooShortKicks: 0,
  savedKicks: 0,
  saveFailures: 0,
  lastUpdated: 0,
};

export async function getTelemetry(userId: string): Promise<TelemetryCounters> {
  try {
    const v = await AsyncStorage.getItem(KEY(userId));
    if (!v) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(v) };
  } catch {
    return { ...DEFAULT };
  }
}

async function writeTelemetry(userId: string, counters: TelemetryCounters): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(userId), JSON.stringify(counters));
  } catch {}
}

/** Increment a counter by 1 (best-effort, never throws). */
export async function bumpTelemetry(
  userId: string | null,
  field: Exclude<keyof TelemetryCounters, 'lastUpdated'>,
): Promise<void> {
  if (!userId) return;
  try {
    const t = await getTelemetry(userId);
    t[field] = (t[field] ?? 0) + 1;
    t.lastUpdated = Date.now();
    await writeTelemetry(userId, t);
  } catch {}
}

export async function resetTelemetry(userId: string): Promise<void> {
  await writeTelemetry(userId, { ...DEFAULT });
}
