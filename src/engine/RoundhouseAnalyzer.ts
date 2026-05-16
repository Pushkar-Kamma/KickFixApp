/**
 * Roundhouse Kick (Dollyo Chagi) Analyzer — V1 (no hard gate yet)
 *
 * Roundhouse is the most CIRCULAR of the three kicks:
 *   - Hip rotates partially (30–80°) — between front-snap (square) and side-kick (full)
 *   - Strike trajectory is a horizontal arc, not a straight line
 *   - The signature feature: at peak, the SHIN IS HORIZONTAL (knee.y ≈ ankle.y)
 *   - Strike surface is the instep / shin
 *   - Knee leads the ankle into the target (not a soccer-kick swing)
 *
 * 13 criteria across 6 phases. Returns standard KickResult shape so the
 * UI is fully reusable.
 */

import {
  J, PoseFrame, Vec3, angle3D, lmReq, mid, sub, deriveScalar, deriveVec3, argmax, norm,
} from './biomech';
import type { KickResult, KickVerdict, Tier, Severity, CriterionResult } from './FrontSnapAnalyzer';

const WEIGHT: Record<Severity, number> = {
  critical: 15,
  major: 8,
  minor: 4,
  info: 0,
};

function tierFor(score: number): Tier {
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Advanced';
  if (score >= 55) return 'Intermediate';
  return 'Novice';
}

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

