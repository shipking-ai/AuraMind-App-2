/**
 * TextScramble — anime.js v4 `scrambleText` integration.
 *
 * Renders a text element whose characters get progressively "resolved"
 * from a random scramble pool into the final target string. Reads as a
 * Matrix-style decode or a hacker-news typewriter reveal.
 *
 * Use cases in BonaMind:
 *   - Leaderboard rank numbers that scramble into place.
 *   - Onboarding "welcome" text that decodes.
 *   - XP / level-up badge text transitions.
 *   - Tooltip "explainer" lines that reveal.
 *
 * Usage:
 *
 *   <TextScramble duration={1200} trigger={trigger}>
 *     Master your memory
 *   </TextScramble>
 *
 * prefers-reduced-motion: the text is rendered in its final state
 * immediately without any scramble animation.
 */

import { useEffect, useRef } from 'react';
import { animate, scrambleText } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface TextScrambleProps {
  /** Total duration in ms. Default 1200. */
  duration?: number;
  /** Replay the scramble whenever this value changes. */
  trigger?: unknown;
  /** Whether to fire on mount. Default true. */
  autoplay?: boolean;
  /** Custom scramble alphabet. Default: alphanumerics + a few symbols. */
  scrambleChars?: string;
  className?: string;
  children: string;
}

const DEFAULT_SCRAMBLE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

export function TextScramble({
  duration = 1200,
  trigger,
  autoplay = true,
  scrambleChars = DEFAULT_SCRAMBLE_CHARS,
  className,
  children,
}: TextScrambleProps) {
  const reduced = useReducedMotion();
  const targetRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    // Reduced motion, or scrambling disabled: show the copy, full stop.
    if (reduced || !autoplay) {
      el.textContent = children;
      return;
    }

    // scrambleText returns a tween function that resolves random glyphs
    // into the target string over `duration`.
    const animation = animate(el, {
      // @ts-expect-error anime.js v4 accepts a custom tween function here
      textContent: scrambleText(children, { scrambleChars }),
      duration,
      ease: 'linear',
      // The tween's last frame is not guaranteed to be the target string,
      // and a dropped/interrupted animation would otherwise leave the
      // element showing permanent gibberish. This is marketing copy on
      // the landing page — it must always end up readable.
      onComplete: () => {
        el.textContent = children;
      },
    });

    /**
     * Force the final copy, stopping the tween first.
     *
     * Order matters: writing textContent while the animation is still
     * running is pointless because the next frame overwrites it. The
     * scramble must be cancelled before the text is set.
     */
    const settle = () => {
      try {
        animation.pause();
      } catch {
        /* already finished */
      }
      if (el.textContent !== children) el.textContent = children;
    };

    // Safety net for a tween that never completes — backgrounded tab,
    // dropped frames, or a library-side error.
    const timer = window.setTimeout(settle, duration + 400);

    return () => {
      window.clearTimeout(timer);
      settle();
    };
  }, [reduced, children, duration, scrambleChars, autoplay, trigger]);

  return (
    <span
      ref={targetRef}
      className={className}
      aria-label={children}
      // Render the original text in the DOM so screen readers see it even
      // while the visual scramble is in flight.
    >
      {children}
    </span>
  );
}
