/**
 * Unit tests for the engagement engine (engagement.ts). Pure logic.
 */

import {
  xpForKick, xpToReachLevel, levelForXp, daysBetweenISO,
  registerGoalMet, checkStreakBreak, goalRing, selectWeaknessDrills,
  type StreakState,
} from '../src/engine/engagement';

describe('xpForKick', () => {
  it('rewards higher scores with more XP', () => {
    expect(xpForKick({ score: 90, difficulty: 'front' })).toBeGreaterThan(xpForKick({ score: 40, difficulty: 'front' }));
  });
  it('gives harder kicks a difficulty multiplier', () => {
    expect(xpForKick({ score: 80, difficulty: 'round' })).toBeGreaterThan(xpForKick({ score: 80, difficulty: 'front' }));
  });
  it('adds personal-best and new-technique bonuses', () => {
    const base = xpForKick({ score: 60, difficulty: 'front' });
    expect(xpForKick({ score: 60, difficulty: 'front', isPersonalBest: true })).toBe(base + 25);
    expect(xpForKick({ score: 60, difficulty: 'front', isNewTechnique: true })).toBe(base + 15);
  });
  it('never returns negative XP and clamps score', () => {
    expect(xpForKick({ score: -50, difficulty: 'front' })).toBe(0);
    expect(xpForKick({ score: 999, difficulty: 'front' })).toBe(xpForKick({ score: 100, difficulty: 'front' }));
  });
});

describe('levels', () => {
  it('level 1 needs 0 XP and thresholds grow', () => {
    expect(xpToReachLevel(1)).toBe(0);
    expect(xpToReachLevel(2)).toBe(50);
    expect(xpToReachLevel(3)).toBe(150);
    expect(xpToReachLevel(3) - xpToReachLevel(2)).toBeGreaterThan(xpToReachLevel(2) - xpToReachLevel(1));
  });
  it('resolves total XP into the correct level + progress', () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(49).level).toBe(1);
    expect(levelForXp(50).level).toBe(2);
    expect(levelForXp(150).level).toBe(3);
    const s = levelForXp(100); // halfway through level 2 (50..150)
    expect(s.level).toBe(2);
    expect(s.progress).toBeCloseTo(0.5, 2);
  });
});

describe('daysBetweenISO', () => {
  it('counts whole days across month boundaries', () => {
    expect(daysBetweenISO('2026-07-14', '2026-07-15')).toBe(1);
    expect(daysBetweenISO('2026-06-30', '2026-07-01')).toBe(1);
    expect(daysBetweenISO('2026-07-14', '2026-07-14')).toBe(0);
    expect(daysBetweenISO('2026-07-10', '2026-07-14')).toBe(4);
  });
});

describe('registerGoalMet', () => {
  const S = (o: Partial<StreakState> = {}): StreakState => ({ current: 0, longest: 0, lastMetDate: '', freezes: 0, ...o });

  it('starts a streak on the first met day', () => {
    const u = registerGoalMet(S(), '2026-07-14');
    expect(u.event).toBe('started');
    expect(u.current).toBe(1);
  });
  it('advances on a consecutive day', () => {
    const u = registerGoalMet(S({ current: 3, longest: 3, lastMetDate: '2026-07-13' }), '2026-07-14');
    expect(u.event).toBe('advanced');
    expect(u.current).toBe(4);
    expect(u.longest).toBe(4);
  });
  it('does not double-count the same day', () => {
    const u = registerGoalMet(S({ current: 5, longest: 5, lastMetDate: '2026-07-14' }), '2026-07-14');
    expect(u.event).toBe('maintained');
    expect(u.current).toBe(5);
  });
  it('uses a freeze to bridge a one-day gap', () => {
    const u = registerGoalMet(S({ current: 7, longest: 7, lastMetDate: '2026-07-12', freezes: 1 }), '2026-07-14');
    expect(u.event).toBe('advanced');
    expect(u.current).toBe(8);
    expect(u.freezes).toBe(0);
    expect(u.freezesConsumed).toBe(1);
  });
  it('restarts at 1 when a gap exceeds available freezes', () => {
    const u = registerGoalMet(S({ current: 9, longest: 9, lastMetDate: '2026-07-10', freezes: 0 }), '2026-07-14');
    expect(u.event).toBe('restarted');
    expect(u.current).toBe(1);
    expect(u.longest).toBe(9);
  });
});

describe('checkStreakBreak', () => {
  const S = (o: Partial<StreakState> = {}): StreakState => ({ current: 0, longest: 0, lastMetDate: '', freezes: 0, ...o });

  it('keeps a streak alive if last met was yesterday (day not over)', () => {
    const u = checkStreakBreak(S({ current: 4, lastMetDate: '2026-07-13' }), '2026-07-14');
    expect(u.event).toBe('maintained');
    expect(u.current).toBe(4);
  });
  it('consumes freezes to cover missed days', () => {
    const u = checkStreakBreak(S({ current: 4, lastMetDate: '2026-07-11', freezes: 2 }), '2026-07-14');
    expect(u.event).toBe('maintained');
    expect(u.freezes).toBe(0); // missed 2 full days (12th, 13th)
    expect(u.current).toBe(4);
  });
  it('breaks the streak when freezes are insufficient', () => {
    const u = checkStreakBreak(S({ current: 4, lastMetDate: '2026-07-10', freezes: 1 }), '2026-07-14');
    expect(u.event).toBe('broken');
    expect(u.current).toBe(0);
  });
});

describe('goalRing + weakness targeting', () => {
  it('computes goal fraction and met flag', () => {
    expect(goalRing(10, 20)).toEqual({ fraction: 0.5, met: false });
    expect(goalRing(25, 20)).toEqual({ fraction: 1, met: true });
    expect(goalRing(5, 0)).toEqual({ fraction: 0, met: false });
  });
  it('selects the most-failed criteria, deterministically', () => {
    const drills = selectWeaknessDrills({ chamber_height: 5, hip_turnover: 9, lockout: 9, ok: 0 }, 2);
    expect(drills).toEqual([
      { criterionId: 'hip_turnover', failCount: 9 },
      { criterionId: 'lockout', failCount: 9 },
    ]);
  });
});

describe('checkStreakBreak across multiple days (freeze accounting)', () => {
  const pick = (u: { current: number; longest: number; lastMetDate: string; freezes: number }): StreakState =>
    ({ current: u.current, longest: u.longest, lastMetDate: u.lastMetDate, freezes: u.freezes });

  it('spends exactly one freeze per missed day and breaks only when exhausted', () => {
    let s: StreakState = { current: 5, longest: 5, lastMetDate: '2026-07-14', freezes: 3 };
    s = pick(checkStreakBreak(s, '2026-07-16')); expect(s.freezes).toBe(2); expect(s.current).toBe(5);
    s = pick(checkStreakBreak(s, '2026-07-17')); expect(s.freezes).toBe(1); expect(s.current).toBe(5);
    s = pick(checkStreakBreak(s, '2026-07-18')); expect(s.freezes).toBe(0); expect(s.current).toBe(5);
    const broken = checkStreakBreak(s, '2026-07-19');
    expect(broken.event).toBe('broken');
    expect(broken.current).toBe(0);
  });

  it('does not re-consume freezes on repeated same-day calls', () => {
    const s: StreakState = { current: 5, longest: 5, lastMetDate: '2026-07-14', freezes: 3 };
    const a = checkStreakBreak(s, '2026-07-16');
    const b = checkStreakBreak(pick(a), '2026-07-16');
    expect(b.freezes).toBe(a.freezes);
  });
});
