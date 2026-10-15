/**
 * ProfLinneaEmptyState — Reusable empty-state shell driven by Prof. Linnea instead
 * of a dull gray icon. Used wherever the app has nothing to show: empty decks,
 * zero-XP leaderboard, no chat sessions, search miss, expired study queue.
 *
 * The hero shows a gradient ProfLinnea avatar whose mood reactively shifts
 * based on context (`inviting`, `sleepy`, `celebrating`, `curious`). A short
 * headline + supporting line + 1-3 CTA buttons gives users a concrete next
 * step instead of just a sad-icon stare.
 *
 * Usage:
 *   <ProfLinneaEmptyState
 *     mood="inviting"
 *     title="No decks yet"
 *     description="Prof. Linnea will quiz you on whatever you teach it. Start with a topic."
 *     actions={[{ label: "Open Generator", icon: Sparkles, onClick: ... }]}
 *   />
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Moon, Sparkles, Star, type LucideIcon } from '@/components/icons';
import ProfLinnea from '../chat/ProfLinnea';
import { cn } from '@/lib/utils';

// Local tweak: ProfLinnea's `mood` prop accepts `'default' | 'encouraging'
// | 'focused'`. We map our five-sentiment EmptyMood down to that union so
// the typed prop validates end-to-end.
type MoodTone = 'default' | 'encouraging' | 'focused';
const gap = (mood: EmptyMood): MoodTone => {
  switch (mood) {
    case 'inviting': return 'encouraging';
    case 'sleepy': return 'focused';
    case 'curious': return 'default';
    case 'celebrating': return 'encouraging';
    case 'encouraging': return 'encouraging';
  }
};

export type EmptyMood = 'inviting' | 'sleepy' | 'curious' | 'celebrating' | 'encouraging';

export interface EmptyAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  primary?: boolean;
  href?: string;
}

export interface ProfLinneaEmptyStateProps {
  title: string;
  description?: string;
  mood?: EmptyMood;
  size?: 'sm' | 'md' | 'lg';
  /** Optional specific streak / XP to drive Prof. Linnea's mood (e.g. celebrating for new users). */
  streak?: number;
  audioLevel?: number;
  actions?: EmptyAction[];
  /** Decorative hint in tiny font above the title — e.g. "STEP 1 OF 3" */
  eyebrow?: string;
  /** Optional small badge row at the bottom — e.g. { "Personalized", "Beta" }. */
  badges?: string[];
  className?: string;
}

/**
 * Map empty-state mood to ProfLinnea's typed `variant` union. ProfLinnea's actual
 * `ProfLinneaVariant = 'rest' | 'thinking' | 'streaming' | 'badge'` — there is
 * no 'smol' variant, so 'sleepy' falls back to 'thinking' (animated head
 * micro-movement reads as "quiet") and 'celebrating' stays on 'rest'.
 */
const MOOD_TO_PROF_VARIANT: Record<EmptyMood, 'rest' | 'badge' | 'thinking' | 'streaming'> = {
  inviting: 'rest',
  sleepy: 'thinking',
  curious: 'badge',
  celebrating: 'rest',
  encouraging: 'rest',
};

const SIZE_MAP = {
  sm: { halo: 'w-14 h-14', avatarPx: 46, headline: 'text-base', body: 'text-xs' },
  md: { halo: 'w-20 h-20', avatarPx: 68, headline: 'text-lg sm:text-xl', body: 'text-sm' },
  lg: { halo: 'w-24 h-24', avatarPx: 84, headline: 'text-2xl sm:text-3xl', body: 'text-sm sm:text-base' },
} as const;

/**
 * Map empty-state mood → numerical mood for useMoodForProfLinnea.
 * Kept for future integration; not currently forwarded to ProfLinnea since
 * the typed mood sentinel above handles variant-mapped variants correctly.
 */
const moodTone: Record<EmptyMood, number> = {
  inviting: 0.7,
  sleepy: 0.2,
  curious: 0.6,
  celebrating: 0.95,
  encouraging: 0.75,
};
void moodTone; // reserved for future use

