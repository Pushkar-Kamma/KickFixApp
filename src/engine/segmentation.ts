/**
 * 5-phase temporal segmentation of a kick (Phase 0, M0.3).
 *
 * Moves scoring from 2 single frames (peak + chamber) to five phases derived
 * from the SMOOTHED foot-speed and knee-angle curves:
 *   Onset → Chamber → Extension → Retraction → Recovery
 *
 * DEGENERATE FALLBACKS (from CV review):
 *  - chamber not found (non-chambering beginner) → chamber phase `unobservable`;
 *    never score the standing frame.
 *  - low kick (ankle never rises above hip) → peak via FOOT-SPEED extremum, not
 *    min-ankle-Y.
 *  - push kick (chamber/extension blend) → phases merge, flagged.
 *
 * All boundaries are exposed in MILLISECONDS (frame counts change meaning across
 * fps). Feed a resampled+smoothed buffer for stable results.
 */

import { J, PoseFrame, Vec3, angle3D, deriveVec3, norm } from './biomech';
import { smoothScalar } from './filters';

export type PhaseName = 'onset' | 'chamber' | 'extension' | 'retraction' | 'recovery';

export interface PhaseSpan {
  name: PhaseName;
  startIdx: number;
  endIdx: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  observable: boolean;
}

export interface Segmentation {
  phases: PhaseSpan[];
  /** Index of maximum foot speed (extension marker; robust to low kicks). */
  extensionIdx: number;
  /** Index of maximum reach (min ankle image-Y). */
  peakIdx: number;
  /** Chamber index, or null when no clear knee-flexion minimum exists. */
  chamberIdx: number | null;
  fallbacks: string[];
}

function legJoints(leg: 'Left' | 'Right') {
  return leg === 'Left'
    ? { kHip: J.L_HIP, kKnee: J.L_KNEE, kAnkle: J.L_ANKLE, kFoot: J.L_FOOT_INDEX }
    : { kHip: J.R_HIP, kKnee: J.R_KNEE, kAnkle: J.R_ANKLE, kFoot: J.R_FOOT_INDEX };
}

/** Onset detection fraction of peak foot speed. PRIOR — calibrate. */
const ONSET_FRAC = 0.15;
/** Min knee-angle range (deg) to consider a real chamber flexion. PRIOR. */
const MIN_CHAMBER_FLEXION_DEG = 15;
/** Push-kick merge: chamber within this fraction of onset→extension span. PRIOR. */
const PUSH_MERGE_FRAC = 0.15;

function span(name: PhaseName, s: number, e: number, times: number[], observable = true): PhaseSpan {
  const startIdx = Math.max(0, Math.min(s, times.length - 1));
  const endIdx = Math.max(startIdx, Math.min(e, times.length - 1));
  const startMs = times[startIdx] - times[0];
  const endMs = times[endIdx] - times[0];
  return { name, startIdx, endIdx, startMs, endMs, durationMs: Math.max(0, endMs - startMs), observable };
}

/**
 * Segment a captured kick into five phases. Returns phase spans (ms), the
 * extension/peak/chamber indices, and any degenerate-case fallbacks applied.
 */
