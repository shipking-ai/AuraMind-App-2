/**
 * TextSplit — anime.js v4 `splitText` integration.
 *
 * Splits a string of text into `<span>`-wrapped chars, words, and/or lines
 * so each unit can be animated independently. The most common pattern is
 * a staggered entrance where each character fades/slides in sequence.
 *
 * Use cases in BonaMind:
 *   - Hero headline reveal on landing page.
 *   - Toast headings that animate in.
 *   - Quiz question reveal with a typewriter feel.
 *   - Section title transitions.
 *
 * Usage:
 *
 *   <TextSplit as="chars" stagger={30} duration={500}>
 *     Master your memory
 *   </TextSplit>
 *
 * For advanced animation, use the ref to access the underlying
 * TextSplitter instance and call `.chars`, `.words`, `.lines` to target
 * subsets with `animate()`.
 *
 * prefers-reduced-motion: all chars/words/lines are rendered in their
 * final visible state with no animation.
 */

import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { animate, splitText, type TextSplitter } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface TextSplitProps {
  /** Which split mode(s) to produce. Default 'chars'. */
  as?: 'chars' | 'words' | 'lines';
  /**
   * HTML tag rendered as the outer wrapper around the children. Default
   * `'div'` — block-level, fits most layouts. Pass `'span'` for inline
   * contexts (e.g. text inside an `<h1>`/`<h2>`/`<p>` would otherwise
   * fail W3C content-model validation).
   */
  wrapperTag?: 'div' | 'span';
  /** Delay between successive units, in ms. Default 30. */
  stagger?: number;
  /** Animation duration per unit, in ms. Default 500. */
  duration?: number;
  /** Whether to fire the entrance animation on mount. Default true. */
  autoplay?: boolean;
  className?: string;
  children: string;
}

export interface TextSplitHandle {
  /** The underlying TextSplitter instance — access .chars/.words/.lines. */
  splitter: TextSplitter | null;
  /** Replay the entrance animation. */
  replay: () => void;
}

export const TextSplit = forwardRef<TextSplitHandle, TextSplitProps>(
  function TextSplit(
    {
      as = 'chars',
      wrapperTag = 'div',
      stagger = 30,
      duration = 500,
      autoplay = true,
      className,
      children,
    },
    ref,
  ) {
    const reduced = useReducedMotion();
    const containerRef = useRef<HTMLElement>(null);
    const splitterRef = useRef<TextSplitter | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // splitText can throw / return undefined in jsdom because the
      // TextSplitter reaches into DOM internals (ResizeObserver callbacks,
      // document fonts ready) that jsdom doesn't fully implement. We
      // wrap in try/catch so the component never throws — worst case
      // we just don't animate (text is rendered as-is).
      let splitter: ReturnType<typeof splitText> | null = null;
      try {
        splitter = splitText(container, {
          chars: { wrap: 'clip' },
          words: { wrap: 'clip' },
          lines: { wrap: 'clip' },
        });
      } catch {
        splitter = null;
      }
      if (!splitter) return;
      splitterRef.current = splitter;

      const targets = splitter[as];
      if (!targets || targets.length === 0) return;

      if (reduced) {
        // Make all units visible immediately.
        animate(targets, {
          opacity: [1, 1],
          translateY: [0, 0],
          duration: 0,
        });
        return;
      }

      if (autoplay) {
        animate(targets, {
          opacity: [0, 1],
          translateY: [16, 0],
          delay: (_el, i) => (i ?? 0) * stagger,
          duration,
          ease: 'outQuad',
        });
      }

      return () => {
        // Revert the split: remove the wrapping spans and restore the
        // original text. The TextSplitter exposes a .revert() method.
        splitter.revert();
      };
    }, [reduced, as, stagger, duration, autoplay, children]);

    useImperativeHandle(
      ref,
      () => ({
        get splitter() {
          return splitterRef.current;
        },
        replay() {
          if (reduced) return;
          const targets = splitterRef.current?.[as];
          if (!targets) return;
          animate(targets, {
            opacity: [0, 1],
            translateY: [16, 0],
            delay: (_el, i) => (i ?? 0) * stagger,
            duration,
            ease: 'outQuad',
          });
        },
      }),
      [reduced, as, stagger, duration],
    );

    // Toggling between <div> and <span> requires `createElement` rather
    // than a JSX literal: a runtime tag like `<Tag ref={containerRef}>`
    // would force tsc to pick ONE intrinsic element type for the ref slot,
    // rejecting our `HTMLElement`-typed ref. `createElement` keeps the
    // ref slot generic so both branches compile.
    return createElement(
      wrapperTag,
      { ref: containerRef, className },
      children,
    );
  },
);
