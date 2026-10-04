/**
 * useAnimatable — anime.js v4 `createAnimatable` React hook.
 *
 * Returns a reactive proxy object whose properties are tween values
 * bound to the underlying DOM targets. Useful when you need a React
 * state value to react to an animation in progress (think: a slider
 * knob that you can scrub manually OR animate programmatically with
 * the same state hook).
 *
 * Use cases in BonaMind:
 *   - Volume slider that smoothly tweens to a new value on user action.
 *   - Study-timer progress ring (0-1) driven by both real-time updates
 *     and animated "fill" transitions.
 *   - Smooth brightness slider on a theme picker.
 *
 * Returned shape:
 *   - The proxy returned by anime.js v4's createAnimatable is opaque-
 *     typed (the v4 AnimatableObject is not generic). Callers access
 *     keys via the same names they passed in `params`. Each key is
 *     a tween function: `proxy.x(value, duration?)` animates, `proxy.x()`
 *     reads current.
 *
 * prefers-reduced-motion: callers should branch on the same flag and
 * call the proxy directly without animation.
 */

import { useEffect, useRef } from 'react';
import {
  createAnimatable,
  type AnimatableParams,
  type AnimatableObject,
} from 'animejs';

export type UseAnimatableOptions = AnimatableParams;

/**
 * `T` is only for the caller's static type-info; the proxy is not
 * generic at runtime. We return a passthrough-typed AnimatableObject
 * (anime.js v4's AnimatableObject is opaque/non-generic).
 */
export function useAnimatable<TParams extends AnimatableParams>(
  target: Parameters<typeof createAnimatable>[0],
  params: TParams,
): AnimatableObject {
  const animatableRef = useRef<AnimatableObject | null>(null);

  useEffect(() => {
    const animatable = createAnimatable(target, params);
    animatableRef.current = animatable;

    return () => {
      animatable.revert();
      animatableRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the proxy hasn't been created yet (effect hasn't run), return a
  // safe no-op proxy that mirrors the requested keys as direct setters.
  if (!animatableRef.current) {
    const stub = {} as AnimatableObject;
    Object.keys(params).forEach((k) => {
      (stub as unknown as Record<string, unknown>)[k] = () => undefined;
    });
    return stub;
  }

  return animatableRef.current;
}