export function analyzeRoundhouse(frames: PoseFrame[], leg: 'Left' | 'Right'): KickResult {
  const ji = legJoints(leg);
  const N = frames.length;

  // Per-frame scalars -----------------------------------------------------
  const times: number[] = frames.map(f => f.t);
  const kneeAngles: number[] = [];
  const kneeY_image: number[] = [];
  const ankleY_image: number[] = [];
  const ankleX_image: number[] = [];
  const kneeX_image: number[] = [];
  const hipY_image: number[] = [];
  const hipWidth_image: number[] = [];
  const supportHipX_image: number[] = [];
  const footWorldPos: Vec3[] = [];

  for (const f of frames) {
    const w = f.world;
    const im = f.image;
    kneeAngles.push(angle3D(lmReq(w, ji.kHip), lmReq(w, ji.kKnee), lmReq(w, ji.kAnkle)));
    kneeY_image.push(im[ji.kKnee].y);
    ankleY_image.push(im[ji.kAnkle].y);
    ankleX_image.push(im[ji.kAnkle].x);
    kneeX_image.push(im[ji.kKnee].x);
    hipY_image.push((im[J.L_HIP].y + im[J.R_HIP].y) / 2);
    hipWidth_image.push(Math.abs(im[J.L_HIP].x - im[J.R_HIP].x));
    supportHipX_image.push(im[ji.sHip].x);
    footWorldPos.push(lmReq(w, ji.kFoot));
  }

  // Phase indices ---------------------------------------------------------
  // Peak frame = the frame where the KICKING ankle was highest on screen.
  // Knee-angle argmax is unreliable because a planted standing leg is
  // straighter than a slightly-bent leg at peak extension.
  let peakIdx = 0;
  {
    let minY = Infinity;
    for (let i = 0; i < N; i++) {
      const y = frames[i].image[ji.kAnkle].y;
      if (y < minY) { minY = y; peakIdx = i; }
    }
  }
  let chamberIdx = 0;
  let chamberMin = Infinity;
  for (let i = 0; i < peakIdx; i++) {
    if (kneeAngles[i] < chamberMin) { chamberMin = kneeAngles[i]; chamberIdx = i; }
  }

  const peakAngle = kneeAngles[peakIdx] ?? 0;
  const peakFrame = frames[peakIdx];
  const chamberFrame = frames[chamberIdx];

  // Velocities -------------------------------------------------------------
  const kneeAngVel = deriveScalar(kneeAngles, times);
  const footVel = deriveVec3(footWorldPos, times);
  const footSpeed = footVel.map(v => norm(v));

  const peakKneeAngVel = Math.max(...kneeAngVel.slice(0, peakIdx + 1).map(Math.abs), 0);
  const peakFootSpeed = Math.max(...footSpeed, 0);

  // Recoil ratio uses image-space ankle motion (robust against Z-axis noise).
  const ankleImgSpeed: number[] = [];
  for (let i = 1; i < N; i++) {
    const dx = ankleX_image[i] - ankleX_image[i - 1];
    const dy = ankleY_image[i] - ankleY_image[i - 1];
    ankleImgSpeed.push(Math.sqrt(dx * dx + dy * dy));
  }
  const extImgSpeeds = ankleImgSpeed.slice(Math.max(0, chamberIdx), Math.min(ankleImgSpeed.length, peakIdx + 1));
  const recImgSpeeds = ankleImgSpeed.slice(Math.min(ankleImgSpeed.length, peakIdx));
  const peakExtImg = extImgSpeeds.length ? Math.max(...extImgSpeeds) : 0;
  const peakRecImg = recImgSpeeds.length ? Math.max(...recImgSpeeds) : 0;
  const recoilRatio = peakExtImg > 0 ? peakRecImg / peakExtImg : 0;

  const tChamber = times[chamberIdx] - times[0];
  const tExtension = times[peakIdx] - times[chamberIdx];
  const tTotal = times[N - 1] - times[0];

  // ── Run each criterion ─────────────────────────────────────────────────
  const criteria: CriterionResult[] = [];

  // === Phase A: Setup ===
  // 1. Standing leg dynamic bend (140°–178°)
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
  // 2. Knee at hip height in chamber
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

  // 3. Chamber duration ≤ 500ms
  {
    const pass = tChamber <= 500;
    criteria.push({
      id: 'chamber_duration', label: 'Chamber duration',
      pass, value: tChamber, unit: 'ms', target: '≤ 500ms',
      severity: 'minor', phase: 'Chamber',
      cue: 'Faster chamber — you are telegraphing the kick.',
    });
  }

  // === Phase C: Extension ===
  // 4. Peak knee extension ≥ 165°
  {
    const pass = peakAngle >= 165 && peakAngle <= 185;
    criteria.push({
      id: 'peak_extension', label: 'Peak knee extension',
      pass, value: peakAngle, unit: 'deg', target: '≥ 165°',
      severity: 'critical', phase: 'Extension',
      cue: peakAngle < 165 ? 'Extend the leg further — lock it out.' : 'Avoid hyperextending.',
    });
  }

  // 5. Peak ankle near or above hip — image-OR-world (handles all kick angles)
  {
    const imgOk = ankleY_image[peakIdx] <= hipY_image[peakIdx] + 0.05;
    const ankleWorldY = peakFrame.world[ji.kAnkle].y;
    const hipWorldY = (peakFrame.world[J.L_HIP].y + peakFrame.world[J.R_HIP].y) / 2;
    const worldOk = ankleWorldY <= hipWorldY + 0.05;
    const pass = imgOk || worldOk;
    criteria.push({
      id: 'peak_height', label: 'Peak ankle height',
      pass, value: hipWorldY - ankleWorldY, unit: 'm', target: 'ankle near or above hip',
      severity: 'critical', phase: 'Extension',
      cue: 'Kick higher — at least to hip level.',
    });
  }

  // 6. Hip rotation 30°–80° — partial rotation (less than side kick).
  // Same baseline-vs-peak hip-width method.
  {
    const baselineEnd = Math.max(1, Math.floor(N * 0.25));
    let baseline = 0;
    for (let i = 0; i < baselineEnd; i++) {
      if (hipWidth_image[i] > baseline) baseline = hipWidth_image[i];
    }
    const lo = Math.max(0, peakIdx - 3);
    const hi = Math.min(N - 1, peakIdx + 3);
    let minPeak = Infinity;
    for (let i = lo; i <= hi; i++) {
      if (hipWidth_image[i] < minPeak) minPeak = hipWidth_image[i];
    }
    const ratio = baseline > 0.02 ? minPeak / baseline : 1;
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const rotationDeg = (Math.acos(clampedRatio) * 180) / Math.PI;
    const pass = rotationDeg >= 30 && rotationDeg <= 90;
    criteria.push({
      id: 'hip_rotation', label: 'Hip rotation (partial)',
      pass, value: rotationDeg, unit: 'deg', target: '30°–90°',
      severity: 'major', phase: 'Extension',
      cue: rotationDeg < 30
        ? 'Rotate the hip more — pivot the support foot.'
        : 'Less rotation — too much makes this a side kick.',
    });
  }

  // 7. Shin horizontal at peak — THE roundhouse signature.
  // Strict threshold (<0.07): true horizontal shin only.
  {
    const yDiff = Math.abs(kneeY_image[peakIdx] - ankleY_image[peakIdx]);
    const pass = yDiff < 0.07;
    criteria.push({
      id: 'shin_horizontal', label: 'Shin horizontal at peak',
      pass, value: yDiff, unit: 'ratio', target: '< 0.07 image height',
      severity: 'critical', phase: 'Extension',
      cue: 'Get the shin horizontal — knee and foot at the same height.',
    });
  }

  // 8. Knee leads ankle (no soccer kick) — during chamber→peak,
  // the knee should reach the target zone (support hip X) before the ankle.
  {
    // Direction of travel: from chamber to peak, which direction does kicking foot move?
    const dirX = ankleX_image[peakIdx] - ankleX_image[chamberIdx];
    const goingRight = dirX > 0;
    const targetX = supportHipX_image[Math.floor((chamberIdx + peakIdx) / 2)];

    // Find first frame in chamber→peak window where knee X passes targetX
    // and first where ankle X passes it
    let kneeFrame = -1, ankleFrame = -1;
    for (let i = chamberIdx; i <= peakIdx; i++) {
      const kneePast = goingRight ? kneeX_image[i] >= targetX : kneeX_image[i] <= targetX;
      const anklePast = goingRight ? ankleX_image[i] >= targetX : ankleX_image[i] <= targetX;
      if (kneeFrame < 0 && kneePast) kneeFrame = i;
      if (ankleFrame < 0 && anklePast) ankleFrame = i;
    }
    // Pass if knee leads (frame index smaller) OR neither reached yet (kick didn't cross midline yet)
    const pass = kneeFrame < 0 || ankleFrame < 0 || kneeFrame <= ankleFrame;
    criteria.push({
      id: 'knee_leads', label: 'Knee leads ankle (no soccer swing)',
      pass,
      value: kneeFrame >= 0 && ankleFrame >= 0 ? ankleFrame - kneeFrame : 0,
      unit: 'frames', target: 'knee first',
      severity: 'major', phase: 'Extension',
      cue: 'Lead with the knee — your foot is swinging like a soccer kick.',
    });
  }

  // 9. Foot arc trajectory — sum of frame-to-frame ankle movement
  // divided by straight-line distance from chamber to peak.
  // Circular path: ratio > 1.05.
  {
    let pathLen = 0;
    for (let i = chamberIdx + 1; i <= peakIdx; i++) {
      const dx = ankleX_image[i] - ankleX_image[i - 1];
      const dy = ankleY_image[i] - ankleY_image[i - 1];
      pathLen += Math.sqrt(dx * dx + dy * dy);
    }
    const dx0 = ankleX_image[peakIdx] - ankleX_image[chamberIdx];
    const dy0 = ankleY_image[peakIdx] - ankleY_image[chamberIdx];
    const straight = Math.sqrt(dx0 * dx0 + dy0 * dy0);
    const ratio = straight > 0.02 ? pathLen / straight : 1;
    const pass = ratio >= 1.05;
    criteria.push({
      id: 'arc_trajectory', label: 'Foot arc trajectory (curved)',
      pass, value: ratio, unit: 'ratio', target: '≥ 1.05 (curved path)',
      severity: 'minor', phase: 'Extension',
      cue: 'Arc the kick around — do not push it straight in.',
    });
  }

  // === Phase D: Posture ===
  // 10. Slight lean (5°–40°) — less than side kick's 5°–57°.
  {
    const sMid = mid(lmReq(peakFrame.world, J.L_SHOULDER), lmReq(peakFrame.world, J.R_SHOULDER));
    const hMid = mid(lmReq(peakFrame.world, J.L_HIP), lmReq(peakFrame.world, J.R_HIP));
    const vec = sub(sMid, hMid);
    const vertical: Vec3 = { x: 0, y: -1, z: 0 };
    let cos = (vec.x * vertical.x + vec.y * vertical.y + vec.z * vertical.z) / (norm(vec) || 1);
    cos = Math.max(-1, Math.min(1, cos));
    const lean = (Math.acos(cos) * 180) / Math.PI;
    const pass = lean >= 35 && lean <= 65;
    criteria.push({
      id: 'lean_controlled', label: 'Lean controlled',
      pass, value: lean, unit: 'deg', target: '35°–65° from vertical',
      severity: 'minor', phase: 'Posture',
      cue: lean > 65 ? 'Too much lean — collapsing back.' : 'Lean more to extend the kick.',
    });
  }

  // === Phase E: Recoil ===
  // 11. Recoil/extension velocity ratio ≥ 0.4
  {
    const pass = recoilRatio >= 0.4;
    criteria.push({
      id: 'recoil_ratio', label: 'Recoil-to-extension velocity ratio',
      pass, value: recoilRatio, unit: 'ratio', target: '≥ 0.4',
      severity: 'critical', phase: 'Recoil',
      cue: 'Snap the leg back, do not just let it drop.',
    });
  }

  // 12. Knee elevated during recoil
  {
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

  // === Phase F: Reset (info only) ===
  // 13. Total execution time ≤ 1500ms — info, no deduction
  criteria.push({
    id: 'total_time', label: 'Total execution time',
    pass: tTotal <= 1500, value: tTotal, unit: 'ms', target: '≤ 1500ms',
    severity: 'info', phase: 'Reset',
    cue: 'Speed up the whole motion.',
  });

  // ── Score calculation ────────────────────────────────────────────────────
  let score = 100;
  for (const c of criteria) if (!c.pass) score -= WEIGHT[c.severity];
  score = Math.max(0, Math.min(100, score));

  // ── Verdict + headline ───────────────────────────────────────────────────
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
      // Below 60: surface diagnostic verdict
      if (top.id === 'shin_horizontal' || top.id === 'hip_rotation') verdict = 'SLOPPY';
      else if (top.id === 'recoil_ratio') verdict = 'PUSH';
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
