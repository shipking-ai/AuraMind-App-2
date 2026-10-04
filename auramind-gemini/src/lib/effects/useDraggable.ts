/**
 * useDraggable — anime.js v4 drag-to-reorder hook.
 *
 * Wraps `createDraggable()` from the anime.js draggable sub-module so React
 * components can declaratively opt into drag-and-drop without managing
 * the imperative draggable instance directly. The instance is created on
 * mount and reverted on unmount (via anime.js's own `revert()`), which
 * avoids the manual listener-cleanup footgun that vanilla pointer-event
 * handlers would require.
 *
 * Use cases in BonaMind:
 *   - Reorderable decks in the dashboard.
 *   - Reorderable cards inside a deck editor.
 *   - Draggable challenge cards.
 *
 * Usage:
 *
 *   const ref = useDraggable<HTMLDivElement>({
 *     axis: 'y',
 *     onDragEnd: (target) => console.log('dropped at', target.y),
 *   });
 *   return <div ref={ref}>drag me</div>;
 */

import { useEffect, useRef } from 'react';
import { createDraggable } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export type DraggableAxis = 'x' | 'y';

export interface UseDraggableOptions {
  /** Constrain drag to one axis. Default: free 2D drag. */
  axis?: DraggableAxis;
  /** Container bounding the draggable. Default: viewport. */
  container?: HTMLElement | string | null;
  /** Released-back easing when user drops. Default: anime.js default. */
  releaseEase?: string;
  /** Called when the user begins dragging. */
  onDragStart?: () => void;
  /** Called when the user releases the drag (cancelled or completed). */
  onDragEnd?: () => void;
  /** Disable under prefers-reduced-motion (drag becomes no-op). Default: true. */
  respectReducedMotion?: boolean;
}

export function useDraggable<T extends HTMLElement>(opts: UseDraggableOptions = {}) {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);

  // Memoize the resolved options object so the effect's dep array stays stable.
  // We intentionally don't deep-compare — callers should pass stable refs.
  const resolvedOpts = {
    ...(opts.axis ? { axis: opts.axis } : {}),
    ...(opts.container ? { container: opts.container } : {}),
    ...(opts.releaseEase ? { releaseEase: opts.releaseEase } : {}),
    ...(opts.onDragStart ? { onDragStart: opts.onDragStart } : {}),
    ...(opts.onDragEnd ? { onDragEnd: opts.onDragEnd } : {}),
    respectReducedMotion: opts.respectReducedMotion ?? true,
  };

  useEffect(() => {
    if (resolvedOpts.respectReducedMotion && reduced) {
      // Skip wiring the draggable entirely. Caller still gets a ref back
      // so the component renders, but the element is non-interactive.
      return;
    }
    const el = ref.current;
    if (!el) return;

    const draggable = createDraggable(el, {
      ...(resolvedOpts.axis ? { axis: resolvedOpts.axis } : {}),
      ...(resolvedOpts.container ? { container: resolvedOpts.container } : {}),
      ...(resolvedOpts.releaseEase ? { releaseEase: resolvedOpts.releaseEase } : {}),
      ...(resolvedOpts.onDragStart ? { onDragStart: resolvedOpts.onDragStart } : {}),
      ...(resolvedOpts.onDragEnd ? { onDragEnd: resolvedOpts.onDragEnd } : {}),
    });

    // anime.js v4's draggable instance exposes .revert() to detach all
    // listeners and clean up the animation state. Calling it on unmount
    // is the canonical cleanup path.
    return () => {
      try {
        draggable.revert?.();
      } catch {
        // anime.js occasionally throws on revert if the target was already
        // detached. That's fine — no listeners left to clean up.
      }
    };
     
  }, [
    reduced,
    resolvedOpts.axis,
    resolvedOpts.container,
    resolvedOpts.releaseEase,
    resolvedOpts.onDragStart,
    resolvedOpts.onDragEnd,
    resolvedOpts.respectReducedMotion,
  ]);

  return ref;
}
