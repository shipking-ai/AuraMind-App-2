import React from 'react';
import { PARENT_COMPANY_NAME } from '../../lib/branding';

interface VectorMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * VectorMark — the parent-brand glyph for CogniVect.
 *
 * Three nested converging chevrons ascending a vertical axis — reads as
 * "vector / direction / advance" without leaning into literal-arrow
 * corporate iconography. Single-stroke, scales linearly, picks up
 * currentColor so Tailwind text-violet-400/80 (the consumer's primary
 * caller) renders correctly via the standard color inheritance.
 *
 * The `title` prop is the aria-accessible label. The default falls back
 * to a runtime derivation of PARENT_COMPANY_NAME so the literal
 * CogniVect string lives ONLY in lib/branding.ts — the single source
 * of truth enforced by the regression test.
 */
export const VectorMark: React.FC<VectorMarkProps> = ({
  size = 14,
  className = '',
  title,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role="img"
    aria-label={title ?? `${PARENT_COMPANY_NAME} mark`}
  >
    {/* Vertical axis — the 'vector' direction. */}
    <path d="M12 4v14" />
    {/* Two nested chevrons converging — the 'advance' rays. */}
    <path d="M7 9l5-5 5 5" />
    <path d="M7 14l5-5 5 5" />
  </svg>
);

/**
 * Variant tier for the parent line:
 *   - 'inline'   Sidebar logo strip — small + tight.
 *   - 'splash'   Onboarding splash — larger, more presence.
 *   - 'footnote' Legal / docs footer — uppercase, minimal contrast.
 *
 * 'splash' replaces an earlier 'stacked' label; the layout is unchanged
 * (single row), only the name better matches where the variant is used.
 */
type CogniWordmarkVariant = 'inline' | 'splash' | 'footnote';

interface CogniWordmarkProps {
  className?: string;
  /** Render with text. If false, only the VectorMark glyph shows. */
  withText?: boolean;
  variant?: CogniWordmarkVariant;
  /** Override the parent name (e.g. in tests or i18n contexts). */
  parentName?: string;
}

/**
 * CogniWordmark — the parent-brand line that travels BENEATH or BESIDE
 * every BonaMind wordmark in the app shell.
 *
 * Always pulls its canonical name from `lib/branding.ts` — never inline.
 * The component itself is presentational: no state, no side effects.
 */
export const CogniWordmark: React.FC<CogniWordmarkProps> = ({
  className = '',
  withText = true,
  variant = 'inline',
  parentName,
}) => {
  const sizeMap: Record<CogniWordmarkVariant, number> = {
    inline: 11,
    splash: 22,
    footnote: 9,
  };
  const size = sizeMap[variant];
  const name = parentName ?? PARENT_COMPANY_NAME;

  return (
    <span
      className={`flex items-center gap-1.5 text-[#7A7A96] ${className}`}
      data-brand-parent="cogniavect"
      data-variant={variant}
    >
      {withText && (
        <span className="font-medium uppercase tracking-[0.18em] text-[0.62em] opacity-80">
          by
        </span>
      )}
      <VectorMark
        size={size}
        className="text-violet-400/80"
      />
      {withText && (
        <span className="font-semibold tracking-tight">{name}</span>
      )}
    </span>
  );
};

export default CogniWordmark;
