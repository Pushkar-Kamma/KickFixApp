/**
 * Signal conditioning for the landmark stream (Phase 0, M0.0 + M0.1).
 *
 *  - `smoothScalar`  : One-Euro filter (Casiez et al. 2012) for feature curves
 *                      (knee angle, foot speed, …). Adaptive: low lag on fast
 *                      motion, strong smoothing when slow.
 *  - `resamplePoseFrames` : linear-interpolate a variable-fps capture buffer to
 *                      a fixed Δt so every downstream window can be expressed in
 *                      MILLISECONDS instead of frame counts (which change meaning
 *                      across 15/24/30/60 fps).
 *
 * NOTE: One-Euro parameters are PRIORS. The cutoff must be validated to NOT
 * attenuate the true peak (a snap's extension→retraction crossing can be
 * <100 ms) before phase boundaries derived from smoothed curves are trusted.
 */

import type { Landmark, PoseFrame } from './biomech';

export interface OneEuroParams {
  /** Minimum cutoff frequency (Hz). Lower = smoother but more lag. PRIOR. */
  minCutoff: number;
  /** Speed coefficient. Higher = less lag on fast motion. PRIOR. */
  beta: number;
  /** Cutoff for the derivative signal (Hz). PRIOR. */
  dCutoff: number;
}

/** PRIOR defaults — calibrate against real captures before trusting peaks. */
export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.7, beta: 0.3, dCutoff: 1.0 };

/** Smoothing factor for a first-order low-pass at the given cutoff over dt seconds. */
function alpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

/**
 * One-Euro filter over a scalar signal sampled at `times` (ms).
 * Returns a same-length smoothed array. Causal (forward) pass, matching how it
 * would run live on the stream.
 */
export function smoothScalar(
  values: number[],
  times: number[],
  p: OneEuroParams = DEFAULT_ONE_EURO,
): number[] {
  const n = values.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  out[0] = values[0];
  let xPrev = values[0];      // raw previous sample (for the derivative, per Casiez)
  let xHatPrev = values[0];
  let dxHatPrev = 0;
  for (let i = 1; i < n; i++) {
    const dt = Math.max(1e-3, (times[i] - times[i - 1]) / 1000);
    const dx = (values[i] - xPrev) / dt;
    const aD = alpha(p.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * dxHatPrev;
    const cutoff = p.minCutoff + p.beta * Math.abs(dxHat);
    const a = alpha(cutoff, dt);
    const xHat = a * values[i] + (1 - a) * xHatPrev;
    out[i] = xHat;
    xPrev = values[i];
    xHatPrev = xHat;
    dxHatPrev = dxHat;
  }
  return out;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpOpt(a: number | undefined, b: number | undefined, u: number): number | undefined {
  if (a == null && b == null) return undefined;
  return lerp(a ?? b ?? 0, b ?? a ?? 0, u);
}

function lerpLandmarks(a: Landmark[], b: Landmark[], u: number): Landmark[] {
  const n = Math.min(a.length, b.length);
  const out: Landmark[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      x: lerp(a[i].x, b[i].x, u),
      y: lerp(a[i].y, b[i].y, u),
      z: lerp(a[i].z, b[i].z, u),
      visibility: lerpOpt(a[i].visibility, b[i].visibility, u),
      presence: lerpOpt(a[i].presence, b[i].presence, u),
    };
  }
  return out;
}

/**
 * Resample a variable-fps buffer to a uniform Δt (default 60 Hz) by linear
 * interpolation of every landmark coordinate (and visibility/presence).
 * Output timestamps are re-based so the first sample is at t = 0 ms.
 *
 * Returns the input unchanged (copied) when there are < 2 frames.
 */
export function resamplePoseFrames(frames: PoseFrame[], hz = 60): PoseFrame[] {
  const n = frames.length;
  if (n < 2) return frames.slice();
  const t0 = frames[0].t;
  const tEnd = frames[n - 1].t;
  const span = tEnd - t0;
  if (span <= 0) return frames.slice();

  const dt = 1000 / hz;
  const steps = Math.floor(span / dt);
  const out: PoseFrame[] = [];
  let j = 0;
  for (let k = 0; k <= steps; k++) {
    const t = t0 + k * dt; // integer step count avoids floating-point drift
    // Advance j so that frames[j].t <= t <= frames[j+1].t.
    while (j < n - 2 && frames[j + 1].t < t) j++;
    const a = frames[j];
    const b = frames[Math.min(n - 1, j + 1)];
    const segSpan = b.t - a.t;
    const u = segSpan > 0 ? Math.max(0, Math.min(1, (t - a.t) / segSpan)) : 0;
    out.push({
      image: lerpLandmarks(a.image, b.image, u),
      world: lerpLandmarks(a.world, b.world, u),
      t: k * dt,
    });
  }
  return out;
}
