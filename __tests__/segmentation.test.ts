/**
 * Unit tests for 5-phase kick segmentation (segmentation.ts).
 * Synthetic kicks exercise the normal path and the degenerate fallbacks
 * (no chamber, low kick).
 */

import { segmentKick, PhaseName } from '../src/engine/segmentation';
import { J } from '../src/engine/biomech';
import type { Landmark, PoseFrame } from '../src/engine/biomech';

const W = (x: number, y: number, z = 0): Landmark => ({ x, y, z, visibility: 1, presence: 1 });

/** Knee-flexion angle profile with a clear chamber (max bend) near frame 6. */
function phiChamber(i: number): number {
  if (i <= 3) return 8;
  if (i <= 6) return 8 + (85 - 8) * ((i - 3) / 3);
  if (i <= 9) return 85 - (85 - 10) * ((i - 6) / 3);
  if (i <= 15) return 10 + (50 - 10) * ((i - 9) / 6);
  return 50 - (50 - 15) * ((i - 15) / 8);
}
/** Nearly-straight knee throughout → no real chamber flexion. */
const phiFlat = (): number => 8;

/** Kicking foot travels out along X with a raised-cosine (speed peaks ~frame 9). */
function footX(i: number): number {
  const u = Math.max(0, Math.min(1, (i - 3) / 12));
  return 0.5 * (1 - Math.cos(Math.PI * u));
}

function buildKick(opts: { phi: (i: number) => number; lowKick?: boolean; N?: number }): PoseFrame[] {
  const N = opts.N ?? 24;
  const frames: PoseFrame[] = [];
  for (let i = 0; i < N; i++) {
    const rad = (opts.phi(i) * Math.PI) / 180;
    const world: Landmark[] = [];
    for (let k = 0; k < 33; k++) world.push(W(0, 0, 0));
    world[J.R_HIP] = W(0, -1, 0);
    world[J.R_KNEE] = W(0, 0, 0);
    world[J.R_ANKLE] = W(Math.sin(rad), Math.cos(rad), 0); // knee angle = 180 - phi
    world[J.R_FOOT_INDEX] = W(footX(i), 0, 0);             // x-travel drives foot speed

    const image: Landmark[] = [];
    for (let k = 0; k < 33; k++) image.push(W(0.5, 0.5, 0));
    const ankleY = opts.lowKick ? 0.8 : 0.7 - 0.28 * (1 - Math.abs(i - 9) / 9);
    image[J.R_ANKLE] = W(0.5, ankleY, 0);
    frames.push({ image, world, t: i * 16 });
  }
  return frames;
}

const ORDER: PhaseName[] = ['onset', 'chamber', 'extension', 'retraction', 'recovery'];

describe('segmentKick', () => {
  it('returns five phases in canonical order with non-decreasing indices', () => {
    const seg = segmentKick(buildKick({ phi: phiChamber }), 'Right');
    expect(seg.phases.map(p => p.name)).toEqual(ORDER);
    for (let i = 1; i < seg.phases.length; i++) {
      expect(seg.phases[i].startIdx).toBeGreaterThanOrEqual(seg.phases[i - 1].startIdx);
    }
    seg.phases.forEach(p => {
      expect(p.startIdx).toBeGreaterThanOrEqual(0);
      expect(p.endIdx).toBeLessThanOrEqual(23);
      expect(p.startMs).toBeGreaterThanOrEqual(0);
    });
  });

  it('locates a real chamber and orders it before extension', () => {
    const seg = segmentKick(buildKick({ phi: phiChamber }), 'Right');
    expect(seg.chamberIdx).not.toBeNull();
    expect(seg.chamberIdx!).toBeGreaterThan(0);
    expect(seg.extensionIdx).toBeGreaterThanOrEqual(seg.chamberIdx!);
    const chamberPhase = seg.phases.find(p => p.name === 'chamber')!;
    expect(chamberPhase.observable).toBe(true);
  });

  it('marks chamber UNOBSERVABLE when the knee never really flexes', () => {
    const seg = segmentKick(buildKick({ phi: phiFlat }), 'Right');
    expect(seg.chamberIdx).toBeNull();
    expect(seg.fallbacks.join(' ')).toMatch(/chamber/i);
    expect(seg.phases.find(p => p.name === 'chamber')!.observable).toBe(false);
  });

  it('detects a LOW kick (ankle never rises above the hip) via foot speed', () => {
    const seg = segmentKick(buildKick({ phi: phiChamber, lowKick: true }), 'Right');
    expect(seg.fallbacks.join(' ')).toMatch(/low kick/i);
    // Extension still found from the foot-speed extremum.
    expect(seg.extensionIdx).toBeGreaterThan(0);
  });

  it('produces phases that tile without gaps or overlaps', () => {
    const seg = segmentKick(buildKick({ phi: phiChamber }), 'Right');
    for (let i = 1; i < seg.phases.length; i++) {
      expect(seg.phases[i].startIdx).toBe(seg.phases[i - 1].endIdx);
    }
  });

  it('handles too-few-frames without throwing', () => {
    const seg = segmentKick(buildKick({ phi: phiChamber, N: 2 }), 'Right');
    expect(seg.phases.length).toBeGreaterThanOrEqual(1);
  });
});
