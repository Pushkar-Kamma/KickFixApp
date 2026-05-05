/**
 * Biomechanics math utilities for MediaPipe pose landmarks.
 *
 * Coordinate systems:
 *   - imageLandmarks: x,y in [0,1] normalized to image; z is depth-from-camera (rough on monocular).
 *   - worldLandmarks: x,y,z in METERS, origin at hip midpoint. Rotation/scale invariant.
 *     Use these for true joint angles, distances, velocities.
 *
 * MediaPipe BlazePose 33-landmark topology used throughout.
 */

export const J = {
  NOSE: 0,
  L_EAR: 7, R_EAR: 8,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30,
  L_FOOT_INDEX: 31, R_FOOT_INDEX: 32,
} as const;

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

/** A single sampled frame: image + world landmarks + timestamp. */
export interface PoseFrame {
  /** Normalized image coords, x,y ∈ [0,1]. Used for screen-space checks (overlay, render). */
  image: Landmark[];
  /** World coords in meters from hip midpoint. Used for biomechanics. */
  world: Landmark[];
  /** Capture time (ms, performance.now equivalent). */
  t: number;
}

export type Vec3 = { x: number; y: number; z: number };

/* ── Vector math ── */
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const norm = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dist = (a: Vec3, b: Vec3): number => norm(sub(a, b));
export const mid = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

/** 3D angle ABC in degrees, where B is the vertex. */
export function angle3D(a: Vec3, b: Vec3, c: Vec3): number {
  const ba = sub(a, b);
  const bc = sub(c, b);
  const denom = norm(ba) * norm(bc);
  if (denom === 0) return 0;
  let cos = dot(ba, bc) / denom;
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Convenience: pull a landmark by index, returning a Vec3 (or null if missing). */
export function lm(frame: Landmark[], idx: number): Vec3 | null {
  const p = frame[idx];
  if (!p) return null;
  return { x: p.x, y: p.y, z: p.z };
}
export function lmReq(frame: Landmark[], idx: number): Vec3 {
  const p = frame[idx];
  return { x: p.x, y: p.y, z: p.z };
}

/* ── Quality / visibility ── */
/** Critical landmarks must clear both visibility AND presence to be trusted. */
const CRITICAL = [J.L_HIP, J.R_HIP, J.L_KNEE, J.R_KNEE, J.L_ANKLE, J.R_ANKLE, J.L_SHOULDER, J.R_SHOULDER];
export function frameUsable(image: Landmark[], visMin = 0.5, presMin = 0.5): boolean {
  for (const i of CRITICAL) {
    const p = image[i];
    if (!p) return false;
    if ((p.visibility ?? 0) < visMin) return false;
    if ((p.presence ?? 1) < presMin) return false;
  }
  return true;
}

/* ── Discrete derivatives over a frame buffer ── */

/** First derivative of a per-frame scalar: returns array of (Δs/Δt) length N-1. Time in seconds. */
export function deriveScalar(values: number[], times: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const dt = (times[i] - times[i - 1]) / 1000;
    out.push(dt > 0 ? (values[i] - values[i - 1]) / dt : 0);
  }
  return out;
}

/** First derivative of per-frame Vec3 positions: returns velocity Vec3 array length N-1 (m/s). */
export function deriveVec3(positions: Vec3[], times: number[]): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 1; i < positions.length; i++) {
    const dt = (times[i] - times[i - 1]) / 1000;
    if (dt <= 0) { out.push({ x: 0, y: 0, z: 0 }); continue; }
    out.push(scale(sub(positions[i], positions[i - 1]), 1 / dt));
  }
  return out;
}

/** Index of max value in array. Returns -1 if empty. */
export function argmax(arr: number[]): number {
  let best = -1, bestV = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > bestV) { bestV = arr[i]; best = i; }
  return best;
}

/** Determine which leg is kicking by ankle Y in image space (smaller y = higher on screen). */
export function detectKickingLeg(imageFrames: Landmark[][]): 'Left' | 'Right' | null {
  // Pick the frame at ~60% through (likely near peak) to check which ankle is higher.
  const idx = Math.min(imageFrames.length - 1, Math.floor(imageFrames.length * 0.6));
  const f = imageFrames[idx];
  const lA = f[J.L_ANKLE], rA = f[J.R_ANKLE];
  if (!lA || !rA) return null;
  // Smaller y = higher on screen = the kicking leg
  return lA.y < rA.y ? 'Left' : 'Right';
}
