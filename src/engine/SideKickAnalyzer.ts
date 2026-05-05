/**
 * Side Kick (Yeop Chagi) Analyzer — V1
 *
 * Side kick is biomechanically distinct from front snap:
 *   - Hips ROTATE 60–90° during the kick (vs square in front snap)
 *   - Body forms a near-straight LATERAL line at peak (the iconic silhouette)
 *   - Strike surface is the BLADE / heel of the foot (vs ball of foot)
 *   - Trajectory is a LATERAL THRUST (vs forward snap)
 *
 * 13 criteria across 6 phases. Output shape is identical to FrontSnapAnalyzer
 * (KickResult) so the UI is fully reusable.
 */

import {
  J, PoseFrame, Vec3, angle3D, lmReq, mid, sub, deriveScalar, deriveVec3, argmax, norm, dist,
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

export function analyzeSideKick(frames: PoseFrame[], leg: 'Left' | 'Right'): KickResult {
  const ji = legJoints(leg);
  const N = frames.length;

  // Per-frame scalars -----------------------------------------------------
  const times: number[] = frames.map(f => f.t);
  const kneeAngles: number[] = [];
  const kneeY_image: number[] = [];
  const ankleY_image: number[] = [];
  const ankleX_image: number[] = [];
  const hipY_image: number[] = [];
  const hipWidth_image: number[] = [];   // |L_HIP.x - R_HIP.x| in image space
  const footWorldPos: Vec3[] = [];

  for (const f of frames) {
    const w = f.world;
    const im = f.image;
    kneeAngles.push(angle3D(lmReq(w, ji.kHip), lmReq(w, ji.kKnee), lmReq(w, ji.kAnkle)));
    kneeY_image.push(im[ji.kKnee].y);
    ankleY_image.push(im[ji.kAnkle].y);
    ankleX_image.push(im[ji.kAnkle].x);
    hipY_image.push((im[J.L_HIP].y + im[J.R_HIP].y) / 2);
    hipWidth_image.push(Math.abs(im[J.L_HIP].x - im[J.R_HIP].x));
    footWorldPos.push(lmReq(w, ji.kFoot));
  }

  // Phase indices ---------------------------------------------------------
  const peakIdx = argmax(kneeAngles);
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

  // For recoil ratio, use IMAGE-space ankle speed (per-frame Euclidean delta).
  // World-space velocity is unreliable for side kicks because Z-axis is noisy
  // when user is sideways to camera. Image-space motion is what we actually see.
  const ankleImgSpeed: number[] = [];
  for (let i = 1; i < N; i++) {
    const dx = ankleX_image[i] - ankleX_image[i - 1];
    const dy = ankleY_image[i] - ankleY_image[i - 1];
    ankleImgSpeed.push(Math.sqrt(dx * dx + dy * dy));
  }
  // peakIdx is on the original frame index; ankleImgSpeed has length N-1
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

  // 5. Peak ankle near or above hip. Use BOTH image-Y (perpendicular kicks)
  // AND world-Y (kicks toward/away from camera, where perspective fools image-Y).
  // Pass if EITHER says ankle is at/above hip — this handles all kicking angles.
  {
    const imgOk = ankleY_image[peakIdx] <= hipY_image[peakIdx] + 0.05;
    // World-space: smaller Y = higher (MediaPipe world: +y points down).
    const ankleWorldY = peakFrame.world[ji.kAnkle].y;
    const hipWorldY = (peakFrame.world[J.L_HIP].y + peakFrame.world[J.R_HIP].y) / 2;
    const worldOk = ankleWorldY <= hipWorldY + 0.05; // 5 cm tolerance
    const pass = imgOk || worldOk;
    // Display the world-Y delta because that's the true measurement
    criteria.push({
      id: 'peak_height', label: 'Peak ankle height',
      pass, value: hipWorldY - ankleWorldY, unit: 'm', target: 'ankle near or above hip',
      severity: 'critical', phase: 'Extension',
      cue: 'Kick higher — at least to hip level.',
    });
  }

  // 6. Hip turnover (rotation) — THE side-kick-defining metric.
  // Baseline = MAX hip width seen in the first 25% of the buffer (user squared up).
  // Peak = MIN hip width seen in a small window around peakIdx (most rotated).
  // Ratio peak/baseline → cos(angle), so smaller = more rotation.
  {
    const baselineEnd = Math.max(1, Math.floor(N * 0.25));
    let baseline = 0;
    for (let i = 0; i < baselineEnd; i++) {
      if (hipWidth_image[i] > baseline) baseline = hipWidth_image[i];
    }
    // Look in a +/- 3 frame window around peak for the minimum (most rotated)
    const lo = Math.max(0, peakIdx - 3);
    const hi = Math.min(N - 1, peakIdx + 3);
    let minPeak = Infinity;
    for (let i = lo; i <= hi; i++) {
      if (hipWidth_image[i] < minPeak) minPeak = hipWidth_image[i];
    }
    const ratio = baseline > 0.02 ? minPeak / baseline : 1;
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const rotationDeg = (Math.acos(clampedRatio) * 180) / Math.PI;
    const pass = rotationDeg >= 60;
    criteria.push({
      id: 'hip_turnover', label: 'Hip turnover (rotation)',
      pass, value: rotationDeg, unit: 'deg', target: '≥ 60°',
      severity: 'critical', phase: 'Extension',
      cue: 'Turn your hips over — pivot the support foot and rotate sideways.',
    });
  }

  // 7. Body line collinearity — shoulderMid → hipMid → kicking ankle.
  // True side kick: angle ≈ 180° (straight line). Pass if ≥ 150°.
  {
    const sMid = mid(lmReq(peakFrame.world, J.L_SHOULDER), lmReq(peakFrame.world, J.R_SHOULDER));
    const hMid = mid(lmReq(peakFrame.world, J.L_HIP), lmReq(peakFrame.world, J.R_HIP));
    const ank = lmReq(peakFrame.world, ji.kAnkle);
    const a = angle3D(sMid, hMid, ank);
    const pass = a >= 120;
    criteria.push({
      id: 'body_line', label: 'Body forms a straight line',
      pass, value: a, unit: 'deg', target: '≥ 120°',
      severity: 'critical', phase: 'Extension',
      cue: 'Form a straight line: shoulder, hip, and kicking foot in line.',
    });
  }

  // 8. Foot blade orientation — foot should be horizontal/sideways.
  // Lower weight: world-Y axis on foot landmarks is noisy when user is sideways.
  {
    const ank = lmReq(peakFrame.world, ji.kAnkle);
    const fi = lmReq(peakFrame.world, ji.kFoot);
    const upperLeg = Math.max(0.05, dist(
      lmReq(peakFrame.world, ji.kHip),
      lmReq(peakFrame.world, ji.kKnee),
    ));
    const yDiff = Math.abs(fi.y - ank.y) / upperLeg;
    const pass = yDiff < 0.30;
    criteria.push({
      id: 'foot_blade', label: 'Foot blade orientation',
      pass, value: yDiff, unit: 'ratio', target: '< 0.30 of leg',
      severity: 'minor', phase: 'Extension',
      cue: 'Turn the foot sideways — strike with the blade or heel.',
    });
  }

  // 9. Lateral thrust trajectory — reduced to minor weight because
  // image-space Δx vs Δy is unreliable when kicking toward the camera.
  {
    const dx = Math.abs(ankleX_image[peakIdx] - ankleX_image[chamberIdx]);
    const dy = Math.abs(ankleY_image[peakIdx] - ankleY_image[chamberIdx]);
    const ratio = dy > 0 ? dx / dy : 99;
    const pass = ratio >= 0.8;
    criteria.push({
      id: 'lateral_thrust', label: 'Lateral thrust trajectory',
      pass, value: ratio, unit: 'ratio', target: 'Δx ≥ 0.8 × Δy',
      severity: 'minor', phase: 'Extension',
      cue: 'Thrust the foot sideways, not upward.',
    });
  }

  // === Phase D: Posture ===
  // 10. Lateral lean controlled — some lean is expected (10°–50°),
  // but excessive collapse backward is bad.
  {
    const sMid = mid(lmReq(peakFrame.world, J.L_SHOULDER), lmReq(peakFrame.world, J.R_SHOULDER));
    const hMid = mid(lmReq(peakFrame.world, J.L_HIP), lmReq(peakFrame.world, J.R_HIP));
    const vec = sub(sMid, hMid);
    const vertical: Vec3 = { x: 0, y: -1, z: 0 };
    let cos = (vec.x * vertical.x + vec.y * vertical.y + vec.z * vertical.z) / (norm(vec) || 1);
    cos = Math.max(-1, Math.min(1, cos));
    const lean = (Math.acos(cos) * 180) / Math.PI;
    const pass = lean >= 5 && lean <= 57;
    criteria.push({
      id: 'lateral_lean', label: 'Lateral lean controlled',
      pass, value: lean, unit: 'deg', target: '5°–57° from vertical',
      severity: 'minor', phase: 'Posture',
      cue: lean > 57 ? 'Too much lean — you are collapsing back.' : 'Tilt the body slightly to extend the kick.',
    });
  }

  // === Phase E: Recoil ===
  // 11. Recoil/extension ratio ≥ 0.5 (looser than front snap's 0.7 since
  // side kicks have more mass behind them and recoil naturally slower).
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
      // Below 60: surface the diagnostic verdict
      if (top.id === 'hip_turnover' || top.id === 'recoil_ratio') verdict = 'PUSH';
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
