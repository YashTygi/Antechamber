import type { Label, Sensitivity, Tuning } from './types';
import { SENSITIVITY_OFFSET, FLOOR_MIN, FLOOR_MAX, CALIBRATION_LABELED_FRACTION } from './defaults';

/**
 * Vectors from MiniLM are mean-pooled and L2-normalized, so cosine similarity
 * reduces to a plain dot product.
 */
export function cosineSim(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Two-gate neutral band:
 *  1. if neither side clears SIM_FLOOR → the title isn't in the user's world → neutral
 *  2. else if the two sides are within MARGIN_BAND → too close to call → neutral
 *  3. else → whichever side is higher.
 *
 * We take the MAX similarity to any example (not the average): a productive
 * list may mix unrelated topics, and a match to *one* should still count.
 */
export function decideLabel(pSim: number, uSim: number, simFloor: number, marginBand: number): Label {
  if (pSim < simFloor && uSim < simFloor) return 'neutral';
  if (Math.abs(pSim - uSim) < marginBand) return 'neutral';
  return pSim > uSim ? 'productive' : 'unproductive';
}

/** max similarity to any example (not average): a list may mix unrelated
 *  topics and a match to one should still count. */
export function bestSims(
  vec: Float32Array,
  pVecs: Float32Array[],
  uVecs: Float32Array[],
): { pSim: number; uSim: number } {
  const pSim = pVecs.length ? Math.max(...pVecs.map((v) => cosineSim(vec, v))) : 0;
  const uSim = uVecs.length ? Math.max(...uVecs.map((v) => cosineSim(vec, v))) : 0;
  return { pSim, uSim };
}

export function classifyVec(
  vec: Float32Array,
  pVecs: Float32Array[],
  uVecs: Float32Array[],
  simFloor: number,
  marginBand: number,
): { label: Label; pSim: number; uSim: number } {
  const { pSim, uSim } = bestSims(vec, pVecs, uVecs);
  return { label: decideLabel(pSim, uSim, simFloor, marginBand), pSim, uSim };
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** The floor actually used at classification time: calibrated value shifted by
 *  the user's sensitivity preference. */
export function effectiveFloor(tuning: Tuning, sensitivity: Sensitivity): number {
  return clamp(tuning.simFloor + SENSITIVITY_OFFSET[sensitivity], FLOOR_MIN, FLOOR_MAX);
}

/**
 * Pick a floor from the distribution of best-similarities seen across a real
 * sample of titles, so that ~CALIBRATION_LABELED_FRACTION of them clear it and
 * get a label. Data-driven beats a hand-picked constant — real titles score
 * lower than intuition suggests, and it varies per user/keyword set.
 */
export function calibrateFloor(bestSims: number[]): number {
  if (bestSims.length < 4) return 0.2; // too little signal → safe default
  const sorted = [...bestSims].sort((a, b) => a - b);
  const pct = 1 - CALIBRATION_LABELED_FRACTION; // floor at this percentile
  const idx = Math.round(pct * (sorted.length - 1));
  return clamp(sorted[idx], FLOOR_MIN, FLOOR_MAX);
}

/** Tiny FNV-1a hash — lets the cache notice when a videoId's title changed. */
export function hashTitle(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
