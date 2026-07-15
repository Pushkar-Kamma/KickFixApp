/**
 * Technique identity gate (Phase 0, M0.2) — fixes the mode-confusion bug where
 * a clean side kick scored as a decent front snap.
 *
 * ROOT CAUSE (confirmed): the three analyzers each estimate quality GIVEN the
 * technique, but nothing verified the technique identity. Front and side kicks
 * overlap on most quality criteria, so a side kick fed to the front-snap
 * analyzer lost only minor points.
 *
 * THIS MODULE estimates P(technique | motion) and separates RECOGNITION from
 * QUALITY. It never mutates a score. The camera layer uses the outcome to
 * accept / redirect / reject-with-retry.
 *
 * CORRECTNESS NOTES (from CV review):
 *  - Hip rotation reuses the app's existing Z-FREE image-hip-width foreshortening
 *    estimator (world-Z is unreliable exactly where rotation lives). Magnitude
 *    only (sign-invariant to kicking leg).
 *  - Distribution uses DIRECT NORMALIZATION (m_k / Σ m_j), NOT softmax over
 *    memberships (softmax over (0,1) values makes any ≥0.5 accept region tiny).
 *  - Every feature carries an observability flag; unobservable features are
 *    skipped, never scored as 0.
 *  - Motion dominantly toward/away from the camera → `unsupported_view`.
 *
 * ALL numeric thresholds here are PRIORS pending calibration on labeled clips
 * (collected in PRIORS below so tomorrow's calibration tunes numbers, not logic).
 */

import { J, PoseFrame, angle3D, mid, sub, norm } from './biomech';
import {
  GATE_PRIORS,
  GatePriors,
  KickTechniqueId,
  TechniqueFeature,
  TechniqueGateResult,
  TechniqueId,
  TechniqueMembership,
} from './primitives';

const VIS_MIN = 0.5;

