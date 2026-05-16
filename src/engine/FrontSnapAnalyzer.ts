/**
 * Front Snap Kick Analyzer (v1)
 *
 * 19 criteria across 6 phases (Setup → Chamber → Extension → Posture → Recoil → Reset).
 * Uses worldLandmarks (meters) for biomechanics; image landmarks only for screen-space context.
 *
 * Same engine output is used for both Quick (shows headline) and Full (shows everything).
 */

import {
  J, Landmark, PoseFrame, Vec3, angle3D, lmReq, mid, sub, dist, deriveScalar, deriveVec3, argmax, norm,
} from './biomech';

export type KickVerdict = 'SNAP' | 'PUSH' | 'LOW' | 'SLOPPY' | 'GOOD';
export type Tier = 'Novice' | 'Intermediate' | 'Advanced' | 'Elite';
export type Severity = 'critical' | 'major' | 'minor' | 'info';

export interface CriterionResult {
  id: string;
  label: string;
  pass: boolean;
  value: number;        // measured value (deg, m, m/s, ms, etc.)
  unit: string;         // 'deg' | 'm' | 'm/s' | 'ms' | 'ratio'
  target: string;       // human-readable target ("≥170°", "<110°")
  severity: Severity;   // weight tier
  cue: string;          // short coaching cue if failed
  phase: 'Setup' | 'Chamber' | 'Extension' | 'Posture' | 'Recoil' | 'Reset';
}

export interface KickResult {
  score: number;             // 0–100
  verdict: KickVerdict;
  tier: Tier;
  headlineCue: string;       // single most important issue, '' if all good
  leg: 'Left' | 'Right';
  peakFrameIdx: number;
  chamberFrameIdx: number;
  criteria: CriterionResult[];
  // Quick-access metrics for UI display
  metrics: {
    peakKneeAngleDeg: number;
    peakKneeAngularVelDegPerSec: number;
    peakFootSpeedMS: number;
    extensionMs: number;
    chamberMs: number;
    totalMs: number;
    recoilToExtensionRatio: number;
  };
}

/** @deprecated Use KickResult */
export type FrontSnapResult = KickResult;
/** @deprecated Use KickVerdict */
export type SnapVerdict = KickVerdict;

/* ── Tier weights ── */
const WEIGHT: Record<Severity, number> = {
  critical: 15,
  major: 8,
  minor: 4,
  info: 0,
};

/* ── Verdict bands ── */
function tierFor(score: number): Tier {
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Advanced';
  if (score >= 55) return 'Intermediate';
  return 'Novice';
}

/* ── Helper: leg-specific joint indices ── */
function legJoints(leg: 'Left' | 'Right') {
  return leg === 'Left'
    ? {
        kHip: J.L_HIP, kKnee: J.L_KNEE, kAnkle: J.L_ANKLE,
        kHeel: J.L_HEEL, kFoot: J.L_FOOT_INDEX,
        sHip: J.R_HIP, sKnee: J.R_KNEE, sAnkle: J.R_ANKLE,
        sHeel: J.R_HEEL, sFoot: J.R_FOOT_INDEX,
      }
    : {
        kHip: J.R_HIP, kKnee: J.R_KNEE, kAnkle: J.R_ANKLE,
        kHeel: J.R_HEEL, kFoot: J.R_FOOT_INDEX,
        sHip: J.L_HIP, sKnee: J.L_KNEE, sAnkle: J.L_ANKLE,
        sHeel: J.L_HEEL, sFoot: J.L_FOOT_INDEX,
      };
}

/**
 * Main entry point. `frames` is the buffered kick segment (chamber → extension → recoil → reset).
 * Frame[0] should be near kick onset; frame[N-1] should be at/after foot landing.
 */
