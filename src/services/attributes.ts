/**
 * Fighter Attributes — derives a 6-axis "RPG stat sheet" from kick history.
 *
 * Each axis returns 0–100. Overall = average of the 6.
 *
 * Window options:
 *   '7d'       — last 7 days
 *   '30d'      — last 30 days  (default, most informative for "recent form")
 *   'all'      — all-time
 *
 * Older kicks (pre-rich-data) only contribute to TECHNIQUE; the other
 * attributes ignore them and gracefully degrade.
 */

import { supabase } from '../lib/supabase';
import type { DbKick } from '../types';

export type AttrWindow = '7d' | '30d' | 'all';

export interface FighterAttributes {
  technique: number;
  power: number;
  speed: number;
  defense: number;
  footwork: number;
  conditioning: number;
  overall: number;
  totalKicks: number;
  hasEnoughData: boolean;
}

const POSTURE_CRITERIA = new Set([
  'torso_vertical', 'body_line', 'lean_controlled', 'hip_shoulder_align',
]);
const FOOTWORK_CRITERIA = new Set([
  'support_knee_bend', 'support_heel', 'knee_stays_up', 'pelvic_drop',
]);

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function windowStartIso(window: AttrWindow): string | null {
  if (window === 'all') return null;
  const days = window === '7d' ? 7 : 30;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

export async function getFighterAttributes(userId: string, window: AttrWindow = '30d'): Promise<FighterAttributes> {
  const startIso = windowStartIso(window);
  let query = supabase.from('kicks').select('*').eq('user_id', userId);
  if (startIso) query = query.gte('created_at', startIso);
  const { data } = await query.returns<DbKick[]>();
  const kicks = data ?? [];

  const empty: FighterAttributes = {
    technique: 0, power: 0, speed: 0, defense: 0,
    footwork: 0, conditioning: 0, overall: 0,
    totalKicks: kicks.length, hasEnoughData: kicks.length >= 10,
  };
  if (kicks.length === 0) return empty;

  // ── TECHNIQUE: avg score (works for ALL kicks, old + new) ────────────────
  const technique = clamp(avg(kicks.map(k => k.engine_data?.score ?? 0)));

  // ── POWER: snap velocity + recoil (only kicks with metrics) ──────────────
  const richKicks = kicks.filter(k => k.engine_data?.metrics);
  let power = 0;
  if (richKicks.length) {
    const snapNorm = avg(richKicks.map(k => {
      const v = k.engine_data!.metrics!.peakKneeAngularVelDegPerSec ?? 0;
      return Math.min(100, v / 12); // 1200°/s = 100, 600°/s = 50
    }));
    const recoilNorm = avg(richKicks.map(k => {
      const r = k.engine_data!.metrics!.recoilToExtensionRatio ?? 0;
      return Math.min(100, r * 100);
    }));
    power = clamp(snapNorm * 0.6 + recoilNorm * 0.4);
  }

  // ── SPEED: inverse of extension time ─────────────────────────────────────
  let speed = 0;
  if (richKicks.length) {
    speed = clamp(avg(richKicks.map(k => {
      const ms = k.engine_data!.metrics!.extensionMs ?? 1500;
      // 500ms → 100, 1000ms → 50, 1500ms+ → 0
      return Math.max(0, Math.min(100, (1500 - ms) / 10));
    })));
  }

  // ── DEFENSE: posture criteria pass-rate ──────────────────────────────────
  let defense = 0;
  if (richKicks.length) {
    const postureRates = richKicks.map(k => {
      const passed = new Set(k.engine_data!.passedCriteria ?? []);
      const errors = new Set(k.engine_data!.errors ?? []);
      // For each posture criterion that this kick reported on, count pass rate
      const relevant = [...POSTURE_CRITERIA].filter(c => passed.has(c) || errors.has(c));
      if (!relevant.length) return null;
      const passes = relevant.filter(c => passed.has(c)).length;
      return (passes / relevant.length) * 100;
    }).filter((n): n is number => n !== null);
    defense = clamp(avg(postureRates));
  }

  // ── FOOTWORK: standing-leg + recoil control pass-rate ────────────────────
  let footwork = 0;
  if (richKicks.length) {
    const fwRates = richKicks.map(k => {
      const passed = new Set(k.engine_data!.passedCriteria ?? []);
      const errors = new Set(k.engine_data!.errors ?? []);
      const relevant = [...FOOTWORK_CRITERIA].filter(c => passed.has(c) || errors.has(c));
      if (!relevant.length) return null;
      const passes = relevant.filter(c => passed.has(c)).length;
      return (passes / relevant.length) * 100;
    }).filter((n): n is number => n !== null);
    footwork = clamp(avg(fwRates));
  }

  // ── CONDITIONING: volume + consistency over a FIXED last 7 days ──────────
  // (Window-independent on purpose: a fighter's current conditioning shouldn't
  // change based on which time toggle they tap. We always look at recent form.)
  const condStart = new Date();
  condStart.setHours(0, 0, 0, 0);
  condStart.setDate(condStart.getDate() - 6); // last 7 days inclusive
  const condStartIso = condStart.toISOString();
  let condKicks: DbKick[] = [];
  try {
    const { data } = await supabase
      .from('kicks')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', condStartIso)
      .returns<DbKick[]>();
    condKicks = data ?? [];
  } catch {}
  const COND_DAYS = 7;
  const targetTotal = 50 * COND_DAYS; // 50 kicks/day target
  const volume = Math.min(100, (condKicks.length / targetTotal) * 100);
  // Bucket by LOCAL date (matches dashboard heatmap)
  const activeDays = new Set(condKicks.map(k => {
    const dt = new Date(k.created_at);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  })).size;
  const consistency = (activeDays / COND_DAYS) * 100;
  const conditioning = clamp(volume * 0.5 + consistency * 0.5);

  // ── Overall ──────────────────────────────────────────────────────────────
  // Average all 6, but skip zeroed attributes if there's no rich data for them
  // (keeps overall meaningful when the user only has TECHNIQUE).
  const components: number[] = [technique, conditioning];
  if (richKicks.length) {
    components.push(power, speed, defense, footwork);
  }
  const overall = clamp(avg(components));

  return {
    technique, power, speed, defense, footwork, conditioning,
    overall,
    totalKicks: kicks.length,
    hasEnoughData: kicks.length >= 10,
  };
}