/** Membership-shaping priors. PRIOR — calibrate; do not treat as validated. */
export const PRIORS = {
  hip: { frontC: 32, frontS: 10, sideC: 46, sideS: 10, roundC: 40, roundS: 14 },
  traj: { c: 0.45, s: 0.12, roundC: 0.42, roundS: 0.16 },
  shin: { c: 45, s: 13 }, // deg from horizontal: high = steep (front/side), low = horizontal (round)
  chamber: { c: 30, s: 12 },
  pivot: { frontC: 28, frontS: 14, sideC: 45, sideS: 22, roundC: 52, roundS: 20 },
  /** Below this total image-space foot travel, motion is toward/away camera. */
  minImageMotion: 0.06,
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const logistic = (x: number, c: number, s: number) => 1 / (1 + Math.exp(-(x - c) / s));
const bell = (x: number, c: number, s: number) => { const z = (x - c) / s; return Math.exp(-0.5 * z * z); };

function legJoints(leg: 'Left' | 'Right') {
  return leg === 'Left'
    ? { kHip: J.L_HIP, kKnee: J.L_KNEE, kAnkle: J.L_ANKLE, kHeel: J.L_HEEL, kFoot: J.L_FOOT_INDEX,
        sHip: J.R_HIP, sHeel: J.R_HEEL, sFoot: J.R_FOOT_INDEX }
    : { kHip: J.R_HIP, kKnee: J.R_KNEE, kAnkle: J.R_ANKLE, kHeel: J.R_HEEL, kFoot: J.R_FOOT_INDEX,
        sHip: J.L_HIP, sHeel: J.L_HEEL, sFoot: J.L_FOOT_INDEX };
}

function vis(frame: PoseFrame['image'], idx: number): number {
  return frame[idx]?.visibility ?? 0;
}

/** The discriminative feature ids that define identity coverage. */
export const DISCRIMINATIVE_FEATURES = [
  'hipRotationDeg', 'trajLateralRatio', 'shinFromHorizontalDeg', 'chamberAbductionDeg', 'supportPivotDeg',
] as const;

export interface FeatureExtraction {
  features: TechniqueFeature[];
  featureMap: Record<string, TechniqueFeature>;
  peakIdx: number;
  imageMotion: number;
}

/**
 * Extract identity features from a captured segment. Pure; no smoothing assumed
 * (caller may pass resampled/smoothed frames). Peak = highest kicking ankle
 * (min image-Y); features degrade to `observable: false` when landmarks are not
 * visible rather than throwing.
 */
export function extractTechniqueFeatures(frames: PoseFrame[], leg: 'Left' | 'Right'): FeatureExtraction {
  const ji = legJoints(leg);
  const N = frames.length;
  const mk = (id: string, value: number, observable: boolean, note?: string): TechniqueFeature =>
    ({ id, value: observable ? value : NaN, observable, note });

  if (N < 3) {
    const feats = DISCRIMINATIVE_FEATURES.map(id => mk(id, 0, false, 'too few frames'));
    const featureMap = Object.fromEntries(feats.map(f => [f.id, f]));
    return { features: feats, featureMap, peakIdx: 0, imageMotion: 0 };
  }

  // Per-frame image scalars.
  const ankleY: number[] = [];
  const hipWidth: number[] = [];
  const footX: number[] = [];
  const footY: number[] = [];
  const footVisible: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const im = frames[i].image;
    ankleY.push(im[ji.kAnkle]?.y ?? 1);
    hipWidth.push(Math.abs((im[J.L_HIP]?.x ?? 0) - (im[J.R_HIP]?.x ?? 0)));
    footX.push(im[ji.kFoot]?.x ?? 0);
    footY.push(im[ji.kFoot]?.y ?? 0);
    footVisible.push(vis(im, ji.kFoot) >= VIS_MIN);
  }

  // Peak = highest kicking ankle on screen (min image-Y).
  let peakIdx = 0, minY = Infinity;
  for (let i = 0; i < N; i++) if (ankleY[i] < minY) { minY = ankleY[i]; peakIdx = i; }

  const peak = frames[peakIdx];
  const pim = peak.image;

  // ── Feature 1: hip rotation (Z-FREE, reuse shipping estimator) ──
  // baseline = MAX hip width in first 25% (squared up); minPeak = MIN in ±3 around peak.
  // ratio = minPeak/baseline → acos → degrees of turn. Magnitude (0..90), sign-free.
  let hipRotationObs = false, hipRotationDeg = 0;
  {
    const baseHipVis = vis(pim, J.L_HIP) >= VIS_MIN && vis(pim, J.R_HIP) >= VIS_MIN;
    const baselineEnd = Math.max(1, Math.floor(N * 0.25));
    let baseline = 0;
    for (let i = 0; i < baselineEnd; i++) {
      if (vis(frames[i].image, J.L_HIP) >= VIS_MIN && vis(frames[i].image, J.R_HIP) >= VIS_MIN) {
        baseline = Math.max(baseline, hipWidth[i]);
      }
    }
    const lo = Math.max(0, peakIdx - 3), hi = Math.min(N - 1, peakIdx + 3);
    let minPeak = Infinity;
    for (let i = lo; i <= hi; i++) minPeak = Math.min(minPeak, hipWidth[i]);
    if (baseHipVis && baseline > 0.02 && isFinite(minPeak)) {
      const ratio = clamp01(minPeak / baseline);
      hipRotationDeg = (Math.acos(ratio) * 180) / Math.PI;
      hipRotationObs = true;
    }
  }

  // ── Feature 2: trajectory lateral ratio + total image motion of kicking foot ──
  let trajObs = false, trajLateralRatio = 0.5, imageMotion = 0;
  {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, count = 0;
    for (let i = 0; i < N; i++) {
      if (!footVisible[i]) continue;
      xMin = Math.min(xMin, footX[i]); xMax = Math.max(xMax, footX[i]);
      yMin = Math.min(yMin, footY[i]); yMax = Math.max(yMax, footY[i]);
      count++;
    }
    if (count >= Math.max(3, Math.floor(N * 0.3))) {
      const xr = xMax - xMin, yr = yMax - yMin;
      imageMotion = xr + yr;
      if (imageMotion > 1e-4) { trajLateralRatio = xr / imageMotion; trajObs = imageMotion >= PRIORS.minImageMotion; }
    }
  }

  // ── Feature 3: shin angle from horizontal at peak (image) ──
  let shinObs = false, shinFromHorizontalDeg = 0;
  {
    if (vis(pim, ji.kKnee) >= VIS_MIN && vis(pim, ji.kAnkle) >= VIS_MIN) {
      const dx = (pim[ji.kAnkle].x - pim[ji.kKnee].x);
      const dy = (pim[ji.kAnkle].y - pim[ji.kKnee].y);
      shinFromHorizontalDeg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI; // 0=horiz, 90=vert
      shinObs = true;
    }
  }

  // ── Feature 4: chamber abduction (thigh out-to-side at chamber, image) ──
  // chamber = min knee angle (world) before peak; abduction = thigh vector angle from vertical.
  // Only observable when a REAL flexion exists (a standing frame-0 minimum is NOT a chamber).
  let chamberObs = false, chamberAbductionDeg = 0;
  {
    let chamberIdx = -1, chamberMin = Infinity, chamberMax = -Infinity;
    for (let i = 0; i < peakIdx; i++) {
      const w = frames[i].world;
      if (!w[ji.kHip] || !w[ji.kKnee] || !w[ji.kAnkle]) continue;
      const ka = angle3D(w[ji.kHip], w[ji.kKnee], w[ji.kAnkle]);
      chamberMax = Math.max(chamberMax, ka);
      if (ka < chamberMin) { chamberMin = ka; chamberIdx = i; }
    }
    const realChamber = chamberIdx > 0 && isFinite(chamberMax) && (chamberMax - chamberMin) >= 15;
    const cim = realChamber ? frames[chamberIdx]?.image : undefined;
    if (cim && vis(cim, ji.kHip) >= VIS_MIN && vis(cim, ji.kKnee) >= VIS_MIN) {
      const dx = cim[ji.kKnee].x - cim[ji.kHip].x;
      const dy = cim[ji.kKnee].y - cim[ji.kHip].y;
      // angle from vertical: 0 = knee straight below/above hip, 90 = knee straight out to side.
      chamberAbductionDeg = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
      chamberObs = true;
    }
  }

  // ── Feature 5: support-foot pivot (jittery distal joints → low weight / often unobservable) ──
  let pivotObs = false, supportPivotDeg = 0;
  {
    const baseEnd = Math.max(1, Math.floor(N * 0.25));
    const heelVisAll = (i: number) => vis(frames[i].image, ji.sHeel) >= VIS_MIN && vis(frames[i].image, ji.sFoot) >= VIS_MIN;
    // baseline foot vector = average over first 25% visible frames
    let bx = 0, by = 0, bn = 0;
    for (let i = 0; i < baseEnd; i++) {
      if (!heelVisAll(i)) continue;
      const im = frames[i].image;
      bx += im[ji.sFoot].x - im[ji.sHeel].x; by += im[ji.sFoot].y - im[ji.sHeel].y; bn++;
    }
    if (bn > 0 && heelVisAll(peakIdx)) {
      const pfoot = frames[peakIdx].image;
      const px = pfoot[ji.sFoot].x - pfoot[ji.sHeel].x;
      const py = pfoot[ji.sFoot].y - pfoot[ji.sHeel].y;
      const a = { x: bx / bn, y: by / bn, z: 0 };
      const b = { x: px, y: py, z: 0 };
      const na = Math.hypot(a.x, a.y), nb = Math.hypot(b.x, b.y);
      if (na > 1e-3 && nb > 1e-3) {
        let cos = (a.x * b.x + a.y * b.y) / (na * nb);
        cos = Math.max(-1, Math.min(1, cos));
        supportPivotDeg = (Math.acos(cos) * 180) / Math.PI;
        pivotObs = true;
      }
    }
  }

  const features: TechniqueFeature[] = [
    mk('hipRotationDeg', hipRotationDeg, hipRotationObs),
    mk('trajLateralRatio', trajLateralRatio, trajObs, trajObs ? undefined : 'foot motion too small / toward camera'),
    mk('shinFromHorizontalDeg', shinFromHorizontalDeg, shinObs),
    mk('chamberAbductionDeg', chamberAbductionDeg, chamberObs),
    mk('supportPivotDeg', supportPivotDeg, pivotObs, pivotObs ? undefined : 'support foot not reliably tracked'),
  ];
  const featureMap = Object.fromEntries(features.map(f => [f.id, f]));
  return { features, featureMap, peakIdx, imageMotion };
}

