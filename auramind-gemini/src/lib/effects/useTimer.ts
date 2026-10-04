/**
 * useTimer — anime.js v4 `createTimer` React hook.
 *
 * Wraps the imperative Timer instance so React components can declaratively
 * run time-based animations (countdowns, repeating pulses, sequenced
 * callbacks). The Timer is created on mount and cancelled on unmount,
 * which matches React's lifecycle and avoids the listener-cleanup footgun
 * of vanilla setInterval/setTimeout.
 *
 * Use cases in BonaMind:
 *   - Pomodoro countdown ring on the study timer.
 *   - Streak pulse animation (1-second onComplete, repeat).
 *   - "Level up" delay before the celebration fires.
 *   - Quiz question timeout bar.
 *
 * Returned API mirrors the underlying Timer:
 *   play / pause / resume / restart / reset / reverse / seek / alternate / cancel.
 *
 * prefers-reduced-motion: the timer is still created (so the elapsed-time
 * accounting is accurate) but the onUpdate visual updates should be a
 * no-op in the calling component.
 */

import { useEffect, useRef } from 'react';
import { createTimer, type TimerParams } from 'animejs';

export interface UseTimerOptions extends Omit<TimerParams, 'duration'> {
  /** Total duration in ms. Default 1000. */
  duration?: number;
  /** Run once at mount, or auto-pause until you call play(). Default: true. */
  autoplay?: boolean;
}

export interface UseTimerHandle {
  play: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  reset: () => void;
  reverse: () => void;
  seek: (timeMs: number) => void;
  alternate: () => void;
  cancel: () => void;
}

export function useTimer(opts: UseTimerOptions = {}): UseTimerHandle {
  const {
    duration = 1000,
    autoplay = true,
    ...rest
  } = opts;

  // Hold the live Timer instance so controls can mutate it from outside
  // the effect without re-creating it on every render.
  const timerRef = useRef<ReturnType<typeof createTimer> | null>(null);

  // We want a stable handle object that always reflects the LATEST opts
  // without re-creating the timer when only callbacks change. So we keep
  // a separate ref of the most recent options and have the controls call
  // the underlying Timer methods.
  const optsRef = useRef(rest);
  optsRef.current = rest;

  useEffect(() => {
    // createTimer returns a Timer (Timer extends Clock) with play/pause/etc.
    // Pass `autoplay: false` when autoplay is false; otherwise leave it
    // undefined so the Timer's default (true) kicks in.
    const timer = createTimer({
      duration,
      ...(autoplay ? {} : { autoplay: false }),
      ...optsRef.current,
    });
    timerRef.current = timer;

    return () => {
      // cancel() detaches the rAF loop and prevents future onUpdate fires.
      // Without this, a Timer created in a modal could keep firing after
      // unmount.
      timer.cancel();
      timerRef.current = null;
    };
    // Intentionally only re-create the timer on duration/autoplay changes.
    // Callback identity changes shouldn't restart the clock.
     
  }, [duration, autoplay]);

  return {
    play: () => timerRef.current?.play(),
    pause: () => timerRef.current?.pause(),
    resume: () => timerRef.current?.resume(),
    restart: () => timerRef.current?.restart(),
    reset: () => timerRef.current?.reset(),
    reverse: () => timerRef.current?.reverse(),
    seek: (timeMs) => timerRef.current?.seek(timeMs),
    alternate: () => timerRef.current?.alternate(),
    cancel: () => timerRef.current?.cancel(),
  };
}
