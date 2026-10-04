/**
 * useConfetti
 *
 * Thin wrapper around canvas-confetti that:
 *   1. Respects prefers-reduced-motion (returns a no-op when reduced)
 *   2. Uses BonaMind's violet/purple brand palette by default
 *   3. Returns a stable callback so callers don't need to memoize
 *
 * The underlying canvas-confetti package is the source of truth — the
 * official Magic UI Confetti is just a wrapper around this same library,
 * so going direct avoids the wrapper tax.
 */
import { useCallback } from 'react';
import confetti from 'canvas-confetti';
import { usePrefersReducedMotion } from './useReducedMotion';

// BonaMind brand palette — taken from design tokens.
const AURAMIND_COLORS = [
  '#8B5CF6', // violet-400 (primary)
  '#7C3AED', // violet-600 (button)
  '#A855F7', // purple-500 (gradient stop)
  '#3B82F6', // blue-500 (secondary accent)
  '#F59E0B', // amber (rare sparkle)
] as const;

export interface ConfettiOptions {
  /** Override brand palette for themed bursts (e.g. emerald for market wins) */
  colors?: string[];
  /** Particle count (default 80) */
  particleCount?: number;
  /** Spread angle in degrees (default 70) */
  spread?: number;
  /** Vertical origin (0 top, 1 bottom) (default 0.6) */
  originY?: number;
  /** Scalar multiplier for particle size (default 1) */
  scalar?: number;
  /** Burst from both sides simultaneously (good for level-ups) */
  twin?: boolean;
  /** Duration in ms to spray (default = one-shot) */
  durationMs?: number;
}

/**
 * Trigger a confetti burst. Returns a memoized callback that respects
 * the user's reduced-motion preference. A no-op when reduced.
 */
export function useConfetti() {
  const reduced = usePrefersReducedMotion();

  const fire = useCallback(
    (options: ConfettiOptions = {}) => {
      if (reduced) return; // skip silently

      const {
        colors = AURAMIND_COLORS as unknown as string[],
        particleCount = 80,
        spread = 70,
        originY = 0.6,
        scalar = 1,
        twin = false,
        durationMs,
      } = options;

      const baseConfig: confetti.Options = {
        particleCount,
        spread,
        startVelocity: 45,
        scalar,
        ticks: 200,
        colors: colors as unknown as string[],
        disableForReducedMotion: true, // belt + suspenders — also handled by our hook
        origin: { x: 0.5, y: originY },
      };

      if (durationMs && durationMs > 0) {
        // Confetti shower — fire every 16ms for the duration
        const end = Date.now() + durationMs;
        (function frame() {
          confetti({ ...baseConfig, particleCount: Math.floor(particleCount / 4) });
          if (Date.now() < end) requestAnimationFrame(frame);
        })();
      } else if (twin) {
        // Twin burst from left and right edges (great for streak milestones)
        confetti({ ...baseConfig, angle: 60, origin: { x: 0.1, y: originY } });
        confetti({ ...baseConfig, angle: 120, origin: { x: 0.9, y: originY } });
      } else {
        confetti(baseConfig);
      }
    },
    [reduced],
  );

  return fire;
}

/**
 * Imperative class-based confetti for non-React contexts (e.g. service workers,
 * utility modules). Same reduced-motion guard as the hook.
 */
export function fireConfetti(options: ConfettiOptions = {}) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Reuse the hook's logic via internal call (slightly duplicated to avoid
  // pulling React hooks into a non-component file).
  const {
    colors = AURAMIND_COLORS as unknown as string[],
    particleCount = 80,
    spread = 70,
    originY = 0.6,
    twin = false,
    durationMs,
  } = options;

  const baseConfig: confetti.Options = {
    particleCount,
    spread,
    startVelocity: 45,
    ticks: 200,
    colors: colors as unknown as string[],
    disableForReducedMotion: true,
    origin: { x: 0.5, y: originY },
  };

  if (durationMs && durationMs > 0) {
    const end = Date.now() + durationMs;
    (function frame() {
      confetti({ ...baseConfig, particleCount: Math.floor(particleCount / 4) });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  } else if (twin) {
    confetti({ ...baseConfig, angle: 60, origin: { x: 0.1, y: originY } });
    confetti({ ...baseConfig, angle: 120, origin: { x: 0.9, y: originY } });
  } else {
    confetti(baseConfig);
  }
}

export default useConfetti;