/** Geometric mean of a technique's observable feature memberships. */
function membershipFor(tech: KickTechniqueId, fm: Record<string, TechniqueFeature>): number {
  const terms: number[] = [];
  const use = (f: TechniqueFeature | undefined, v: () => number) => { if (f?.observable) terms.push(clamp01(v())); };
  const hip = fm.hipRotationDeg, traj = fm.trajLateralRatio, shin = fm.shinFromHorizontalDeg,
    ch = fm.chamberAbductionDeg, piv = fm.supportPivotDeg;
  if (tech === 'front') {
    use(hip, () => 1 - logistic(hip.value, PRIORS.hip.frontC, PRIORS.hip.frontS));
    use(traj, () => 1 - logistic(traj.value, PRIORS.traj.c, PRIORS.traj.s));
    use(shin, () => logistic(shin.value, PRIORS.shin.c, PRIORS.shin.s));
    use(ch, () => 1 - logistic(ch.value, PRIORS.chamber.c, PRIORS.chamber.s));
    use(piv, () => 1 - logistic(piv.value, PRIORS.pivot.frontC, PRIORS.pivot.frontS));
  } else if (tech === 'side') {
    use(hip, () => logistic(hip.value, PRIORS.hip.sideC, PRIORS.hip.sideS));
    use(traj, () => logistic(traj.value, PRIORS.traj.c, PRIORS.traj.s));
    use(shin, () => logistic(shin.value, PRIORS.shin.c, PRIORS.shin.s));
    use(ch, () => logistic(ch.value, PRIORS.chamber.c, PRIORS.chamber.s));
    use(piv, () => bell(piv.value, PRIORS.pivot.sideC, PRIORS.pivot.sideS));
  } else { // round
    use(hip, () => bell(hip.value, PRIORS.hip.roundC, PRIORS.hip.roundS));
    use(traj, () => logistic(traj.value, PRIORS.traj.roundC, PRIORS.traj.roundS));
    use(shin, () => 1 - logistic(shin.value, PRIORS.shin.c, PRIORS.shin.s));
    use(ch, () => logistic(ch.value, PRIORS.chamber.c, PRIORS.chamber.s));
    use(piv, () => logistic(piv.value, PRIORS.pivot.roundC, PRIORS.pivot.roundS));
  }
  if (terms.length === 0) return 0;
  const logMean = terms.reduce((s, t) => s + Math.log(Math.max(1e-6, t)), 0) / terms.length;
  return Math.exp(logMean);
}

