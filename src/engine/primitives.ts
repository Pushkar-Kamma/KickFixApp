/**
 * Foundation contracts for the KickFix analysis pipeline (Phase 0, M0.Foundation).
 *
 * Core principle: RECOGNITION (which technique is this?) is separated from
 * QUALITY (how well was it executed?). A recognized-but-poor attempt is a
 * failed attempt with a correction — never a silent discard. Anything the
 * sensor cannot support is `unobservable`, never a forced fail.
 *
 * These types are intentionally minimal and cover only what Phase 0 uses
 * (the technique gate + segmentation). The fuller streaming `PrimitiveEvent`
 * contract for punches/blocks/combos/forms is specified in expansion.md and
 * will be added when those phases are built.
 */

/** The three kick techniques the gate currently discriminates. */
export type KickTechniqueId = 'front' | 'side' | 'round';

/** All technique buckets, including the catch-all for motion that fits nothing. */
export type TechniqueId = KickTechniqueId | 'other';

/**
 * Whether a feature/criterion could actually be measured from the available
 * landmarks in the supported camera view. Distinct from pass/fail:
 * an `unobservable` feature contributes nothing to the score or the gate.
 */
export type Observability = 'observable' | 'unobservable';

/** The gate's decision about a captured motion, given the requested mode. */
export type GateOutcome =
  /** detected === requested with enough confidence + coverage → proceed to score. */
  | 'accept'
  /** recognized a DIFFERENT technique with high confidence → offer one-tap re-score. */
  | 'redirect'
  /** low confidence / low margin / low coverage → reject with a retry prompt. */
  | 'uncertain'
  /** motion is mostly toward/away from the camera → cannot judge honestly. */
  | 'unsupported_view';

/** A single discriminative feature with its observability. */
export interface TechniqueFeature {
  id: string;
  /** Raw value in the feature's natural unit (deg, ratio, …). NaN when unobservable. */
  value: number;
  observable: boolean;
  /** Optional human note (why unobservable, which landmarks were missing, …). */
  note?: string;
}

/** One entry of the normalized technique distribution (sums to 1 across all). */
export interface TechniqueMembership {
  technique: TechniqueId;
  probability: number;
}

/** Result of running the technique identity gate on a captured motion. */
export interface TechniqueGateResult {
  /** The mode the user selected in the UI. */
  requested: KickTechniqueId;
  /** Best-supported technique, or null when the gate is uncertain. */
  detected: TechniqueId | null;
  outcome: GateOutcome;
  /** Top probability P1. */
  confidence: number;
  /** Separation P1 − P2 (how decisive the top pick is). */
  margin: number;
  /** Fraction of discriminative features that were observable, in [0, 1]. */
  coverage: number;
  /** Full normalized distribution over {front, side, round, other}. */
  distribution: TechniqueMembership[];
  /** The features that were computed (for UI explanation + telemetry). */
  features: TechniqueFeature[];
  /** Human-readable reason, surfaced to the user and logged to telemetry. */
  reason: string;
}

/** All numeric thresholds in Phase 0 are PRIORS pending calibration on labeled
 *  clips. They are collected in one place so tomorrow's calibration tunes
 *  numbers without touching logic. Do not treat these as validated. */
export interface GatePriors {
  /** Min top-probability to accept/redirect. */
  tauAccept: number;
  /** Min P1 − P2 margin to accept/redirect. */
  minMargin: number;
  /** Min coverage (observable feature fraction) to emit any decision. */
  minCoverage: number;
}

export const GATE_PRIORS: GatePriors = {
  // PRIOR — calibrate. Re-derived for direct normalization (not softmax).
  tauAccept: 0.5,
  minMargin: 0.15,
  minCoverage: 0.5,
};
