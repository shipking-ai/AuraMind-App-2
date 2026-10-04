/**
 * Scope — anime.js v4 `createScope` React wrapper.
 *
 * The marquee v4 feature: scopes batch-create animations on a subtree and
 * auto-cleanup on unmount. Use the `data-anime-{property}` HTML attributes
 * (matching the v4 convention) to declaratively bind animations to elements
 * inside the scope, then optionally call the imperative `animate(targets)`
 * method from a ref to trigger them.
 *
 * Example:
 *
 *   <Scope ref={scopeRef} defaults={{ duration: 600, ease: 'outQuad' }}>
 *     <div data-anime-opacity="[0, 1]" data-anime-y="[16, 0]">Hello</div>
 *     <div data-anime-opacity="[0, 1]" data-anime-y="[16, 0]">World</div>
 *   </Scope>
 *
 *   // Later:
 *   scopeRef.current?.animate('[data-anime]');
 *
 * Use cases in BonaMind:
 *   - Reveal every card in a deck grid when it enters view.
 *   - Animate all leaderboard rows at once on tab switch.
 *   - Stagger-in learning-path modules.
 *
 * The component itself is a thin `<div>` wrapper — its power is in the
 * ref's `animate()` and `revert()` methods.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createScope, type ScopeParams } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface ScopeProps extends ScopeParams {
  className?: string;
  children: React.ReactNode;
}

export interface ScopeHandle {
  /**
   * Run all `data-anime-*` declarations in the subtree as a single batch.
   * Mirrors `scope.animate(selector)`.
   */
  animate: (selector?: string) => void;
  /** Tear down the scope — detaches listeners, cancels active tweens. */
  revert: () => void;
}

export const Scope = forwardRef<ScopeHandle, ScopeProps>(function Scope(
  props,
  ref,
) {
  const { className, children, ...scopeOpts } = props;
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<ReturnType<typeof createScope> | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // createScope takes a DOMTarget. By default, it roots at the container.
    const scope = createScope({
      root,
      ...scopeOpts,
    });
    scopeRef.current = scope;

    return () => {
      scope.revert();
      scopeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      animate(selector = '[data-anime]') {
        if (reduced) return; // skip animation under reduced-motion
        const scope = scopeRef.current;
        if (!scope) return;
        // The Scope instance has an .animate(selector) method that picks
        // up all data-anime-* declarations and tweens them.
        (scope as unknown as { animate: (sel: string) => unknown }).animate?.(selector);
      },
      revert() {
        scopeRef.current?.revert();
      },
    }),
    [reduced],
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
});
