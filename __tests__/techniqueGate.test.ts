/**
 * Unit tests for the technique identity gate (techniqueGate.ts).
 *
 * These lock in the MACHINERY and the bug-fix behavior (a side-like motion
 * requested as a front snap must NOT be accepted) without asserting exact
 * classifications on real data — those thresholds are calibrated separately.
 */

import {
  computeDistribution, computeCoverage, decideGate, extractTechniqueFeatures, runTechniqueGate,
} from '../src/engine/techniqueGate';
import type { TechniqueFeature, TechniqueMembership } from '../src/engine/primitives';
import { J } from '../src/engine/biomech';
import type { Landmark, PoseFrame } from '../src/engine/biomech';

const feat = (id: string, value: number, observable = true): TechniqueFeature => ({ id, value, observable });
const fmap = (arr: TechniqueFeature[]) => Object.fromEntries(arr.map(f => [f.id, f])) as Record<string, TechniqueFeature>;
const sortDesc = (d: TechniqueMembership[]) => [...d].sort((a, b) => b.probability - a.probability);

describe('computeDistribution', () => {
  it('always sums to 1', () => {
    const d = computeDistribution(fmap([
      feat('hipRotationDeg', 40), feat('trajLateralRatio', 0.5), feat('shinFromHorizontalDeg', 45),
      feat('chamberAbductionDeg', 30), feat('supportPivotDeg', 30),
    ]));
    expect(d.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1, 6);
  });
  it('ranks a rotated, lateral motion as a side kick over a front snap', () => {
    const d = computeDistribution(fmap([
      feat('hipRotationDeg', 78), feat('trajLateralRatio', 0.82), feat('shinFromHorizontalDeg', 70),
      feat('chamberAbductionDeg', 60), feat('supportPivotDeg', 42),
    ]));
    const top = sortDesc(d)[0];
    expect(top.technique).toBe('side');
    const front = d.find(x => x.technique === 'front')!;
    const side = d.find(x => x.technique === 'side')!;
    expect(side.probability).toBeGreaterThan(front.probability);
  });
  it('ranks a square-hipped, vertical motion as a front snap over a side kick', () => {
    const d = computeDistribution(fmap([
      feat('hipRotationDeg', 8), feat('trajLateralRatio', 0.12), feat('shinFromHorizontalDeg', 78),
      feat('chamberAbductionDeg', 10), feat('supportPivotDeg', 5),
    ]));
    const top = sortDesc(d)[0];
    expect(top.technique).toBe('front');
  });
  it('skips unobservable features (still returns a valid distribution)', () => {
    const d = computeDistribution(fmap([
      feat('hipRotationDeg', 70), feat('trajLateralRatio', 0.8, false),
      feat('shinFromHorizontalDeg', 45, false), feat('chamberAbductionDeg', 30, false),
      feat('supportPivotDeg', 30, false),
    ]));
    expect(d.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1, 6);
  });
});

describe('computeCoverage', () => {
  it('is the fraction of observable discriminative features', () => {
    expect(computeCoverage(fmap([
      feat('hipRotationDeg', 40), feat('trajLateralRatio', 0.5),
      feat('shinFromHorizontalDeg', 45, false), feat('chamberAbductionDeg', 30, false),
      feat('supportPivotDeg', 30, false),
    ]))).toBeCloseTo(2 / 5, 6);
  });
});

