/**
 * Unit tests for signal conditioning (filters.ts): One-Euro smoothing and
 * fixed-Δt resampling. Pure functions, no device needed.
 */

import { smoothScalar, resamplePoseFrames, DEFAULT_ONE_EURO } from '../src/engine/filters';
import type { Landmark, PoseFrame } from '../src/engine/biomech';

const L = (x: number, y: number, z = 0, vis = 1, pres = 1): Landmark => ({ x, y, z, visibility: vis, presence: pres });
function frame33(overrides: Record<number, Landmark>, t: number): PoseFrame {
  const img: Landmark[] = [];
  for (let i = 0; i < 33; i++) img.push(overrides[i] ?? L(0.5, 0.5));
  return { image: img, world: img.map(p => ({ ...p })), t };
}

describe('smoothScalar (One-Euro)', () => {
  it('returns empty for empty input', () => {
    expect(smoothScalar([], [])).toEqual([]);
  });
  it('preserves length', () => {
    const out = smoothScalar([1, 2, 3, 4], [0, 33, 66, 99]);
    expect(out).toHaveLength(4);
  });
  it('leaves a constant signal unchanged', () => {
    const out = smoothScalar([5, 5, 5, 5], [0, 16, 32, 48]);
    out.forEach(v => expect(v).toBeCloseTo(5, 6));
  });
  it('first sample equals the input (no phantom lead-in)', () => {
    const out = smoothScalar([7, 9, 11], [0, 16, 32]);
    expect(out[0]).toBe(7);
  });
  it('reduces variance of a noisy signal', () => {
    const times = Array.from({ length: 40 }, (_, i) => i * 16);
    const noisy = times.map((_, i) => 10 + (i % 2 === 0 ? 3 : -3)); // ±3 sawtooth
    const sm = smoothScalar(noisy, times, DEFAULT_ONE_EURO);
    const varOf = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length; };
    expect(varOf(sm.slice(5))).toBeLessThan(varOf(noisy.slice(5)));
  });
});

describe('resamplePoseFrames', () => {
  it('returns a copy for fewer than 2 frames', () => {
    const f = [frame33({}, 0)];
    expect(resamplePoseFrames(f)).toHaveLength(1);
  });
  it('produces uniform Δt spacing rebased to 0', () => {
    const frames = [frame33({ 0: L(0, 0) }, 0), frame33({ 0: L(1, 0) }, 100), frame33({ 0: L(3, 0) }, 300)];
    const out = resamplePoseFrames(frames, 100); // dt = 10ms
    expect(out[0].t).toBeCloseTo(0, 6);
    expect(out[1].t - out[0].t).toBeCloseTo(10, 6);
    expect(out[out.length - 1].t).toBeLessThanOrEqual(300);
  });
  it('linearly interpolates landmark coordinates', () => {
    // landmark 0 x moves 0 -> 1 over t=0..100, so at t=50 x≈0.5
    const frames = [frame33({ 0: L(0, 0) }, 0), frame33({ 0: L(1, 0) }, 100)];
    const out = resamplePoseFrames(frames, 100);
    const at50 = out.find(f => Math.abs(f.t - 50) < 1e-6);
    expect(at50).toBeDefined();
    expect(at50!.image[0].x).toBeCloseTo(0.5, 4);
  });
});

describe('smoothScalar edge cases', () => {
  it('never produces NaN when timestamps do not advance (dt<=0)', () => {
    const out = smoothScalar([1, 2, 3], [0, 0, 0]);
    out.forEach(v => expect(Number.isNaN(v)).toBe(false));
  });
  it('follows a step change toward the new level without overshooting', () => {
    const times = Array.from({ length: 30 }, (_, i) => i * 16);
    const step = times.map((_, i) => (i < 15 ? 0 : 10));
    const sm = smoothScalar(step, times);
    expect(sm[sm.length - 1]).toBeGreaterThan(sm[15]);
    expect(sm[sm.length - 1]).toBeLessThanOrEqual(10);
  });
});
