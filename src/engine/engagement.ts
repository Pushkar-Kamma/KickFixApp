/**
 * Engagement engine (pure) — Duolingo-inspired retention primitives.
 *
 * Pure calculators only: no persistence, no React/Native, no service imports.
 * The `goals` service (or future features) can call these; keeping them pure
 * means they unit-test without a device and stay decoupled.
 *
 * Design notes live in BRAINDUMP.md §3. Ethical guardrails:
 *   - streaks are rest/injury-safe (freezes + no punishment for resting),
 *   - rewards celebrate consistency and improvement, not only high scores.
 *
 * All numeric constants are TUNABLE product knobs, collected in KNOBS.
 */

export type KickDifficulty = 'front' | 'side' | 'round';

export const KNOBS = {
  /** XP = scoreFactor * score * difficultyMult + bonuses. TUNABLE. */
  scoreFactor: 0.5,
  difficultyMult: { front: 1.0, side: 1.2, round: 1.3 } as Record<KickDifficulty, number>,
  personalBestBonus: 25,
  newTechniqueBonus: 15,
  /** Level curve: XP needed to REACH level L is levelBase * (L-1) * L. TUNABLE. */
  levelBase: 25,
} as const;

/* ── XP + levels ─────────────────────────────────────────────────────── */

export interface KickXpInput {
  score: number;              // 0..100
  difficulty: KickDifficulty;
  isPersonalBest?: boolean;
  isNewTechnique?: boolean;
}

/** XP earned for a single kick. Always ≥ 0, rewards effort even at low scores. */
export function xpForKick(input: KickXpInput): number {
  const score = Math.max(0, Math.min(100, input.score));
  const mult = KNOBS.difficultyMult[input.difficulty] ?? 1;
  let xp = KNOBS.scoreFactor * score * mult;
  if (input.isPersonalBest) xp += KNOBS.personalBestBonus;
  if (input.isNewTechnique) xp += KNOBS.newTechniqueBonus;
  return Math.round(xp);
}

/** Cumulative XP required to reach a given level (level 1 = 0 XP). */
export function xpToReachLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return KNOBS.levelBase * (L - 1) * L;
}

export interface LevelState {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1 toward next level
}

/** Resolve a total XP into a level + progress toward the next. */
export function levelForXp(totalXp: number): LevelState {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpToReachLevel(level + 1) <= xp) level++;
  const base = xpToReachLevel(level);
  const next = xpToReachLevel(level + 1);
  const span = Math.max(1, next - base);
  const into = xp - base;
  return { level, xpIntoLevel: into, xpForNextLevel: next - base, progress: Math.min(1, into / span) };
}

/* ── Streak state machine (rest/injury-safe) ─────────────────────────── */

export interface StreakState {
  current: number;
  longest: number;
  lastMetDate: string; // 'YYYY-MM-DD' of last day the daily goal was met ('' if never)
  freezes: number;     // available streak freezes
}

export type StreakEvent = 'started' | 'advanced' | 'maintained' | 'restarted' | 'broken';

export interface StreakUpdate extends StreakState {
  event: StreakEvent;
  freezesConsumed: number;
}

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}
/** Whole days from a → b (b later ⇒ positive). */
export function daysBetweenISO(a: string, b: string): number {
  return Math.round((isoToUTC(b) - isoToUTC(a)) / 86_400_000);
}

/**
 * Register that the daily goal was met on `todayISO`. Handles first-ever day,
 * consecutive advance, same-day repeat, and gaps (freezes fill missed days;
 * if insufficient, the streak restarts at 1 — the user still trained today).
 */
export function registerGoalMet(prev: StreakState, todayISO: string): StreakUpdate {
  if (!prev.lastMetDate) {
    const current = 1;
    return { current, longest: Math.max(prev.longest, current), lastMetDate: todayISO, freezes: prev.freezes, event: 'started', freezesConsumed: 0 };
  }
  const diff = daysBetweenISO(prev.lastMetDate, todayISO);
  if (diff <= 0) {
    // Same day (or clock skew): already counted; do not double-increment.
    const current = Math.max(1, prev.current);
    return { ...prev, current, longest: Math.max(prev.longest, current), event: 'maintained', freezesConsumed: 0 };
  }
  if (diff === 1) {
    const current = prev.current + 1;
    return { current, longest: Math.max(prev.longest, current), lastMetDate: todayISO, freezes: prev.freezes, event: 'advanced', freezesConsumed: 0 };
  }
  // diff > 1: missed (diff - 1) full days. Freezes can bridge the gap.
  const missed = diff - 1;
  if (prev.freezes >= missed) {
    const current = prev.current + 1;
    return { current, longest: Math.max(prev.longest, current), lastMetDate: todayISO, freezes: prev.freezes - missed, event: 'advanced', freezesConsumed: missed };
  }
  const current = 1;
  return { current, longest: Math.max(prev.longest, current), lastMetDate: todayISO, freezes: prev.freezes, event: 'restarted', freezesConsumed: 0 };
}

/**
 * Evaluate a streak that has NOT met its goal through `todayISO` (a daily
 * rollover check). Consumes freezes to cover full missed days; breaks the
 * streak to 0 only when freezes are insufficient. Never punishes the current
 * day (it may not be over yet).
 */
export function checkStreakBreak(prev: StreakState, todayISO: string): StreakUpdate {
  if (!prev.lastMetDate || prev.current === 0) {
    return { ...prev, event: 'maintained', freezesConsumed: 0 };
  }
  const diff = daysBetweenISO(prev.lastMetDate, todayISO);
  // diff <= 1 → last met today or yesterday; streak still alive (today not over).
  if (diff <= 1) return { ...prev, event: 'maintained', freezesConsumed: 0 };
  const missed = diff - 1; // full days strictly between lastMetDate and today
  if (prev.freezes >= missed) {
    return { ...prev, freezes: prev.freezes - missed, event: 'maintained', freezesConsumed: missed };
  }
  return { ...prev, current: 0, event: 'broken', freezesConsumed: prev.freezes };
}

/* ── Daily goal ring + weakness targeting ────────────────────────────── */

export interface GoalRing { fraction: number; met: boolean }
/** Progress toward a daily target (kicks, minutes, …). */
export function goalRing(done: number, target: number): GoalRing {
  if (target <= 0) return { fraction: 0, met: false };
  return { fraction: Math.max(0, Math.min(1, done / target)), met: done >= target };
}

export interface WeaknessDrill { criterionId: string; failCount: number }
/**
 * Pick the top-k criteria the user fails most often (spaced-repetition targeting).
 * Ties break by criterion id for determinism.
 */
export function selectWeaknessDrills(failCounts: Record<string, number>, k = 3): WeaknessDrill[] {
  return Object.entries(failCounts)
    .filter(([, n]) => n > 0)
    .map(([criterionId, failCount]) => ({ criterionId, failCount }))
    .sort((a, b) => (b.failCount - a.failCount) || a.criterionId.localeCompare(b.criterionId))
    .slice(0, Math.max(0, k));
}
