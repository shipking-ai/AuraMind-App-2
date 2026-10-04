/**
 * DrawPath — anime.js v4 `createDrawable` SVG path-drawing animation.
 *
 * Animates the `stroke-dashoffset` of an SVG path so it appears to "draw
 * itself" from start to end. The default 0→1 sweep is the classic
 * path-drawing animation (used everywhere from onboarding illustrations
 * to XP-bar traces).
 *
 * Use cases in BonaMind:
 *   - Animated checkmark on quiz correct-answer.
 *   - Streak-flame icon that draws itself on unlock.
 *   - Skill-tree edge connectors when a new path is unlocked.
 *   - Onboarding illustrations that explain the app.
 *
 * Usage:
 *
 *   <DrawPath d="M10 80 L40 10 L70 80" stroke="#7C3AED" duration={1200}>
 *     <svg viewBox="0 0 100 100">
 *       <path d="M10 80 L40 10 L70 80" fill="none" strokeWidth={3} />
 *     </svg>
 *   </DrawPath>
 *
 * prefers-reduced-motion: the path is rendered fully drawn (offset=0)
 * immediately, so users with reduced-motion get the final visual without
 * the sweep.
 */

import { useEffect, useRef } from 'react';
import {
  animate,
  createDrawable,
  onScroll,
  stagger as animeStagger,
} from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface DrawPathProps {
  /** Optional override of the selector used by createDrawable. */
  selector?: string;
  /** Animation duration in ms. Default 1200. */
  duration?: number;
  /** Delay before the animation starts, in ms. Default 0. */
  delay?: number;
  /**
   * Whether to fire the animation on mount. Can be:
   * - `true` (default): auto-play on mount
   * - `false`: manual control via `trigger`
   * - `'scroll'`: bind to scroll position with sync (like animejs.com hero)
   */
  autoplay?: boolean | 'scroll';
  /** Replay the animation whenever this changes. */
  trigger?: unknown;
  /** Draw start/end values. Default [0, 1]. Pass ['0 0', '0 1', '1 1'] for staggered path draw. */
  draw?: [string, string] | [string, string, string];
  /** Easing function name. Default 'inOutQuad'. */
  ease?: string;
  className?: string;
  children: React.ReactNode;
}

export function DrawPath({
  selector = 'path',
  duration = 1200,
  delay = 0,
  autoplay = true,
  trigger,
  draw,
  ease,
  className,
  children,
}: DrawPathProps) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // createDrawable mutates each path to have stroke-dasharray and
    // stroke-dashoffset set to the path length. Calling animate on the
    // returned drawable tweens offset from `start` to `end` (default 0→1).
    const paths = container.querySelectorAll(selector);
    if (paths.length === 0) return;
    const drawables = createDrawable(paths, 0, 1);

    if (reduced) {
      // Set the final state so the path is fully drawn without animation.
      (drawables as unknown as Array<{ set: (k: string, v: unknown) => void }>).forEach(
        (d) => d.set?.('progress', 1),
      );
      return;
    }

    if (autoplay === 'scroll') {
      // Scroll-synced path drawing — like the animejs.com landing page hero.
      // Uses onScroll({ sync: true }) to bind the draw progress to scroll.
      // The `draw` prop defines staggered progress values for multi-path SVGs.
      // Accept both 2-element and 3-element draw arrays.
      const drawValues = draw ?? (['0 0', '0 1', '1 1'] as const);
      animate(drawables as unknown as Parameters<typeof animate>[0], {
        draw: drawValues as unknown as string[],
        delay: animeStagger(40),
        ease: ease ?? 'inOut(3)',
        autoplay: onScroll({ sync: true }),
      });
      return () => {
        /* scroll observer auto-cleans on scope exit */
      };
    }

    if (!autoplay) return;

    // `createDrawable` returns drawables where each has a tween control
    // for the path-progress (0..1). The anime.js v4 API exposes those
    // as animatable properties on the returned object.
    animate(drawables as unknown as Parameters<typeof animate>[0], {
      progress: [0, 1],
      duration,
      delay,
      ease: ease ?? 'inOutQuad',
    });

    return () => {
      // Cancel any in-flight tween on unmount.
      animate(drawables as unknown as Parameters<typeof animate>[0], {
        progress: 1,
        duration: 0,
      });
    };
     
  }, [reduced, selector, duration, delay, autoplay, trigger, draw, ease]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
