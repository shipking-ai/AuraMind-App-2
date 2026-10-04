/**
 * AnimeCelebration — anime.js v4 effect that fires an expanding-gradient ring
 * + label pop alongside (not replacing) the Confetti bursts on achievement
 * unlock / streak-milestone events.
 *
 * Why alongside Confetti:
 *   - Confetti handles PARTICLES (debris flying outward).
 *   - AnimeCelebration handles the FRAMING effect — a soft expanding halo
 *     that "punctuates" the moment and a centered label that names what the
 *     user just earned ("+25 XP", "7-day streak!", "Achievement unlocked").
 *     Together they read as a complete celebration unit; either alone is
 *     thinner.
 *
 * Why anime.js v4 (and not another library):
 *   - Already installed (`animejs: ^4.5.0`) but never imported anywhere in
 *     the codebase before — this component is the first real consumer so
 *     the dependency earns its keep.
 *   - v4's `animate(targets, params)` API reads clean, has built-in timeline
 *     scoping, and supports the easing curves the design team picked
 *     (`outExpo` for the halo, `outQuad` for the label).
 *   - Lightweight (no React reconciliation per frame; anime.js mutates DOM
 *     directly via the selectors it tracks).
 *
 * Color palette:
 *   - `palette?: string[]` defaults to BonaMind's primary gradient stops
 *     (violet → pink → cyan). Same default as `Confetti` and `AreaChart` so
 *     the celebration reads as part of the design language, not a third-
 *     party library demo. The first two stops drive the halo gradient;
 *     the optional third stop is reserved for future use.
 *
 * z-index layering (deliberate):
 *   - Page content sits at z=0–10.
 *   - Toasts/notifications sit at z=50–60. THIS COMPONENT sits at z=45 so
 *     a simultaneous "XP earned" toast or notification pill is NOT
 *     occluded by the halo. The celebration overlays page content but
 *     defers to ephemeral notifications.
 *   - Modals/dialogs sit at z>900. Far above us; we don't compete with
 *     focused dialogs.
 *
 * Accessibility:
 *   - Under prefers-reduced-motion, `celebrate()` is a no-op. The label
 *     element does NOT animate; aria-live announcements should be
 *     handled by the parent (e.g. announce "Achievement unlocked" via the
 *     toast system).
 *   - The element is `aria-hidden="true"` because the visible animation is
 *     decorative; the actual semantic meaning is conveyed by the parent's
 *     aria-live region.
 *
 * IMPORTANT — single-owner rule:
 *   - The AchievementsDashboard is the SOLE owner of `<AnimeCelebration>`.
 *     If you wire this into `components/achievements/AchievementUnlock.tsx`
 *     (the toast-style notification) later, a user that triggers an
 *     achievement will see TWO celebrations on the same event. Pick ONE
 *     surface to own the burst.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { spring, createTimeline } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export interface AnimeCelebrationProps {
  /**
   * Halo + label color stops. Defaults to BonaMind's primary gradient
   * (violet → pink → cyan) — same defaults as `Confetti` + `AreaChart` so
   * the celebration reads as part of the design language.
   * The first two stops drive the halo gradient; opacity is appended via
   * hex8 shorthand (e.g. `${palette[0]}80` = 50% alpha, `${palette[1]}50` ≈ 31%).
   *
   * CONSTRAINT: stops MUST be 6-digit hex strings (`#RRGGBB`) — the alpha
   * is appended as the 7th and 8th hex digits to form a valid 8-digit hex
   * color (`#RRGGBBAA`). Non-hex stops like `rgb(...)` or named colors
   * silently produce invalid CSS (`'rgb(...)80'`) and the halo will not
   * render. If you need a non-hex stop, normalize to `#RRGGBB` upstream.
   *
   * At least 2 stops are required; the optional third is reserved for
   * future use (label glow accent). Anything shorter falls back to the
   * BonaMind defaults.
   */
  palette?: string[];
}

export interface AnimeCelebrationHandle {
  /**
   * Fire the celebration. Safe to call repeatedly; each call cancels the
   * previous animation on the same target before starting the new one
   * (anime.js handles this automatically by overwriting the live tween).
   *
   * @param opts.label      Optional centered text (e.g. "+25 XP", "7-day streak!").
   * @param opts.intensity  `subtle` (1.4× halo), `normal` (1.9×), or `epic` (2.4×).
   */
  celebrate: (opts?: {
    label?: string;
    intensity?: 'subtle' | 'normal' | 'epic';
  }) => void;
}

