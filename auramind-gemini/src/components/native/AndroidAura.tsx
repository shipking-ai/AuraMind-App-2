import React from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { AURA_DEPTH_LAYERS, AURA_SCROLL_SPRING, auraHueFilter } from "./auraDepth";

/**
 * AndroidAura — the installed app's "living" hero mark.
 *
 * Built entirely in code (inline SVG) rather than an image asset so it stays
 * razor-sharp at every density. Motion is driven by CSS keyframes (see
 * `platform-styles.css`) instead of SMIL so it honours `prefers-reduced-motion`
 * and Playwright's `animations: disabled` for deterministic visual tests.
 * It reads as a single focus point — a Prism core with orbit paths and
 * particles — rather than a generic equalizer or loader.
 *
 * Scroll reactivity (opt-in): pass `scrollY` — the shell's clamped,
 * rAF-throttled scroll MotionValue — and the mark gains a depth stack on top
 * of its time-drift: the core rises slightly against the scroll (nearest),
 * the halo/orbits/particles sink progressively (deeper), and the whole mark's
 * hue drifts warm over a long read. This is exactly the web dashboard's
 * grammar (NovaDashboardShell) applied to the native hero.
 *
 * Property ownership: framer owns `style.y` on the layer <g> wrappers and
 * `filter` on the root <svg>; the CSS keyframes animate only transform on the
 * inner groups (`.aura-orbit*`, `.aura-breathe`, `.aura-core-breathe`) — no
 * element has two owners of the same property, so the framer-owns-transform
 * trap can't bite here. At scrollTop 0 every layer renders y=0 and filter
 * `none` — the exact pre-change static mark.
 */
export default function AndroidAura({
  className = "",
  scrollY,
}: {
  className?: string;
  /** Clamped scroll MotionValue from the shell; omit for a purely
   *  time-animated mark (welcome screen, previews). */
  scrollY?: MotionValue<number>;
}) {
  const fallback = useMotionValue(0);
  const spring = useSpring(scrollY ?? fallback, AURA_SCROLL_SPRING);
  const [core, halo, orbits, particles] = AURA_DEPTH_LAYERS;
  const coreY = useTransform(spring, (v) => v * core.depth);
  const haloY = useTransform(spring, (v) => v * halo.depth);
  const orbitsY = useTransform(spring, (v) => v * orbits.depth);
  const particlesY = useTransform(spring, (v) => v * particles.depth);
  const filter = useTransform(spring, auraHueFilter);

  return (
    <motion.svg
      viewBox="0 0 240 240"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      style={{ filter }}
    >
      <defs>
        <radialGradient id="aura-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ede9fe" stopOpacity="0.95" />
          <stop offset="38%" stopColor="#c4b5fd" stopOpacity="0.55" />
          <stop offset="70%" stopColor="#7c3aed" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="aura-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#f0abfc" stopOpacity="0.85" />
        </linearGradient>
        <filter id="aura-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Breathing halo behind the core */}
      <motion.g style={{ y: haloY }}>
        <circle
          className="aura-breathe"
          cx="120"
          cy="120"
          r="86"
          fill="none"
          stroke="url(#aura-ring)"
          strokeWidth="1"
          opacity="0.5"
        />
      </motion.g>

      {/* Counter-rotating dashed orbits */}
      <motion.g style={{ y: orbitsY }}>
        <g className="aura-orbit aura-orbit-a">
          <circle
            cx="120"
            cy="44"
            r="66"
            fill="none"
            stroke="#c4b5fd"
            strokeWidth="1.25"
            strokeDasharray="3 10"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
        <g className="aura-orbit aura-orbit-b">
          <circle
            cx="120"
            cy="60"
            r="50"
            fill="none"
            stroke="#67e8f9"
            strokeWidth="1.25"
            strokeDasharray="1 8"
            strokeLinecap="round"
            opacity="0.55"
          />
        </g>
      </motion.g>

      {/* Orbiting particles */}
      <motion.g style={{ y: particlesY }}>
        {[0, 1, 2].map((index) => (
          <g key={index} className={`aura-orbit aura-particle aura-particle-${index}`}>
            <circle
              cx="120"
              cy={index % 2 === 0 ? "34" : "206"}
              r={index === 1 ? "3.5" : "2.4"}
              fill={index === 1 ? "#f0abfc" : "#67e8f9"}
              filter="url(#aura-glow)"
              opacity="0.9"
            />
          </g>
        ))}
      </motion.g>

      {/* Prism core — nearest layer */}
      <motion.g style={{ y: coreY }}>
        <circle
          className="aura-core-breathe"
          cx="120"
          cy="120"
          r="30"
          fill="url(#aura-core)"
          filter="url(#aura-glow)"
        />
        <path
          className="aura-prism"
          d="M120 96 L136 120 L120 144 L104 120 Z"
          fill="#0d1528"
          opacity="0.85"
          stroke="#ede9fe"
          strokeWidth="1"
        />
      </motion.g>
    </motion.svg>
  );
}