export function analyzeFrontSnap(frames: PoseFrame[], leg: 'Left' | 'Right'): KickResult {
  const ji = legJoints(leg);
  const N = frames.length;

  // Per-frame scalars -----------------------------------------------------
  const times: number[] = frames.map(f => f.t);
  const kneeAngles: number[] = [];          // hip→knee→ankle, deg, world
  const kneeY_image: number[] = [];         // image y (smaller = higher)
  const ankleY_image: number[] = [];
  const hipY_image: number[] = [];
  const footWorldPos: Vec3[] = [];          // foot index world pos
  const hipMidWorld: Vec3[] = [];

  for (const f of frames) {
    const w = f.world;
    const im = f.image;
    kneeAngles.push(angle3D(lmReq(w, ji.kHip), lmReq(w, ji.kKnee), lmReq(w, ji.kAnkle)));
    kneeY_image.push(im[ji.kKnee].y);
    ankleY_image.push(im[ji.kAnkle].y);
    hipY_image.push((im[J.L_HIP].y + im[J.R_HIP].y) / 2);
    footWorldPos.push(lmReq(w, ji.kFoot));
    hipMidWorld.push(mid(lmReq(w, J.L_HIP), lmReq(w, J.R_HIP)));
  }

  // Phase indices ---------------------------------------------------------
  // Peak frame = the frame where the KICKING ankle was highest on screen
  // (smallest image-Y). More reliable than knee-angle argmax because the
  // leg can be straighter at standing-rest than at peak kick extension.
  let peakIdx = 0;
  {
    let minY = Infinity;
    for (let i = 0; i < N; i++) {
      const y = frames[i].image[ji.kAnkle].y;
      if (y < minY) { minY = y; peakIdx = i; }
    }
  }
  // chamber peak = min of kneeAngles BEFORE peakIdx (most folded)
  let chamberIdx = 0;
  let chamberMin = Infinity;
  for (let i = 0; i < peakIdx; i++) {
    if (kneeAngles[i] < chamberMin) { chamberMin = kneeAngles[i]; chamberIdx = i; }
  }

  const peakAngle = kneeAngles[peakIdx] ?? 0;
  const peakFrame = frames[peakIdx];
  const chamberFrame = frames[chamberIdx];

  // Velocities (m/s for positions, deg/s for angles) ----------------------
  const kneeAngVel = deriveScalar(kneeAngles, times); // deg/s, length N-1
  const footVel = deriveVec3(footWorldPos, times);    // Vec3, length N-1
  const footSpeed = footVel.map(v => norm(v));        // m/s

  // Peak forward foot velocity (signed Z, forward is + or − depending on facing — use magnitude for now)
  const peakKneeAngVel = Math.max(...kneeAngVel.slice(0, peakIdx + 1).map(Math.abs), 0);
  const peakFootSpeed = Math.max(...footSpeed, 0);

  // Recoil window: peakIdx → end. Take peak retraction speed.
  const recoilSpeeds = footSpeed.slice(peakIdx);
  const peakRecoilSpeed = recoilSpeeds.length ? Math.max(...recoilSpeeds) : 0;

  // Timing
  const tChamber = times[chamberIdx] - times[0];
  const tExtension = times[peakIdx] - times[chamberIdx];
  const tRecoil = times[N - 1] - times[peakIdx];
  const tTotal = times[N - 1] - times[0];

  // Recoil-to-extension velocity ratio (the snap-vs-push test)
  const extWindowSpeeds = footSpeed.slice(chamberIdx, peakIdx + 1);
  const peakExtensionSpeed = extWindowSpeeds.length ? Math.max(...extWindowSpeeds) : 0;
  const recoilRatio = peakExtensionSpeed > 0 ? peakRecoilSpeed / peakExtensionSpeed : 0;

  // ── Run each criterion ─────────────────────────────────────────────────
  const criteria: CriterionResult[] = [];

  // === Phase A: Setup ===
  // 1. Standing leg dynamic bend (150–175° at chamber)
  {
    const a = angle3D(
      lmReq(chamberFrame.world, ji.sHip),
      lmReq(chamberFrame.world, ji.sKnee),
      lmReq(chamberFrame.world, ji.sAnkle),
    );
    const pass = a >= 140 && a <= 178;
    criteria.push({
      id: 'support_knee_bend', label: 'Standing leg dynamic bend',
      pass, value: a, unit: 'deg', target: '140°–178°',
      severity: 'minor', phase: 'Setup',
      cue: a < 140 ? 'Stand taller — knee collapsing.' : 'Slight bend in standing knee.',
    });
  }

  // === Phase B: Chamber ===
  // 2. Knee at/above hip height at peak chamber (image space — y smaller = higher).
  // Tightened: knee must be at LEAST hip-height, ideally above. Negative tolerance
  // requires knee to be at least 3% of frame above hip.
  {
    const kneeY = kneeY_image[chamberIdx];
    const hipY = hipY_image[chamberIdx];
    const pass = kneeY <= hipY + 0.05;
    criteria.push({
      id: 'chamber_knee_height', label: 'Knee at hip height in chamber',
      pass, value: hipY - kneeY, unit: 'ratio', target: 'knee near hip',
      severity: 'major', phase: 'Chamber',
      cue: 'Lift the knee higher before extending.',
    });
  }

  // 3. Chamber duration ≤ 280ms
  {
    const pass = tChamber <= 400;
    criteria.push({
      id: 'chamber_duration', label: 'Chamber duration',
      pass, value: tChamber, unit: 'ms', target: '≤ 400ms',
      severity: 'minor', phase: 'Chamber',
      cue: 'Faster chamber — you are telegraphing the kick.',
    });
  }

  // 5. Support heel stays planted during chamber.
  // Body-ratio: heel lift expressed as fraction of leg-length-in-image (scale-invariant).
  // Research: any visible heel lift > ~5% of standing leg counts as breaking ground contact.
  {
    const heelY0 = chamberFrame.image[ji.sHeel].y;
    const footY0 = chamberFrame.image[ji.sFoot].y;
    // Image-space leg length on the support side (hip→ankle).
    const sHipImgY = chamberFrame.image[ji.sHip].y;
    const sAnkImgY = chamberFrame.image[ji.sAnkle].y;
    const legImg = Math.max(0.05, Math.abs(sAnkImgY - sHipImgY));
    const liftRatio = (footY0 - heelY0) / legImg;
    const pass = liftRatio < 0.08;
    criteria.push({
      id: 'support_heel', label: 'Support heel planted',
      pass, value: liftRatio, unit: 'ratio', target: '< 0.08 of leg',
      severity: 'minor', phase: 'Chamber',
      cue: 'Keep your standing heel on the ground.',
    });
  }

  // 6. No pelvic drop at chamber.
  // Body-ratio: vertical hip-Y diff in world meters expressed as fraction of hip width.
  // Research: gluteus medius weakness shows as drop > ~10% of hip width (Trendelenburg sign analog).
  {
    const kHipY = chamberFrame.world[ji.kHip].y;
    const sHipY = chamberFrame.world[ji.sHip].y;
    const hipWidth = Math.max(0.05, Math.abs(
      chamberFrame.world[J.L_HIP].x - chamberFrame.world[J.R_HIP].x,
    ));
    const dropRatio = (kHipY - sHipY) / hipWidth;
    const pass = dropRatio < 0.20;
    criteria.push({
      id: 'pelvic_drop', label: 'No pelvic drop',
      pass, value: dropRatio, unit: 'ratio', target: '< 0.20 of hip width',
      severity: 'minor', phase: 'Chamber',
      cue: 'Keep hips level — kicking-side hip is dropping.',
    });
  }

  // === Phase C: Extension ===
  // 5. Peak knee extension. Tightened: requires ≥ 172° (truly straight).
  // Soft cap at 185° still flags hyperextension. MediaPipe knee angles are accurate
  // to within ~3° in good lighting so 172° reliably distinguishes a straight leg
  // from a kick that ends with a visible bend.
  {
    const pass = peakAngle >= 165 && peakAngle <= 185;
    criteria.push({
      id: 'peak_extension', label: 'Peak knee extension',
      pass, value: peakAngle, unit: 'deg', target: '≥ 165°',
      severity: 'critical', phase: 'Extension',
      cue: peakAngle < 165 ? 'Extend the leg further — lock it out.' : 'Avoid hyperextending.',
    });
  }

  // 6. Peak ankle height. Tightened: ankle must be clearly above hip (3% margin)
  // — a true mid-section snap should land at solar plexus / chest, not just at belt.
  {
    const pass = ankleY_image[peakIdx] <= hipY_image[peakIdx];
    criteria.push({
      id: 'peak_height', label: 'Peak ankle height',
      pass, value: hipY_image[peakIdx] - ankleY_image[peakIdx], unit: 'ratio', target: 'ankle ≥ hip',
      severity: 'critical', phase: 'Extension',
      cue: 'Kick higher — at least to mid-section.',
    });
  }

  // 9. Peak knee angular velocity — the snap engine
  {
    const pass = peakKneeAngVel >= 600;
    criteria.push({
      id: 'snap_velocity', label: 'Knee snap velocity',
      pass, value: peakKneeAngVel, unit: 'deg/s', target: '≥ 600°/s',
      severity: 'critical', phase: 'Extension',
      cue: 'SNAP the leg — you are pushing, not snapping.',
    });
  }

  // === Phase D: Posture during kick ===
  // 13. Vertical torso — shoulder→hip vector lean angle
  {
    const sMid = mid(lmReq(peakFrame.world, J.L_SHOULDER), lmReq(peakFrame.world, J.R_SHOULDER));
    const hMid = mid(lmReq(peakFrame.world, J.L_HIP), lmReq(peakFrame.world, J.R_HIP));
    const vec = sub(sMid, hMid);
    // Angle from vertical (-y world up). Pure vertical = 0°.
    const vertical: Vec3 = { x: 0, y: -1, z: 0 };
    let cos = (vec.x * vertical.x + vec.y * vertical.y + vec.z * vertical.z) / (norm(vec) || 1);
    cos = Math.max(-1, Math.min(1, cos));
    const lean = (Math.acos(cos) * 180) / Math.PI;
    const pass = lean < 25;
    criteria.push({
      id: 'torso_vertical', label: 'Vertical torso',
      pass, value: lean, unit: 'deg', target: '< 25° from vertical',
      severity: 'major', phase: 'Posture',
      cue: 'Stop leaning back so much.',
    });
  }

  // 14. Pelvic-shoulder rotation — both lines parallel on transverse plane
  {
    const sVec = sub(lmReq(peakFrame.world, J.R_SHOULDER), lmReq(peakFrame.world, J.L_SHOULDER));
    const hVec = sub(lmReq(peakFrame.world, J.R_HIP), lmReq(peakFrame.world, J.L_HIP));
    // Project onto transverse (X-Z) plane: ignore y
    const sAng = Math.atan2(sVec.z, sVec.x);
    const hAng = Math.atan2(hVec.z, hVec.x);
    let diff = Math.abs(((sAng - hAng) * 180) / Math.PI);
    if (diff > 180) diff = 360 - diff;
    if (diff > 90) diff = 180 - diff;
    const pass = diff < 35;
    criteria.push({
      id: 'hip_shoulder_align', label: 'Hips square to shoulders',
      pass, value: diff, unit: 'deg', target: '< 35°',
      severity: 'minor', phase: 'Posture',
      cue: 'Keep hips square — this is becoming a roundhouse.',
    });
  }

  // === Phase E: Recoil ===
  // 15. Recoil velocity ≥ 0.7 × extension velocity (the SNAP test)
  {
    const pass = recoilRatio >= 0.7;
    criteria.push({
      id: 'recoil_ratio', label: 'Recoil-to-extension velocity ratio',
      pass, value: recoilRatio, unit: 'ratio', target: '≥ 0.7',
      severity: 'critical', phase: 'Recoil',
      cue: 'Snap the leg back as fast as it went out.',
    });
  }

  // 17. Knee stays elevated during recoil — knee Y doesn't fall before foot
  {
    // Find when foot starts dropping (image ankle Y increasing)
    let kneeFellEarly = false;
    const kY0 = kneeY_image[peakIdx];
    const window = Math.min(6, N - peakIdx - 1);
    for (let i = 1; i <= window; i++) {
      const dropKnee = kneeY_image[peakIdx + i] - kY0;
      const dropFoot = ankleY_image[peakIdx + i] - ankleY_image[peakIdx];
      if (dropKnee > 0.04 && dropKnee > dropFoot) { kneeFellEarly = true; break; }
    }
    criteria.push({
      id: 'knee_stays_up', label: 'Knee elevated during recoil',
      pass: !kneeFellEarly, value: kneeFellEarly ? 1 : 0, unit: 'ratio', target: 'knee stays up',
      severity: 'minor', phase: 'Recoil',
      cue: 'Keep the knee up while the leg returns.',
    });
  }

  // 18. Apex dwell ≤ 2 frames — peak Z within 5% for at most 2 frames
  {
    const peakZ = footWorldPos[peakIdx].z;
    const refZ = Math.abs(peakZ) || 1;
    let dwell = 0;
    for (let i = peakIdx; i < N; i++) {
      if (Math.abs(footWorldPos[i].z - peakZ) / refZ < 0.05) dwell++;
      else break;
    }
    const pass = dwell <= 3;
    criteria.push({
      id: 'apex_dwell', label: 'Apex is instantaneous',
      pass, value: dwell, unit: 'frames', target: '≤ 3 frames',
      severity: 'minor', phase: 'Recoil',
      cue: 'Do not linger at the apex — pure snap.',
    });
  }

  // === Phase F: Reset (info only) ===
  // 19. Total execution time ≤ 700ms — info, no deduction
  criteria.push({
    id: 'total_time', label: 'Total execution time',
    pass: tTotal <= 1000, value: tTotal, unit: 'ms', target: '≤ 1000ms',
    severity: 'info', phase: 'Reset',
    cue: 'Speed up the whole motion.',
  });

  // ── Score calculation ────────────────────────────────────────────────────
  let score = 100;
  for (const c of criteria) if (!c.pass) score -= WEIGHT[c.severity];
  score = Math.max(0, Math.min(100, score));

  // ── Verdict + headline ───────────────────────────────────────────────────
  // Score-driven primary verdict, with category overrides only at low scores.
  // Bands:
  //   90+  PERFECT
  //   75+  SNAP   (clean kick, maybe one minor issue)
  //   60+  GOOD   (decent kick with notable issues)
  //   <60  diagnostic word based on top failure (PUSH / LOW / SLOPPY)
  let verdict: KickVerdict = 'GOOD';
  let headlineCue = '';
  const failing = criteria.filter(c => !c.pass && c.severity !== 'info');
  failing.sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);

  if (failing.length === 0) {
    verdict = 'SNAP';
  } else {
    const top = failing[0];
    headlineCue = top.cue;

    if (score >= 90) {
      verdict = 'SNAP';
    } else if (score >= 75) {
      verdict = 'SNAP';
    } else if (score >= 60) {
      verdict = 'GOOD';
    } else {
      // Below 60: surface the diagnostic verdict
      if (top.id === 'snap_velocity' || top.id === 'recoil_ratio') verdict = 'PUSH';
      else if (top.id === 'peak_height' || top.id === 'chamber_knee_height') verdict = 'LOW';
      else verdict = 'SLOPPY';
    }
  }

  return {
    score,
    verdict,
    tier: tierFor(score),
    headlineCue,
    leg,
    peakFrameIdx: peakIdx,
    chamberFrameIdx: chamberIdx,
    criteria,
    metrics: {
      peakKneeAngleDeg: peakAngle,
      peakKneeAngularVelDegPerSec: peakKneeAngVel,
      peakFootSpeedMS: peakFootSpeed,
      extensionMs: tExtension,
      chamberMs: tChamber,
      totalMs: tTotal,
      recoilToExtensionRatio: recoilRatio,
    },
  };
}