// BonaMind primary palette — violet → pink → cyan. Same default as the
// `Confetti` and `AreaChart` components so the celebration visual reads as
// part of the design language, not a generic anime.js demo.
const AURAMIND_PALETTE = ['#7C3AED', '#EC4899', '#06B6D4'] as const;

const INTENSITY_SCALE = {
  subtle: 1.4,
  normal: 1.9,
  epic: 2.4,
} as const;

export const AnimeCelebration = forwardRef<
  AnimeCelebrationHandle,
  AnimeCelebrationProps
>(function AnimeCelebration(props, ref) {
  // Resolve palette defensively: a literal const still flows through the
  // readonly type, and an empty array from a caller would degrade silently
  // to a "no color stops" gradient. Fall back to the BonaMind default in
  // both cases.
  const palette: readonly string[] =
    props.palette && props.palette.length >= 2 ? props.palette : AURAMIND_PALETTE;
  const [c1, c2] = palette;

  const reduced = useReducedMotion();
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      celebrate(opts) {
        // prefers-reduced-motion: short-circuit. The parent has its own
        // aria-live region for semantic announcement, so skipping the
        // animation doesn't lose information — just spectacle.
        if (reduced) return;

        const ring = ringRef.current;
        const label = labelRef.current;
        if (!ring) return;

        const intensity = opts?.intensity ?? 'normal';
        const scale = INTENSITY_SCALE[intensity];

        // v4 marquee feature: createTimeline() lets us sequence the halo
        // and label with explicit offset (+200ms) so the label pops AFTER
        // the halo's snap, reading as one choreographed burst rather than
        // two overlapping tweens. The label uses createSpring (physics-
        // based easing) instead of a static curve — the small overshoot
        // gives the label a "settling into place" feel that complements
        // the halo's outExpo snap.
        const labelText = opts?.label;
        const tl = createTimeline({
          defaults: { ease: 'outExpo' },
        });
        tl.add(ring, {
          scale: [0, scale],
          opacity: [0.9, 0],
          duration: 1100,
        });
        if (label && labelText) {
          label.textContent = labelText;
          tl.add(
            label,
            {
              opacity: [0, 1, 1, 0],
              scale: [0.85, 1.08, 1, 1],
              y: [16, 0, 0, -14],
              duration: 1500,
              ease: spring({ mass: 0.6, stiffness: 220, damping: 14 }),
            },
            200, // offset from timeline start — start the label 200ms in.
          );
        }
      },
    }),
    // `c1`/`c2` are intentionally NOT in the deps array: the closure
    // doesn't read them. Only `reduced` (the early-return gate) matters.
    // `ringRef`/`labelRef` are stable refs so they're also safe to omit.
    [reduced],
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        // z-index 45: above page content (0-10), below toasts (50-60) so
        // a simultaneous "XP earned" notification pill / toast is not
        // occluded by the halo. See docstring header for full layering.
        zIndex: 45,
      }}
    >
      {/* Expanding gradient halo. Alpha shortcuts:
            `${c1}80` = 128/255 ≈ 50% alpha, `${c2}50` = 80/255 ≈ 31% alpha.
            Both form valid hex8 (#RRGGBBAA). 100% stop = bare transparent. */}
      <div
        ref={ringRef}
        data-testid="anime-celebration-ring"
        style={{
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${c1}80 0%, ${c2}50 60%, transparent 100%)`,

          opacity: 0,
          transform: 'scale(0)',
          willChange: 'transform, opacity',
          // Position the halo above the page midpoint (40% top, centered).
          position: 'absolute',
          top: '40%',
          left: '50%',
          translate: '-50% -50%',
        }}
      />
      {/* Centered label (the "earned" text). c1 again so the text glow is
          in the violet half of the palette. */}
      <div
        ref={labelRef}
        data-testid="anime-celebration-label"
        style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          translate: '-50% -50%',
          marginTop: '120px',
          fontFamily: 'inherit',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#F0EFFE',
          textShadow: `0 0 16px ${c1}80`,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});