export function segmentKick(frames: PoseFrame[], leg: 'Left' | 'Right'): Segmentation {
  const ji = legJoints(leg);
  const N = frames.length;
  const times = frames.map(f => f.t);
  const fallbacks: string[] = [];

  if (N < 4) {
    return {
      phases: [span('onset', 0, N - 1, times.length ? times : [0])],
      extensionIdx: 0, peakIdx: 0, chamberIdx: null,
      fallbacks: ['too few frames for segmentation'],
    };
  }

  // Curves.
  const kneeAngleRaw: number[] = [];
  const ankleY: number[] = [];
  const hipY: number[] = [];
  const footPos: Vec3[] = [];
  for (let i = 0; i < N; i++) {
    const w = frames[i].world, im = frames[i].image;
    const hip = w[ji.kHip], knee = w[ji.kKnee], ankle = w[ji.kAnkle], foot = w[ji.kFoot] ?? ankle;
    kneeAngleRaw.push(hip && knee && ankle ? angle3D(hip, knee, ankle) : 180);
    ankleY.push(im[ji.kAnkle]?.y ?? 1);
    hipY.push(((im[J.L_HIP]?.y ?? 0.5) + (im[J.R_HIP]?.y ?? 0.5)) / 2);
    footPos.push(foot ? { x: foot.x, y: foot.y, z: foot.z } : { x: 0, y: 0, z: 0 });
  }
  const kneeAngle = smoothScalar(kneeAngleRaw, times);
  const footVel = deriveVec3(footPos, times);            // length N-1
  const footSpeedRaw = footVel.map(v => norm(v));
  const footSpeed = smoothScalar(footSpeedRaw, times.slice(1));

  // Extension = max smoothed foot speed (robust to low kicks where ankle never
  // rises above the hip). Map speed index (N-1 domain) to frame index.
  let extSpeedIdx = 0, maxSpeed = -Infinity;
  for (let i = 0; i < footSpeed.length; i++) if (footSpeed[i] > maxSpeed) { maxSpeed = footSpeed[i]; extSpeedIdx = i; }
  const extensionIdx = Math.min(N - 1, extSpeedIdx + 1);

  // Peak reach = min ankle image-Y. Flag low kick when ankle never rises above hip.
  let peakIdx = 0, minY = Infinity;
  for (let i = 0; i < N; i++) if (ankleY[i] < minY) { minY = ankleY[i]; peakIdx = i; }
  const roseAboveHip = ankleY[peakIdx] < hipY[peakIdx];
  if (!roseAboveHip) fallbacks.push('low kick: peak located by foot-speed, not reach height');

  // Onset = last index before extension where speed rises above ONSET_FRAC * peak.
  const onsetThresh = ONSET_FRAC * (maxSpeed > 0 ? maxSpeed : 1);
  let onsetIdx = 0;
  for (let i = extSpeedIdx; i >= 0; i--) {
    if (footSpeed[i] < onsetThresh) { onsetIdx = i; break; }
  }

  // Chamber = min knee angle in [onset, extension]. Unobservable if no real flexion.
  let chamberIdx: number | null = null;
  {
    let cMin = Infinity, cIdx = -1, cMax = -Infinity;
    for (let i = onsetIdx; i <= extensionIdx; i++) {
      cMax = Math.max(cMax, kneeAngle[i]);
      if (kneeAngle[i] < cMin) { cMin = kneeAngle[i]; cIdx = i; }
    }
    const flexionRange = isFinite(cMax) && isFinite(cMin) ? cMax - cMin : 0;
    if (cIdx > onsetIdx && cIdx < extensionIdx && flexionRange >= MIN_CHAMBER_FLEXION_DEG) {
      chamberIdx = cIdx;
    } else {
      fallbacks.push('chamber not clearly formed — chamber phase marked unobservable');
    }
  }

  // Retraction end = first index after extension where speed drops below onset thresh.
  let retractEndIdx = N - 1;
  for (let i = extSpeedIdx; i < footSpeed.length; i++) {
    if (footSpeed[i] < onsetThresh) { retractEndIdx = Math.min(N - 1, i + 1); break; }
  }

  // Push-kick detection: chamber sits too close to onset (no distinct cocking).
  if (chamberIdx != null) {
    const denom = Math.max(1, extensionIdx - onsetIdx);
    if ((chamberIdx - onsetIdx) / denom < PUSH_MERGE_FRAC) {
      fallbacks.push('push-style kick: chamber and extension merged');
    }
  }

  // Assemble phases. Chamber/extension boundaries depend on chamber observability.
  const phases: PhaseSpan[] = [];
  const chamberStart = chamberIdx ?? onsetIdx;
  phases.push(span('onset', onsetIdx, chamberStart, times));
  phases.push(span('chamber',
    chamberIdx ?? onsetIdx,
    chamberIdx != null ? Math.min(chamberIdx + 1, extensionIdx) : onsetIdx,
    times, chamberIdx != null));
  phases.push(span('extension', chamberStart, extensionIdx, times));
  phases.push(span('retraction', extensionIdx, retractEndIdx, times));
  phases.push(span('recovery', retractEndIdx, N - 1, times));

  return { phases, extensionIdx, peakIdx, chamberIdx, fallbacks };
}