function ProfLinneaEmptyState({
  title,
  description,
  mood = 'inviting',
  size = 'md',
  streak: _streak = 0,
  audioLevel,
  actions = [],
  eyebrow,
  badges,
  className,
}: ProfLinneaEmptyStateProps) {
  const dim = SIZE_MAP[size];
  const variant = MOOD_TO_PROF_VARIANT[mood];
  // Forward to ProfLinnea's typed `mood` sentinel via a small Mood enum mapper.
  // We deliberately do NOT pass a free 0..1 number — ProfLinnea rejects it.
  const profMood = gap(mood);
  const MoodIcon = mood === 'celebrating' ? Sparkles : mood === 'curious' ? Moon : Star;

  const labelTone =
    mood === 'celebrating'
      ? 'from-emerald-400 via-cyan-400 to-violet-400'
      : mood === 'curious'
      ? 'from-violet-400 via-fuchsia-400 to-cyan-400'
      : mood === 'sleepy'
      ? 'from-slate-400 via-slate-500 to-slate-600'
      : 'from-violet-400 via-fuchsia-400 to-cyan-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 160, damping: 22 }}
      className={cn(
        'relative flex flex-col items-center justify-center text-center px-6 py-10 sm:py-14',
        className,
      )}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden"
      >
        <div className="absolute top-[-30%] right-[-20%] w-[420px] h-[420px] bg-violet-600/[0.05] blur-[110px] rounded-full" />
        <div className="absolute bottom-[-30%] left-[-20%] w-[360px] h-[360px] bg-fuchsia-600/[0.04] blur-[100px] rounded-full" />
      </div>

      {/* Hero halo + ProfLinnea gradient */}
      <div className="relative mb-5">
        <div className={cn('relative', dim.halo)}>
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-[-8px] rounded-[28px] bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-cyan-500/30 blur-md opacity-80"
          />
          <div className="relative w-full h-full rounded-3xl bg-gradient-to-br from-[#7C3AED] via-[#EC4899] to-[#06B6D4] flex items-center justify-center shadow-xl shadow-violet-500/25">
            <ProfLinnea variant={variant} size={dim.avatarPx} mood={profMood} audioLevel={audioLevel} />
          </div>

          {/* Mood-specific floating icon orbiter */}
          {mood !== 'sleepy' && (
            <motion.span
              aria-hidden
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 pointer-events-none"
              style={{
                transformOrigin: '50% 50%',
              }}
            >
              <span
                className="absolute flex items-center justify-center text-[#C4C4D4]"
                style={{
                  top: -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                <MoodIcon className="size-4" />
              </span>
            </motion.span>
          )}
        </div>
      </div>

      {/* Eyebrow + title + description */}
      {eyebrow && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7A7A96] mb-2">
          {eyebrow}
        </p>
      )}
      <h3
        className={cn(
          'font-semibold tracking-tight text-[#F0EFFE] max-w-md',
          dim.headline,
        )}
      >
        {title.split(' ').map((word, i) =>
          i === title.split(' ').length - 1 ? (
            <span
              key={i}
              className={cn('bg-gradient-to-r bg-clip-text text-transparent', labelTone)}
            >
              {word}
            </span>
          ) : (
            <React.Fragment key={i}>{word} </React.Fragment>
          ),
        )}
      </h3>
      {description && (
        <p
          className={cn(
            'text-[#8A8AA3] mt-2 max-w-md leading-relaxed',
            dim.body,
          )}
        >
          {description}
        </p>
      )}

      {/* CTA buttons */}
      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions.map((a, i) => {
            const Icon = a.icon;
            const onClick = () => {
              if (a.href && typeof window !== 'undefined') {
                window.history.pushState({}, '', a.href);
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
              a.onClick();
            };
            return (
              <motion.button
                key={a.label + i}
                initial={{ y: 6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                whileHover={{ y: -1, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onClick}
                className={cn(
                  'px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2',
                  a.primary
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-lg shadow-violet-500/20 hover:opacity-95'
                    : 'bg-[#1A1A24] border border-[#2A2A3A] hover:border-[#7C3AED]/40 text-[#F0EFFE]',
                )}
              >
                {Icon && <Icon size={13} />}
                {a.label}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Badges row */}
      {badges && badges.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
          {badges.map((b) => (
            <span
              key={b}
              className="px-1.5 py-0.5 rounded-full bg-[#111118] border border-[#2A2A3A] text-[9px] text-[#7A7A96] uppercase tracking-widest font-semibold"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default ProfLinneaEmptyState;
