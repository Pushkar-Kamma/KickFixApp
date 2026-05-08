/**
 * Pure-function unit tests for the biomechanics engine.
 *
 * These cover the math primitives (no React/Native deps), so they run
 * fast and don't require a device. They lock in the semantics so refactors
 * can't silently break the analyzers downstream.
 */

import {
  angle3D, sub, dot, norm, dist, mid, deriveScalar, deriveVec3, argmax,
  detectKickingLeg, lm, lmReq, frameUsable, J,
  type Landmark, type Vec3,
} from '../src/engine/biomech';

/* Helpers */
const v = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const mk = (x: number, y: number, z = 0, vis = 1, pres = 1): Landmark => ({ x, y, z, visibility: vis, presence: pres });

/* Build a "good" frame of 33 landmarks for visibility tests */
function buildGoodFrame(): Landmark[] {
  const pts: Landmark[] = [];
  for (let i = 0; i < 33; i++) pts.push(mk(0.5, 0.5));
  return pts;
}

describe('vector math', () => {
  it('sub subtracts component-wise', () => {
    expect(sub(v(5, 4, 3), v(1, 2, 1))).toEqual({ x: 4, y: 2, z: 2 });
  });
  it('dot computes scalar product', () => {
    expect(dot(v(1, 2, 3), v(4, -5, 6))).toBe(4 - 10 + 18);
  });
  it('norm is Euclidean magnitude', () => {
    expect(norm(v(3, 4, 0))).toBe(5);
    expect(norm(v(0, 0, 0))).toBe(0);
  });
  it('dist is Euclidean distance between points', () => {
    expect(dist(v(0, 0, 0), v(3, 4, 0))).toBe(5);
  });
  it('mid returns midpoint', () => {
    expect(mid(v(0, 0, 0), v(2, 4, 6))).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('angle3D', () => {
  it('returns 90° for a right angle', () => {
    // a = (1,0,0), b = origin, c = (0,1,0) → angle ABC = 90
    expect(angle3D(v(1, 0, 0), v(0, 0, 0), v(0, 1, 0))).toBeCloseTo(90, 1);
  });
  it('returns 180° for collinear opposite directions', () => {
    expect(angle3D(v(-1, 0, 0), v(0, 0, 0), v(1, 0, 0))).toBeCloseTo(180, 1);
  });
  it('returns 0° for collinear same direction', () => {
    expect(angle3D(v(2, 0, 0), v(0, 0, 0), v(1, 0, 0))).toBeCloseTo(0, 1);
  });
  it('handles zero-length vectors gracefully (returns 0)', () => {
    expect(angle3D(v(0, 0, 0), v(0, 0, 0), v(1, 0, 0))).toBe(0);
  });
});

describe('deriveScalar', () => {
  it('returns first derivative in units/sec', () => {
    // values 0, 10, 20 at t = 0, 100, 200 → 100 per second each interval
    const out = deriveScalar([0, 10, 20], [0, 100, 200]);
    expect(out).toEqual([100, 100]);
  });
  it('returns 0 when dt is zero (avoids div by zero)', () => {
    const out = deriveScalar([0, 10], [0, 0]);
    expect(out).toEqual([0]);
  });
  it('returns empty array when input has < 2 frames', () => {
    expect(deriveScalar([5], [0])).toEqual([]);
    expect(deriveScalar([], [])).toEqual([]);
  });
});

describe('deriveVec3', () => {
  it('returns velocity vectors per axis', () => {
    const out = deriveVec3([v(0, 0, 0), v(1, 2, 3)], [0, 1000]);
    expect(out).toEqual([{ x: 1, y: 2, z: 3 }]);
  });
  it('zeros velocity when dt <= 0', () => {
    const out = deriveVec3([v(0, 0, 0), v(1, 2, 3)], [0, 0]);
    expect(out).toEqual([{ x: 0, y: 0, z: 0 }]);
  });
});

describe('argmax', () => {
  it('returns index of maximum', () => {
    expect(argmax([1, 5, 3, 2])).toBe(1);
    expect(argmax([10])).toBe(0);
  });
  it('returns -1 for empty array', () => {
    expect(argmax([])).toBe(-1);
  });
  it('returns first index on tie', () => {
    expect(argmax([3, 3, 3])).toBe(0);
  });
});

describe('lm / lmReq', () => {
  it('lm returns Vec3 for a present landmark', () => {
    const f = buildGoodFrame();
    f[J.L_HIP] = mk(0.4, 0.5, 0.1);
    expect(lm(f, J.L_HIP)).toEqual({ x: 0.4, y: 0.5, z: 0.1 });
  });
  it('lm returns null when index is missing', () => {
    expect(lm([], 5)).toBeNull();
  });
  it('lmReq throws for missing index (intentional)', () => {
    expect(() => lmReq([], 5)).toThrow(/missing landmark/);
  });
});

describe('frameUsable', () => {
  it('passes when all critical landmarks have visibility + presence', () => {
    const f = buildGoodFrame();
    expect(frameUsable(f)).toBe(true);
  });
  it('fails if a critical landmark has low visibility', () => {
    const f = buildGoodFrame();
    f[J.L_HIP] = mk(0.5, 0.5, 0, 0.1, 1);
    expect(frameUsable(f)).toBe(false);
  });
  it('fails if a critical landmark has low presence', () => {
    const f = buildGoodFrame();
    f[J.R_ANKLE] = mk(0.5, 0.5, 0, 1, 0.1);
    expect(frameUsable(f)).toBe(false);
  });
  it('fails if a critical landmark is missing entirely', () => {
    const f = buildGoodFrame();
    // simulate missing
    delete (f as any)[J.L_KNEE];
    expect(frameUsable(f)).toBe(false);
  });
});

describe('detectKickingLeg', () => {
  it('returns Left when left ankle is higher (smaller y) at midpoint', () => {
    const lower = buildGoodFrame();
    const middle = buildGoodFrame();
    middle[J.L_ANKLE] = mk(0.5, 0.2);  // higher on screen
    middle[J.R_ANKLE] = mk(0.5, 0.8);
    expect(detectKickingLeg([lower, middle])).toBe('Left');
  });
  it('returns Right when right ankle is higher', () => {
    const middle = buildGoodFrame();
    middle[J.L_ANKLE] = mk(0.5, 0.8);
    middle[J.R_ANKLE] = mk(0.5, 0.2);
    expect(detectKickingLeg([middle, middle])).toBe('Right');
  });
});
