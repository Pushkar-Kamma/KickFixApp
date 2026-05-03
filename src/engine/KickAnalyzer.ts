/**
 * Translated from logic.py (desktop Python). Landmarks are normalized (~0–1).
 *
 * Distance / height thresholds are **not** fixed pixels: they scale with
 * `bodyMetrics()` so a person closer/farther from the camera keeps similar
 * behavior. Ratios are calibrated from the original pixel values at nominal
 * body size (see comments).
 */

export const JOINTS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

/** Nominal calibration (desktop ~720p): used only to turn Python px into ratios. */
const NOM_LEG_PX = 380;
const NOM_HIP_PX = 110;
const NOM_SHOULDER_PX = 280;

/** Ankle Y-separation when kicking: was 80px → scale by avg leg length. */
export const R_KICK_ANKLE_SEP = 80 / NOM_LEG_PX;
/** Hip turnover / knee-drop Y: was 30px. */
export const R_HIP_SHIFT_Y = 30 / NOM_LEG_PX;
/** Shin “level” Y difference: was 100px. */
export const R_SHIN_Y = 100 / NOM_LEG_PX;
/** Blade / small vertical foot offset: was 20px. */
export const R_FOOT_Y = 20 / NOM_LEG_PX;
/** Trajectory: ankle ahead of knee in X: was +20px → scale by hip width. */
export const R_TRAJ_X = 20 / NOM_HIP_PX;
/** Side-kick chamber width: min knee–knee X was compared to 120px. */
export const R_CHAMBER_X = 120 / NOM_HIP_PX;
/** Front-snap torso lean in X: was 80px → scale by shoulder width. */
export const R_LEAN_X = 80 / NOM_SHOULDER_PX;

/** Ignore kicks shorter than this many frames (noise). */
export const MIN_FRAME_COUNT = 5;

/** Critical landmarks must meet this visibility to run logic (ghost kick guard). */
export const VISIBILITY_THRESHOLD = 0.6;

export interface Point {
  x: number;
  y: number;
  visibility?: number;
  presence?: number;
}

type Pixel = { x: number; y: number };

function toPixel(p: Point | undefined, w: number, h: number): Pixel | null {
  if (!p) return null;
  return { x: p.x * w, y: p.y * h };
}

/** Angle ABC in degrees; matches Python (no rounding internally). */
export function calculateAngle(a: Point, b: Point, c: Point): number {
  if (!a || !b || !c) return 0;
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return angle;
}

export function calculateAnglePixel(a: Pixel, b: Pixel, c: Pixel): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return angle;
}

export function calculateDistance(p1: Pixel, p2: Pixel): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function getPixelLm(lm: Point[], w: number, h: number, i: number): Pixel | null {
  return toPixel(lm[i], w, h);
}

/** Scale references from the current pose (pixels). Falls back if landmarks missing. */
export interface BodyMetrics {
  /** Mean hip→ankle length (both legs). */
  leg: number;
  /** Distance between hips. */
  hipW: number;
  /** Distance between shoulders. */
  shoulderW: number;
}

export function bodyMetrics(lm: Point[], w: number, h: number): BodyMetrics {
  const minD = Math.min(w, h);
  const defLeg = minD * 0.22;
  const defHip = minD * 0.12;
  const defShoulder = minD * 0.18;

  const lH = getPixelLm(lm, w, h, JOINTS.LEFT_HIP);
  const rH = getPixelLm(lm, w, h, JOINTS.RIGHT_HIP);
  const lA = getPixelLm(lm, w, h, JOINTS.LEFT_ANKLE);
  const rA = getPixelLm(lm, w, h, JOINTS.RIGHT_ANKLE);
  const lS = getPixelLm(lm, w, h, JOINTS.LEFT_SHOULDER);
  const rS = getPixelLm(lm, w, h, JOINTS.RIGHT_SHOULDER);

  let leg = defLeg;
  let hipW = defHip;
  let shoulderW = defShoulder;

  if (lH && rH && lA && rA) {
    leg = (calculateDistance(lH, lA) + calculateDistance(rH, rA)) / 2;
  }
  if (lH && rH) {
    hipW = calculateDistance(lH, rH);
  }
  if (lS && rS) {
    shoulderW = calculateDistance(lS, rS);
  }

  return { leg, hipW, shoulderW };
}

/** Min |Δy| between ankles (px) to register a kick — scales with leg in frame. */
export function kickAnkleSeparationThreshold(
  lm: Point[],
  w: number,
  h: number,
): number {
  return bodyMetrics(lm, w, h).leg * R_KICK_ANKLE_SEP;
}

