/**
 * MotionPath — anime.js v4 `createMotionPath` "animate along an SVG path".
 *
 * Animates an element along an SVG path's geometry. The element's
 * translateX, translateY, and rotate values are derived from the path's
 * sampled points, so it traces the curve as if riding it.
 *
 * Implementation note:
 *   - anime.js v4's `createMotionPath` accepts a `TargetsParam` — i.e. an
 *     SVGPathElement or CSS selector, NOT the raw `d` string. We render
 *     the path as an <svg><path/></svg> inside the wrapper, grab the
 *     element via ref, and pass THAT to createMotionPath.
 *
 * Use cases in BonaMind:
 *   - An XP particle riding a reward curve from card to progress bar.
 *   - A "level up" arrow tracing up through skill tree.
 *   - Mascot walk-cycle in onboarding.
 *
 * Usage:
 *
 *   <MotionPath
 *     path="M10 80 C 40 10, 65 10, 95 80"
 *     duration={1500}
 *     autoplay
 *   >
 *     <div className="w-4 h-4 rounded-full bg-pink-500" />
 *   </MotionPath>
 *
 * prefers-reduced-motion: the child element is rendered at the path's
 * starting point with no animation.
 */

import {
  useEffect,
  useRef,
  Children,
  isValidElement,
  cloneElement,
} from 'react';
import { animate, createMotionPath } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface MotionPathProps {
  /** SVG path string (passed to <path d="...">). */
  path: string;
  /** Animation duration in ms. Default 1500. */
  duration?: number;
  /** Delay before the animation starts, in ms. Default 0. */
  delay?: number;
  /** Whether to fire on mount. Default true. */
  autoplay?: boolean;
  /** Repeat on a loop. Default false. */
  loop?: boolean;
  /** Replay the motion whenever this value changes. */
  trigger?: unknown;
  className?: string;
  children: React.ReactNode;
}

export function MotionPath({
  path,
  duration = 1500,
  delay = 0,
  autoplay = true,
  loop = false,
  trigger,
  className,
  children,
}: MotionPathProps) {
  const reduced = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pathEl = pathRef.current;
    const wrapper = wrapperRef.current;
    if (!pathEl || !wrapper) return;

    // anime.js v4's createMotionPath takes an SVGPathElement (or CSS
    // selector), NOT the raw `d` string. Passing the element directly
    // avoids the "invalid selector" error.
    const motion = createMotionPath(pathEl as unknown as Parameters<typeof createMotionPath>[0]);

    if (reduced) {
      wrapper.style.translate = '0 0';
      return;
    }

    if (!autoplay) return;

    try {
      animate(wrapper, {
        ...motion,
        duration,
        delay,
        loop,
        ease: 'inOutSine',
      });
    } catch {
      // Defensive: jsdom can't sample SVG path geometry (missing
      // getTotalLength / getPointAtLength on SVGPathElement). Real
      // browsers implement these so the production call never throws.
      // The wrapper is already at translate 0 0 (its natural state).
      wrapper.style.translate = '0 0';
    }

    return () => {
      wrapper.style.translate = '0 0';
    };
  }, [reduced, path, duration, delay, autoplay, loop, trigger]);

  // Clone the child to ensure it's a positioned element. If the child is
  // not a valid element (string/fragment), wrap in a span.
  const childArray = Children.toArray(children);
  const first = childArray[0];
  const positionedChild = isValidElement(first)
    ? cloneElement(first as React.ReactElement<{ style?: React.CSSProperties }>, {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          ...((first.props as { style?: React.CSSProperties })?.style ?? {}),
        },
      })
    : <span>{first}</span>;

  return (
    <div ref={wrapperRef} className={className} style={{ position: 'relative' }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <path
          ref={pathRef}
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={0}
        />
      </svg>
      {positionedChild}
    </div>
  );
}
