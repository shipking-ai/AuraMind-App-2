/**
 * StaggerList — anime.js v4 staggered-entrance wrapper for child arrays.
 *
 * Wraps any list of children in a container div, applies
 * `data-stagger-item` to each child so anime.js can target them, and runs
 * a single `animate(items, { delay: stagger(...), ... })` on mount.
 *
 * Use cases in BonaMind:
 *   - Decks grid on the dashboard.
 *   - Achievement badges list (they currently pop in all at once).
 *   - Learning-path modules (currently a static fade).
 *   - Leaderboard rows.
 *
 * The container is a plain `<div>`; pass `className` to style it.
 *
 * prefers-reduced-motion: by default, the entrance animation is skipped.
 * Pass `respectReducedMotion={false}` to force the animation regardless.
 */

import { Children, cloneElement, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import { animate, stagger } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface StaggerListProps {
  children: ReactNode | ReactNode[];
  /** Delay between successive children entering, in ms. Default 60. */
  delayMs?: number;
  /** Animation duration per item, in ms. Default 600. */
  durationMs?: number;
  /** Direction children slide in from. Default 'up'. */
  from?: 'up' | 'down' | 'left' | 'right';
  /** Initial opacity (0 = invisible, 1 = already visible). Default 0. */
  fromOpacity?: number;
  /** Pixel distance for the slide-in. Default 24. */
  distance?: number;
  /** Honor prefers-reduced-motion. Default true. */
  respectReducedMotion?: boolean;
  className?: string;
}

const TRANSLATE: Record<NonNullable<StaggerListProps['from']>, { x: number; y: number }> = {
  up: { x: 0, y: 24 },
  down: { x: 0, y: -24 },
  left: { x: 24, y: 0 },
  right: { x: -24, y: 0 },
};

export function StaggerList({
  children,
  delayMs = 60,
  durationMs = 600,
  from = 'up',
  fromOpacity = 0,
  distance,
  respectReducedMotion = true,
  className,
}: StaggerListProps) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  // Re-derive a stable child-key string so the effect runs only when the
  // child SET changes (length or identity), not on every parent render.
  const childKey = Children.count(children);

  useEffect(() => {
    if (respectReducedMotion && reduced) return;
    const container = containerRef.current;
    if (!container) return;

    const items = container.querySelectorAll<HTMLElement>('[data-stagger-item]');
    if (items.length === 0) return;

    const { x: dx, y: dy } = TRANSLATE[from];
    // Allow the caller to override the per-axis magnitude. If `distance`
    // is provided, it scales BOTH axes proportionally so the slide vector
    // matches the caller's intuition ("slide in by 48px").
    const scale = distance !== undefined ? distance / (Math.abs(dx) + Math.abs(dy) || 1) : 1;

    // Single anime.js animate() with stagger delay — the v4 way to do
    // entrance reveals. Each item gets its own tween, all sharing one
    // animation call (cheaper than N independent animates).
    animate(items, {
      opacity: [fromOpacity, 1],
      translateX: [dx * scale, 0],
      translateY: [dy * scale, 0],
      delay: stagger(delayMs),
      duration: durationMs,
      ease: 'outQuad',
    });
  }, [
    reduced,
    childKey,
    delayMs,
    durationMs,
    from,
    fromOpacity,
    distance,
    respectReducedMotion,
  ]);

  // Clone children to attach `data-stagger-item` so anime.js can target
  // them by attribute. Falls back to wrapping each child in a div if
  // the child isn't a valid element (string/fragment).
  const childArray = Children.toArray(children);

  return (
    <div ref={containerRef} className={className}>
      {childArray.map((child, i) => {
        if (!isValidElement(child)) {
          return (
            <div key={`stagger-${i}`} data-stagger-item>
              {child}
            </div>
          );
        }
        // Build the merged props once, typed as a plain record so the
        // spread below is type-safe (TS complains about a ternary of
        // unknown/typed without a unifying annotation).
        const childProps = child.props as Record<string, unknown>;
        const mergedProps: Record<string, unknown> = 'data-stagger-item' in childProps
          ? childProps
          : { ...childProps, 'data-stagger-item': '' };
        // Prefer the child's own key; fall back to index.
        const childKeyValue =
          (child.key as string | number | null | undefined) ?? `stagger-${i}`;
        return cloneElement(
          child,
          { key: childKeyValue, ...(mergedProps as object) },
        );
      })}
    </div>
  );
}