/**
 * Build the normalized distribution over {front, side, round, other}.
 * DIRECT normalization (not softmax). `other` absorbs the plausibility gap so
 * motion that fits nothing well pushes probability to the junk class.
 */
export function computeDistribution(featureMap: Record<string, TechniqueFeature>): TechniqueMembership[] {
  const mFront = membershipFor('front', featureMap);
  const mSide = membershipFor('side', featureMap);
  const mRound = membershipFor('round', featureMap);
  const best = Math.max(mFront, mSide, mRound);
  const mOther = clamp01(1 - best);
  const raw: [TechniqueId, number][] = [['front', mFront], ['side', mSide], ['round', mRound], ['other', mOther]];
  const sum = raw.reduce((s, [, v]) => s + v, 0) || 1;
  return raw.map(([technique, v]) => ({ technique, probability: v / sum }));
}

/** Coverage = fraction of discriminative features that were observable. */
export function computeCoverage(featureMap: Record<string, TechniqueFeature>): number {
  let obs = 0;
  for (const id of DISCRIMINATIVE_FEATURES) if (featureMap[id]?.observable) obs++;
  return obs / DISCRIMINATIVE_FEATURES.length;
}

/** Decide the gate outcome from a distribution + coverage. Pure & unit-testable. */
export function decideGate(
  requested: KickTechniqueId,
  distribution: TechniqueMembership[],
  coverage: number,
  imageMotion: number,
  priors: GatePriors = GATE_PRIORS,
): Omit<TechniqueGateResult, 'features' | 'distribution' | 'requested'> {
  const sorted = [...distribution].sort((a, b) => b.probability - a.probability);
  const top = sorted[0];
  const second = sorted[1];
  const confidence = top?.probability ?? 0;
  const margin = (top?.probability ?? 0) - (second?.probability ?? 0);

  // Motion dominantly toward/away from camera → cannot judge a kick honestly.
  if (imageMotion > 0 && imageMotion < PRIORS.minImageMotion) {
    return { detected: null, outcome: 'unsupported_view', confidence, margin, coverage,
      reason: 'The kick moved mostly toward the camera — stand side-on so the motion is visible.' };
  }
  if (coverage < priors.minCoverage) {
    return { detected: null, outcome: 'uncertain', confidence, margin, coverage,
      reason: 'Not enough of your body was visible to identify the kick. Step back and keep your full body in frame.' };
  }
  if (top.technique === 'other' || confidence < priors.tauAccept || margin < priors.minMargin) {
    return { detected: top.technique === 'other' ? 'other' : null, outcome: 'uncertain', confidence, margin, coverage,
      reason: 'Couldn\'t clearly recognize the kick. Face the camera side-on and perform one clean kick.' };
  }
  if (top.technique === requested) {
    return { detected: top.technique, outcome: 'accept', confidence, margin, coverage,
      reason: 'Recognized.' };
  }
  const label: Record<string, string> = { front: 'Front Snap', side: 'Side Kick', round: 'Roundhouse' };
  return { detected: top.technique, outcome: 'redirect', confidence, margin, coverage,
    reason: `That looked like a ${label[top.technique] ?? top.technique}. Score it as ${label[top.technique] ?? top.technique}?` };
}

/**
 * Full technique-gate pipeline: extract features → distribution → coverage →
 * decision. `frames` should already be resampled/smoothed by the caller for
 * best results, but the gate is robust to raw buffers too.
 */
export function runTechniqueGate(
  frames: PoseFrame[],
  requested: KickTechniqueId,
  leg: 'Left' | 'Right',
  priors: GatePriors = GATE_PRIORS,
): TechniqueGateResult {
  const { features, featureMap, imageMotion } = extractTechniqueFeatures(frames, leg);
  const distribution = computeDistribution(featureMap);
  const coverage = computeCoverage(featureMap);
  const decision = decideGate(requested, distribution, coverage, imageMotion, priors);
  return { requested, distribution, features, ...decision };
}