describe('decideGate', () => {
  const dist = (front: number, side: number, round: number, other: number): TechniqueMembership[] => ([
    { technique: 'front', probability: front }, { technique: 'side', probability: side },
    { technique: 'round', probability: round }, { technique: 'other', probability: other },
  ]);

  it('REDIRECTS when a different technique dominates (the mode-confusion fix)', () => {
    const r = decideGate('front', dist(0.2, 0.6, 0.15, 0.05), 1.0, 0.3);
    expect(r.outcome).toBe('redirect');
    expect(r.detected).toBe('side');
  });
  it('ACCEPTS when the requested technique dominates with margin', () => {
    const r = decideGate('front', dist(0.7, 0.15, 0.1, 0.05), 1.0, 0.3);
    expect(r.outcome).toBe('accept');
    expect(r.detected).toBe('front');
  });
  it('is UNCERTAIN when coverage is too low', () => {
    const r = decideGate('front', dist(0.7, 0.15, 0.1, 0.05), 0.2, 0.3);
    expect(r.outcome).toBe('uncertain');
  });
  it('is UNCERTAIN when the margin is too small', () => {
    const r = decideGate('front', dist(0.4, 0.36, 0.14, 0.1), 1.0, 0.3);
    expect(r.outcome).toBe('uncertain');
  });
  it('is UNCERTAIN when junk (other) wins', () => {
    const r = decideGate('front', dist(0.25, 0.15, 0.1, 0.5), 1.0, 0.3);
    expect(r.outcome).toBe('uncertain');
    expect(r.detected).toBe('other');
  });
  it('flags UNSUPPORTED_VIEW when motion is mostly toward the camera', () => {
    const r = decideGate('front', dist(0.7, 0.15, 0.1, 0.05), 1.0, 0.02);
    expect(r.outcome).toBe('unsupported_view');
  });
});

/* ── Synthetic frame builders for end-to-end extraction ── */
const P = (x: number, y: number, vis = 1): Landmark => ({ x, y, z: 0, visibility: vis, presence: 1 });
function buildFrames(n: number, peak: number, spec: (i: number, p: number) => Record<number, Landmark>): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let i = 0; i < n; i++) {
    const img: Landmark[] = [];
    for (let k = 0; k < 33; k++) img.push(P(0.5, 0.5));
    const ov = spec(i, peak);
    for (const [idx, lm] of Object.entries(ov)) img[+idx] = lm;
    frames.push({ image: img, world: img.map(p => ({ ...p })), t: i * 16 });
  }
  return frames;
}

describe('extractTechniqueFeatures', () => {
  it('returns all five discriminative features', () => {
    const frames = buildFrames(20, 12, () => ({}));
    const { features } = extractTechniqueFeatures(frames, 'Right');
    expect(features.map(f => f.id).sort()).toEqual(
      ['chamberAbductionDeg', 'hipRotationDeg', 'shinFromHorizontalDeg', 'supportPivotDeg', 'trajLateralRatio'],
    );
  });
});

describe('runTechniqueGate — bug-fix behavior', () => {
  // A rotated, laterally-travelling kick (side-kick-like): hips narrow toward
  // the peak (rotation) and the kicking foot travels sideways in the image.
  const sideLike = () => buildFrames(20, 12, (i) => {
    const toPeak = Math.min(1, i / 12);
    const hw = i < 5 ? 0.30 : 0.30 - 0.20 * Math.min(1, (i - 5) / 7); // shrinks to ~0.10
    const cx = 0.5;
    const footX = 0.5 + 0.35 * toPeak;   // large lateral travel
    const footY = 0.6 - 0.15 * toPeak;   // small vertical travel
    const ankleY = 0.70 - 0.28 * (i <= 12 ? i / 12 : (24 - i) / 12);
    return {
      [J.L_HIP]: P(cx - hw / 2, 0.5),
      [J.R_HIP]: P(cx + hw / 2, 0.5),
      [J.R_KNEE]: P(0.62, 0.5),
      [J.R_ANKLE]: P(0.5 + 0.30 * toPeak, ankleY),
      [J.R_FOOT_INDEX]: P(footX, footY),
    };
  });

  it('does NOT accept a side-like kick when the user selected Front Snap', () => {
    const res = runTechniqueGate(sideLike(), 'front', 'Right');
    expect(res.outcome).not.toBe('accept');
    expect(res.detected).not.toBe('front');
  });
  it('does not wrongly redirect a side-like kick away from Side', () => {
    const res = runTechniqueGate(sideLike(), 'side', 'Right');
    expect(res.outcome).not.toBe('redirect');
  });
});