/** Python uses max(left_shoulder.y, right_shoulder.y) for guard bar. */
function shouldersYPixel(lm: Point[], w: number, h: number): number | null {
  const ls = getPixelLm(lm, w, h, JOINTS.LEFT_SHOULDER);
  const rs = getPixelLm(lm, w, h, JOINTS.RIGHT_SHOULDER);
  if (!ls || !rs) return null;
  return Math.max(ls.y, rs.y);
}

/** Python: at least one wrist above shoulder line (smaller Y than shoulders_y). */
export function checkGuard(
  lm: Point[],
  w: number,
  h: number,
  kWrist: number,
  sWrist: number,
  shouldersY: number,
): boolean {
  const kw = getPixelLm(lm, w, h, kWrist);
  const sw = getPixelLm(lm, w, h, sWrist);
  if (!kw || !sw) return false;
  return kw.y < shouldersY || sw.y < shouldersY;
}

/** Python: ankle higher on screen than hip (smaller Y). */
export function checkHeight(
  lm: Point[],
  w: number,
  h: number,
  kAnkle: number,
  kHip: number,
): boolean {
  const a = getPixelLm(lm, w, h, kAnkle);
  const hip = getPixelLm(lm, w, h, kHip);
  if (!a || !hip) return false;
  return a.y < hip.y;
}

export interface AnalysisResult {
  feedback: string[];
  errors: string[];
  score: number;
  peakAngle: number;
}

/**
 * Simple deduction scoring: start at 100, subtract per error.
 * Weights can be tuned later with real training data.
 */
const ERROR_DEDUCTIONS: Record<string, number> = {
  'Dropped Guard': 10,
  'Low Kick': 15,
  'Poor Extension': 20,
  'No Hip Turnover': 10,
  'Shin not horizontal': 10,
  'Standing Leg Too Bent': 10,
  'No Recoil (Leg Dropped)': 10,
  'Bad Trajectory (Soccer Kick)': 15,
  'Toes Pointing Up': 10,
  'Weak Chamber': 10,
  'Torso Dropped Below Hips': 10,
  'Knee Dropped During Extension': 10,
  'Low Knee': 15,
  'Excessive Lean': 10,
  'Toes Pointed (Danger)': 10,
  'Loose Chamber Fold': 10,
  'Tracking': 0,
};

export function computeScore(errors: string[]): number {
  let score = 100;
  for (const err of errors) {
    score -= ERROR_DEDUCTIONS[err] ?? 10;
  }
  return Math.max(0, Math.min(100, score));
}

