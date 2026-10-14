// ─── Nova custom SVG icons ─────────────────────────────────────────────────
// Hand-rolled SVG glyphs that animate on their own where the icon set is
// not expressive enough. Keep this file small — anything beyond ~4 glyphs
// should be added to the vendored set in components/icons so the project's
// icon language stays consistent.

import { motion } from 'framer-motion';
import { useRM } from './motion';

// ─── <AnimatedBrandMark /> ─────────────────────────────────────────────────
// The BonaMark we use in the sidebar brand slot. A subtle "breathing" pulse
// ring lets the brand feel alive without dominating the layout. Two colour
// modes — admin (rose/amber) and user (violet/fuchsia) — selected by prop.

export function AnimatedBrandMark({
  variant = 'user',
  size = 32,
}: {
  variant?: 'user' | 'admin';
  size?: number;
}) {
  const reduced = useRM();
  const gradient = variant === 'admin'
    ? { from: '#F43F5E', via: '#F59E0B', to: '#DC2626', ring: 'rgba(244,63,94,0.35)' }
    : { from: '#7C3AED', via: '#8B5CF6', to: '#C026D3', ring: 'rgba(124,58,237,0.35)' };

  return (
    <div
      className="relative flex items-center justify-center rounded-lg shadow-lg overflow-hidden"
      style={{ width: size, height: size }}
    >
      {/* Gradient wash */}
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          background: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.via} 50%, ${gradient.to} 100%)`,
        }}
        aria-hidden
      />

      {/* Pulsing ring — masked to the rounded square */}
      {!reduced && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            boxShadow: `inset 0 0 0 1px ${gradient.ring}, 0 0 8px ${gradient.ring}`,
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden
        />
      )}

      {/* Glyph — a stacked "aurora" (rays converging at the centre). */}
      <svg
        viewBox="0 0 24 24"
        className="relative z-10"
        style={{ width: size * 0.55, height: size * 0.55 }}
        fill="none"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M12 4 L12 20" opacity="0.9" />
        <path d="M4 12 L20 12" opacity="0.6" />
        <path d="M7 7 L17 17" opacity="0.4" />
        <path d="M17 7 L7 17" opacity="0.4" />
        <circle cx="12" cy="12" r="1.5" fill="white" stroke="none" />
      </svg>
    </div>
  );
}

// ─── <PulsingDot /> ────────────────────────────────────────────────────────
// A 6px dot with a pulsing halo — used to indicate real-time / live counts.

export function PulsingDot({
  size = 6,
  color = '#8B5CF6',
  ariaLabel,
}: {
  size?: number;
  color?: string;
  ariaLabel?: string;
}) {
  const reduced = useRM();
  return (
    <span
      className="relative inline-flex"
      style={{ width: size * 2, height: size * 2 }}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      <span
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: size, height: size, background: color }}
      />
      {!reduced && (
        <motion.span
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{ width: size, height: size, background: color, opacity: 0.5 }}
          animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          aria-hidden
        />
      )}
    </span>
  );
}

// ─── <MiniSparkle /> ───────────────────────────────────────────────────────
// A small 4-point sparkle used on AI actions / locked achievements. Animates
// a slow rotate. Optional.

export function MiniSparkle({
  size = 14,
  color = '#FBBF24',
}: {
  size?: number;
  color?: string;
}) {
  const reduced = useRM();
  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      animate={reduced ? undefined : { rotate: [0, 15, -10, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden
    >
      <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
    </motion.svg>
  );
}
