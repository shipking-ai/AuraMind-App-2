/**
 * animeUtils — typed wrappers over anime.js v4 utilities.
 *
 * anime.js v4 exposes individual utility functions (NOT a `chainable`
 * factory — `chainable.d.ts` only exports the underlying utility VALUES
 * like `clamp`, `snap`, `wrap`, `lerp`, etc., not a `chainable` function).
 * `utils.stagger`, `utils.random` ARE top-level exports because the main
 * `index.d.ts` does `export * from "./utils/index.js"`. So we re-export
 * the top-level names AND keep our own project-local helpers (`clamp`,
 * `lerp`, etc. — anime.js v4 does NOT export `clamp`/`lerp`/`snap`/
 * `mapRange`/`damp` as standalone functions, only inside `chainable.d.ts`).
 *
 * Why we re-implement these locally:
 *   - The set we need is 6 functions (~30 lines of code total).
 *   - External math helpers would add ~10KB to bundle for a 30-line surface.
 *   - Keeping these in-tree means we can swap implementations later (e.g.
 *     a Bezier-aware remapClamp) without touching consumers.
 */

import {
  random,
  stagger,
  createSeededRandom,
} from 'animejs';

// ─── Re-exports of anime.js v4 top-level utils ────────────────────────────

export { random, stagger, createSeededRandom };

/** Pick a random element from a non-empty array. */
export function randomPick<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('randomPick: empty array');
  return arr[Math.floor(random(0, arr.length - 1))] as T;
}

/** Fisher-Yates shuffle, returning a new array (does not mutate input). */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    // anime.js v4 `random(min, max)` is INCLUSIVE of max, so clamp the
    // index to i — otherwise out[j] can write past the end of the array.
    const j = Math.min(Math.floor(random(0, i + 1)), i);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

// ─── Project-local math helpers (anime.js v4 does not export these as
//     standalone top-level functions — only inside chainable.d.ts) ─────────

/** Clamp a value to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Linear interpolation between a and b by t (0..1). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate-independent damping (spring-physics style). */
export function damp(
  start: number,
  end: number,
  deltaTime: number,
  factor = 8,
): number {
  // Spring-physics-style damp — output value approaches `end` exponentially.
  // `factor` is the time-constant inverse (higher = faster).
  return lerp(start, end, 1 - Math.exp(-factor * (deltaTime / 1000)));
}

/** Map a value from one range to another. */
export function mapRange(
  value: number,
  inLow: number,
  inHigh: number,
  outLow: number,
  outHigh: number,
): number {
  if (inHigh === inLow) return outLow;
  return outLow + ((value - inLow) * (outHigh - outLow)) / (inHigh - inLow);
}

/** Wrap a value into [min, max] (inclusive of max). */
export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return value - range * Math.floor((value - min) / range);
}

/** Snap a value to the nearest multiple of `step`. */
export function snap(value: number, step: number): number {
  if (step === 0) return value;
  return Math.round(value / step) * step;
}

/** Degree ↔ radian conversion. */
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

// ─── Distance / Easing helpers ─────────────────────────────────────────────

/** Convert an BonaMind easing name to a string-compatible easing token
 * usable by `animate()`/`createTimeline()`.
 */
export type AuraEasingName =
  | 'linear'
  | 'inQuad'
  | 'outQuad'
  | 'inOutQuad'
  | 'inCubic'
  | 'outCubic'
  | 'inOutCubic'
  | 'inQuart'
  | 'outQuart'
  | 'inOutQuart'
  | 'inExpo'
  | 'outExpo'
  | 'inOutExpo'
  | 'inCirc'
  | 'outCirc'
  | 'inOutCirc'
  | 'inBack'
  | 'outBack'
  | 'inOutBack'
  | 'inElastic'
  | 'outElastic'
  | 'inOutElastic'
  | 'inBounce'
  | 'outBounce'
  | 'inOutBounce';