export function analyzeRoundhouse(
  history: Point[][],
  activeLeg: 'Left' | 'Right',
  w: number,
  h: number,
): AnalysisResult {
  const feedback: string[] = [];
  const errors: string[] = [];

  let kHip: number;
  let kKnee: number;
  let kAnkle: number;
  let sHip: number;
  let sKnee: number;
  let sAnkle: number;
  let kWrist: number;
  let sWrist: number;

  if (activeLeg === 'Left') {
    kHip = JOINTS.LEFT_HIP;
    kKnee = JOINTS.LEFT_KNEE;
    kAnkle = JOINTS.LEFT_ANKLE;
    sHip = JOINTS.RIGHT_HIP;
    sKnee = JOINTS.RIGHT_KNEE;
    sAnkle = JOINTS.RIGHT_ANKLE;
    kWrist = JOINTS.LEFT_WRIST;
    sWrist = JOINTS.RIGHT_WRIST;
  } else {
    kHip = JOINTS.RIGHT_HIP;
    kKnee = JOINTS.RIGHT_KNEE;
    kAnkle = JOINTS.RIGHT_ANKLE;
    sHip = JOINTS.LEFT_HIP;
    sKnee = JOINTS.LEFT_KNEE;
    sAnkle = JOINTS.LEFT_ANKLE;
    kWrist = JOINTS.RIGHT_WRIST;
    sWrist = JOINTS.LEFT_WRIST;
  }

  let bestFrameIdx = 0;
  let maxAngle = 0;

  for (let i = 0; i < history.length; i++) {
    const lm = history[i];
    const hip = getPixelLm(lm, w, h, kHip);
    const knee = getPixelLm(lm, w, h, kKnee);
    const ankle = getPixelLm(lm, w, h, kAnkle);
    if (!hip || !knee || !ankle) continue;
    const angle = calculateAnglePixel(hip, knee, ankle);
    if (angle > maxAngle) {
      maxAngle = angle;
      bestFrameIdx = i;
    }
  }

  const lm = history[bestFrameIdx];
  const shouldersY = shouldersYPixel(lm, w, h);
  if (shouldersY === null) {
    return {
      feedback: ['Incomplete pose data (shoulders).'],
      errors: ['Tracking'],
      score: 0,
      peakAngle: 0,
    };
  }

  feedback.push(`Frames Captured: ${history.length}`);

  const bm = bodyMetrics(lm, w, h);

  if (!checkGuard(lm, w, h, kWrist, sWrist, shouldersY)) {
    feedback.push('Hands Dropped!');
    errors.push('Dropped Guard');
  }

  if (!checkHeight(lm, w, h, kAnkle, kHip)) {
    feedback.push('Kick Higher! (Below Belt)');
    errors.push('Low Kick');
  }

  if (maxAngle < 160) {
    feedback.push(`Bad Extension: ${Math.floor(maxAngle)}°`);
    errors.push('Poor Extension');
  } else {
    feedback.push(`Great Snap! ${Math.floor(maxAngle)}°`);
  }

  const kHipP = getPixelLm(lm, w, h, kHip)!;
  const sHipP = getPixelLm(lm, w, h, sHip)!;
  if (kHipP.y > sHipP.y + bm.leg * R_HIP_SHIFT_Y) {
    feedback.push('Turn Hips Over!');
    errors.push('No Hip Turnover');
  }

  const kAnkleP = getPixelLm(lm, w, h, kAnkle)!;
  const kKneeP = getPixelLm(lm, w, h, kKnee)!;
  const shinDiff = Math.abs(kAnkleP.y - kKneeP.y);
  if (shinDiff > bm.leg * R_SHIN_Y) {
    feedback.push('Level your shin!');
    errors.push('Shin not horizontal');
  }

  const sHipPx = getPixelLm(lm, w, h, sHip)!;
  const sKneePx = getPixelLm(lm, w, h, sKnee)!;
  const sAnklePx = getPixelLm(lm, w, h, sAnkle)!;
  const standingAngle = calculateAnglePixel(sHipPx, sKneePx, sAnklePx);
  if (standingAngle < 135) {
    feedback.push('Stand Tall! (Knee collapsing)');
    errors.push('Standing Leg Too Bent');
  }

  if (bestFrameIdx < history.length - 2) {
    const lastLm = history[history.length - 1];
    const lh = getPixelLm(lastLm, w, h, kHip)!;
    const lk = getPixelLm(lastLm, w, h, kKnee)!;
    const la = getPixelLm(lastLm, w, h, kAnkle)!;
    const lastFrameAngle = calculateAnglePixel(lh, lk, la);
    if (maxAngle - lastFrameAngle < 20) {
      feedback.push("Snap back! Don't drop leg.");
      errors.push('No Recoil (Leg Dropped)');
    }
  }

  if (bestFrameIdx > 3) {
    const chamberFrame = history[Math.floor(bestFrameIdx / 2)];
    const cLm = chamberFrame;
    const ck = getPixelLm(cLm, w, h, kKnee)!;
    const ca = getPixelLm(cLm, w, h, kAnkle)!;
    const sh = getPixelLm(cLm, w, h, sHip)!;
    const kneeDist = Math.abs(ck.x - sh.x);
    const ankleDist = Math.abs(ca.x - sh.x);
    const traj = bm.hipW * R_TRAJ_X;
    if (ankleDist > kneeDist + traj) {
      feedback.push('Knee must lead! (Soccer kick)');
      errors.push('Bad Trajectory (Soccer Kick)');
    }
  }

  return { feedback, errors, score: computeScore(errors), peakAngle: maxAngle };
}

