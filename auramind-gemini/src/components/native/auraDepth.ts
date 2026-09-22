/**
 * Aura depth math — shared by the Android focus aura (and any future
 * scroll-reactive element in the native shell).
 *
 * Mirrors the depth stack from NovaDashboardShell's web aurora: a MotionValue
 * fed by a rAF-throttled scroll listener, spring-smoothed per layer, each
 * layer reading `y = scroll · depth`. Constants are kept in sync with
 * NovaDashboardShell.tsx (SCROLL_CAP_PX / SCROLL_SPRING) — the Android shell
 * scrolls the same `#nova-main-content` element.
 *
 * Positive depth drifts the layer DOWN as content scrolls up → reads as
 * deeper than the content. Negative reads as nearer.
 */

/** Matches the web shell: a long page saturates the effect instead of
 *  pushing layers off-screen. */
export const AURA_SCROLL_CAP_PX = 900;

/** Aura layers, near → far. The core is nearest (largest negative factor),
 *  halo and orbits sit progressively deeper, and the hue drifts warm as the
 *  reading gets long — the same "veil rises, depth sinks" grammar as the
 *  web dashboard. */
export const AURA_DEPTH_LAYERS = [
  /** Prism core — nearest: rises slightly against the scroll. */
  { key: 'core', depth: -0.08 },
  /** Breathing halo — the veil, just behind the core. */
  { key: 'halo', depth: -0.05 },
  /** Orbit paths — mid-stack. */
  { key: 'orbits', depth: 0.1 },
  /** Orbiting particles — deepest of the moving layers. */
  { key: 'particles', depth: 0.18 },
] as const;

export type AuraLayerKey = (typeof AURA_DEPTH_LAYERS)[number]['key'];

/** Hue drift in degrees per scrolled px (violet → warm over a long read). */
export const AURA_HUE_PER_PX = 0.05;

/** Shared spring smoothing — same values as the web shell's SCROLL_SPRING,
 *  so both auroras settle with the same personality. */
export const AURA_SCROLL_SPRING = { stiffness: 60, damping: 20, mass: 0.8 };

/** Clamp raw scrollTop to the effect's usable range. NaN fails safe to the
 *  static baseline; ±Infinity saturate naturally through the clamp. */
export function clampAuraScroll(scrollTop: number): number {
  if (Number.isNaN(scrollTop)) return 0;
  return Math.min(Math.max(scrollTop, 0), AURA_SCROLL_CAP_PX);
}

/** Parallax translation for one layer, in px, from a clamped scroll value.
 *  Normalises IEEE negative zero (0 × negative depth) to +0 so the baseline
 *  is byte-identical to the static mark — vitest's `toBe(0)` and framer's
 *  transform serialization both distinguish -0 from 0. */
export function auraLayerY(layerKey: AuraLayerKey, clampedScroll: number): number {
  const layer = AURA_DEPTH_LAYERS.find((l) => l.key === layerKey);
  if (!layer) return 0;
  const y = Math.fround(clampedScroll * layer.depth * 1000) / 1000;
  return y === 0 ? 0 : y;
}

/** Hue-rotate filter string for a clamped scroll value. Zero scroll must
 *  produce exactly `none` — the static baseline — not `hue-rotate(0deg)`. */
export function auraHueFilter(clampedScroll: number): string {
  const deg = clampedScroll * AURA_HUE_PER_PX;
  if (deg === 0) return 'none';
  return `hue-rotate(${Math.fround(deg * 100) / 100}deg)`;
}
