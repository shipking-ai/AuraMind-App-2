/**
 * MorphShape — anime.js v4 `morphTo` SVG path morphing component.
 *
 * Animates the `d` attribute of one SVG path to another path's `d`
 * attribute. Requires paths with the same number of commands.
 *
 * Implementation note:
 *   anime.js v4's `morphTo(target, precision)` requires a CSS selector
 *   (TargetsParam) — NOT the raw path string. The selector must point
 *   to a `<path>` element in the DOM so anime.js can resolve its target
 *   geometry. We render an invisible `<svg>` carrying the target path
 *   with a stable id, then `morphTo('#morph-target-{id} path')`.
 *
 * Use cases in BonaMind:
 *   - Mood/emotion emoji that morphs based on mastery level.
 *   - Star → trophy morph on achievement unlock.
 *   - Loading spinner state changes.
 *   - Diagram-style step transitions in learning paths.
 *
 * Usage:
 *
 *   <MorphShape
 *     from="M10 10 L90 10 L90 90 L10 90 Z"
 *     to="M50 10 L90 50 L50 90 L10 50 Z"
 *     duration={800}
 *     trigger={triggerValue}
 *   />
 *
 * prefers-reduced-motion: the path snaps directly to `to` without animation.
 */

import { useEffect, useId, useRef } from 'react';
import { animate, morphTo } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface MorphShapeProps {
  /** Initial SVG path `d` attribute. */
  from: string;
  /** Target SVG path `d` attribute to morph toward. */
  to: string;
  /** Animation duration in ms. Default 600. */
  duration?: number;
  /** Path-point precision (number of samples). Default 1 (anime.js default). */
  precision?: number;
  /** Replay the morph whenever this value changes. */
  trigger?: unknown;
  className?: string;
  /** stroke width applied to the rendered path. Default 2. */
  strokeWidth?: number;
  /** stroke color. Default BonaMind primary violet. */
  stroke?: string;
}

export function MorphShape({
  from,
  to,
  duration = 600,
  precision,
  trigger,
  className,
  strokeWidth = 2,
  stroke = '#7C3AED',
}: MorphShapeProps) {
  const reduced = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  // Stable id so morphTo's CSS selector resolves the same DOM node across
  // re-renders. useId is preferred over Math.random() so SSR hydration
  // doesn't mismatch.
  const reactId = useId();
  const targetId = `morph-target-${reactId.replace(/[:]/g, '')}`;

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;

    if (reduced) {
      path.setAttribute('d', to);
      return;
    }

    try {
      // morphTo returns a FunctionValue (a tween) that interpolates the
      // visible source path's `d` from its current value to the target
      // path's `d`. The selector must point at the target <path> in DOM.
      const morphFn = morphTo(
        `#${targetId} path`,
        precision,
      );
      animate(path, {
        d: morphFn,
        duration,
        ease: 'inOutQuad',
      });
    } catch {
      // Defensive: if morphTo can't resolve the selector (e.g. target
      // not yet in DOM, or the path strings have incompatible commands),
      // snap to the target rather than crashing the page.
      path.setAttribute('d', to);
    }

    return () => {
      path.setAttribute('d', to);
    };
  }, [reduced, from, to, duration, precision, trigger, targetId]);

  return (
    <>
      {/* Hidden target SVG. anime.js v4's morphTo needs the target as a
          CSS-resolvable DOM node (NOT a raw path string). This SVG is
          visually invisible (0×0, off-screen) but the target path
          geometry is fully readable from the DOM. */}
      <svg
        aria-hidden="true"
        focusable="false"
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
      >
        <svg id={targetId}>
          <path d={to} />
        </svg>
      </svg>
      <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
        <path
          ref={pathRef}
          d={from}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}