export function analyzeSideKick(
  history: Point[][],
  activeLeg: 'Left' | 'Right',
  w: number,
  h: number,
): AnalysisResult {
  const feedback: string[] = [];
  const errors: string[] = [];

  let kHip: number;
  let kKnee: number;
  let kAnkle: number;
  let kHeel: number;
  let kToe: number;
  let sKnee: number;
  let sHeel: number;
  let kWrist: number;
  let sWrist: number;
  let lShoulder: number;

  if (activeLeg === 'Left') {
    kHip = JOINTS.LEFT_HIP;
    kKnee = JOINTS.LEFT_KNEE;
    kAnkle = JOINTS.LEFT_ANKLE;
    kHeel = JOINTS.LEFT_HEEL;
    kToe = JOINTS.LEFT_FOOT_INDEX;
    sKnee = JOINTS.RIGHT_KNEE;
    sHeel = JOINTS.RIGHT_HEEL;
    kWrist = JOINTS.LEFT_WRIST;
    sWrist = JOINTS.RIGHT_WRIST;
    lShoulder = JOINTS.LEFT_SHOULDER;
  } else {
    kHip = JOINTS.RIGHT_HIP;
    kKnee = JOINTS.RIGHT_KNEE;
    kAnkle = JOINTS.RIGHT_ANKLE;
    kHeel = JOINTS.RIGHT_HEEL;
    kToe = JOINTS.RIGHT_FOOT_INDEX;
    sKnee = JOINTS.LEFT_KNEE;
    sHeel = JOINTS.LEFT_HEEL;
    kWrist = JOINTS.RIGHT_WRIST;
    sWrist = JOINTS.LEFT_WRIST;
    lShoulder = JOINTS.RIGHT_SHOULDER;
  }

  let bestFrameIdx = 0;
  let maxAngle = 0;
  let minChamberXDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < history.length; i++) {
    const lm = history[i];
    const hip = getPixelLm(lm, w, h, kHip);
    const knee = getPixelLm(lm, w, h, kKnee);
    const ankle = getPixelLm(lm, w, h, kAnkle);
    if (!hip || !knee || !ankle) continue;
    const angle = calculateAnglePixel(hip, knee, ankle);
    if (angle > maxAngle) {
      maxAngle = angle;
      bestFrameIdx = i;
    }
    if (angle < 120) {
      const kk = getPixelLm(lm, w, h, kKnee)!;
      const sk = getPixelLm(lm, w, h, sKnee)!;
      const dist = Math.abs(kk.x - sk.x);
      if (dist < minChamberXDiff) {
        minChamberXDiff = dist;
      }
    }
  }

  const lm = history[bestFrameIdx];
  const shouldersY = shouldersYPixel(lm, w, h);
  if (shouldersY === null) {
    return {
      feedback: ['Incomplete pose data (shoulders).'],
      errors: ['Tracking'],
      score: 0,
      peakAngle: 0,
    };
  }

  feedback.push(`Frames Captured: ${history.length}`);

  const bm = bodyMetrics(lm, w, h);

  if (!checkGuard(lm, w, h, kWrist, sWrist, shouldersY)) {
    feedback.push('Hands Dropped!');
    errors.push('Dropped Guard');
  }

  if (!checkHeight(lm, w, h, kAnkle, kHip)) {
    feedback.push('Kick Higher! (Below Belt)');
    errors.push('Low Kick');
  }

  if (maxAngle < 170) {
    feedback.push(`Push Harder! Only ${Math.floor(maxAngle)}°`);
    errors.push('Poor Extension');
  } else {
    feedback.push(`Solid Lockout: ${Math.floor(maxAngle)}°`);
  }

  const heelP = getPixelLm(lm, w, h, kHeel)!;
  const toeP = getPixelLm(lm, w, h, kToe)!;
  if (heelP.y > toeP.y + bm.leg * R_FOOT_Y) {
    feedback.push('Turn Toes Down (Blade)!');
    errors.push('Toes Pointing Up');
  }

  if (minChamberXDiff > bm.hipW * R_CHAMBER_X) {
    feedback.push('Deep Chamber Needed!');
    errors.push('Weak Chamber');
  }

  const lSh = getPixelLm(lm, w, h, lShoulder)!;
  const kHipPx = getPixelLm(lm, w, h, kHip)!;
  if (lSh.y > kHipPx.y) {
    feedback.push('Keep Chest Up! (Dropping too low)');
    errors.push('Torso Dropped Below Hips');
  }

  if (bestFrameIdx > 2) {
    const chamberKneeY = getPixelLm(history[2], w, h, kKnee)!.y;
    const peakKneeY = getPixelLm(lm, w, h, kKnee)!.y;
    if (peakKneeY > chamberKneeY + bm.leg * R_HIP_SHIFT_Y) {
      feedback.push('Keep knee up!');
      errors.push('Knee Dropped During Extension');
    }
  }

  return { feedback, errors, score: computeScore(errors), peakAngle: maxAngle };
}

export function analyzeFrontSnap(
  history: Point[][],
  activeLeg: 'Left' | 'Right',
  w: number,
  h: number,
): AnalysisResult {
  const feedback: string[] = [];
  const errors: string[] = [];

  let kHip: number;
  let kKnee: number;
  let kAnkle: number;
  let sHip: number;
  let lShoulder: number;
  let sHeel: number;
  let kWrist: number;
  let sWrist: number;
  let kToe: number;
  let kHeel: number;

  if (activeLeg === 'Left') {
    kHip = JOINTS.LEFT_HIP;
    kKnee = JOINTS.LEFT_KNEE;
    kAnkle = JOINTS.LEFT_ANKLE;
    sHip = JOINTS.RIGHT_HIP;
    lShoulder = JOINTS.LEFT_SHOULDER;
    sHeel = JOINTS.RIGHT_HEEL;
    kWrist = JOINTS.LEFT_WRIST;
    sWrist = JOINTS.RIGHT_WRIST;
    kToe = JOINTS.LEFT_FOOT_INDEX;
    kHeel = JOINTS.LEFT_HEEL;
  } else {
    kHip = JOINTS.RIGHT_HIP;
    kKnee = JOINTS.RIGHT_KNEE;
    kAnkle = JOINTS.RIGHT_ANKLE;
    sHip = JOINTS.LEFT_HIP;
    lShoulder = JOINTS.RIGHT_SHOULDER;
    sHeel = JOINTS.LEFT_HEEL;
    kWrist = JOINTS.RIGHT_WRIST;
    sWrist = JOINTS.LEFT_WRIST;
    kToe = JOINTS.RIGHT_FOOT_INDEX;
    kHeel = JOINTS.RIGHT_HEEL;
  }

  let bestFrameIdx = 0;
  let maxAngle = 0;
  let minFoldDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < history.length; i++) {
    const lm = history[i];
    const hip = getPixelLm(lm, w, h, kHip);
    const knee = getPixelLm(lm, w, h, kKnee);
    const ankle = getPixelLm(lm, w, h, kAnkle);
    if (!hip || !knee || !ankle) continue;
    const angle = calculateAnglePixel(hip, knee, ankle);
    if (angle > maxAngle) {
      maxAngle = angle;
      bestFrameIdx = i;
    }
    if (angle < 100) {
      const heelPx = getPixelLm(lm, w, h, kHeel)!;
      const hipPx = getPixelLm(lm, w, h, kHip)!;
      const dist = calculateDistance(heelPx, hipPx);
      if (dist < minFoldDist) {
        minFoldDist = dist;
      }
    }
  }

  const lm = history[bestFrameIdx];
  const shouldersY = shouldersYPixel(lm, w, h);
  if (shouldersY === null) {
    return {
      feedback: ['Incomplete pose data (shoulders).'],
      errors: ['Tracking'],
      score: 0,
      peakAngle: 0,
    };
  }

  feedback.push(`Frames Captured: ${history.length}`);

  const bm = bodyMetrics(lm, w, h);

  if (!checkGuard(lm, w, h, kWrist, sWrist, shouldersY)) {
    feedback.push('Hands Dropped!');
    errors.push('Dropped Guard');
  }

  if (maxAngle < 170) {
    feedback.push(`Snap Leg! (${Math.floor(maxAngle)}°)`);
  } else {
    feedback.push('Good Snap.');
  }

  const kKneeP = getPixelLm(lm, w, h, kKnee)!;
  const kHipP = getPixelLm(lm, w, h, kHip)!;
  if (kKneeP.y > kHipP.y) {
    feedback.push('Lift Knee Higher!');
    errors.push('Low Knee');
  }

  const lSh = getPixelLm(lm, w, h, lShoulder)!;
  const sHipPx = getPixelLm(lm, w, h, sHip)!;
  const lean = Math.abs(lSh.x - sHipPx.x);
  if (lean > bm.shoulderW * R_LEAN_X) {
    feedback.push("Don't Lean Back!");
    errors.push('Excessive Lean');
  }

  const kKneePx = getPixelLm(lm, w, h, kKnee)!;
  const kAnklePx = getPixelLm(lm, w, h, kAnkle)!;
  const kToePx = getPixelLm(lm, w, h, kToe)!;
  const footAngle = calculateAnglePixel(kKneePx, kAnklePx, kToePx);
  if (footAngle > 140) {
    feedback.push('Pull Toes Back!');
    errors.push('Toes Pointed (Danger)');
  }

  const upperLegLen = calculateDistance(kHipP, kKneeP);
  if (minFoldDist > upperLegLen * 1.2) {
    feedback.push('RECHAMBER!');
    errors.push('Loose Chamber Fold');
  }

  return { feedback, errors, score: computeScore(errors), peakAngle: maxAngle };
}

/** Critical landmark indices for visibility gate (Python main loop). */
export const CRITICAL_VISIBILITY_INDICES = [
  JOINTS.LEFT_ANKLE,
  JOINTS.RIGHT_ANKLE,
  JOINTS.LEFT_HIP,
  JOINTS.RIGHT_HIP,
] as const;

export function isVisibleEnough(points: Point[]): boolean {
  for (const id of CRITICAL_VISIBILITY_INDICES) {
    const v = points[id]?.visibility;
    if (v === undefined || v === null || v < VISIBILITY_THRESHOLD) {
      return false;
    }
  }
  return true;
}
