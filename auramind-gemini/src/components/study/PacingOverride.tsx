/**
 * PacingOverride — per-session FSRS difficulty target override.
 *
 * Surfaced in the StudyModePage top bar as a small three-option pill:
 *   - Auto   → use the tuned profile center (or W[4] if no profile yet)
 *   - Gentler → bias cards one point toward the easy end of the FSRS
 *               difficulty scale (slower ramp, more forgiving lapses)
 *   - Firmer → bias cards one point toward the hard end (tighter
 *               intervals, faster feedback for confident learners)
 *
 * The selected override thread through `applyPersonalizedDifficultyInit`
 * as the fourth `difficultyTargetOverride` arg, so it composes cleanly
 * with profile-aware bias without inventing a synthetic profile label.
 *
 * Persisted in localStorage so an "I'm cramming for an exam" decision
 * survives across sessions without polluting the user's tuned profile.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gauge } from '@/components/icons';

export type PacingMode = 'auto' | 'easier' | 'harder';

interface PacingOverrideProps {
  /** Profile-derived center to bias from. Null = no tuned profile yet. */
  profileCenter: number | null;
  /** Initial value, also surfaces what's persisted in localStorage. */
  initialMode?: PacingMode;
  /** Fires whenever the user picks a mode; threads into handleRate. */
  onChange: (mode: PacingMode, target: number | null) => void;
}

const STORAGE_KEY = 'bonamind.pacing.override';

function readStoredMode(): PacingMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'auto' || raw === 'easier' || raw === 'harder') return raw;
  } catch {
    // localStorage may be disabled (private mode, quota). Fail open with defaults.
  }
  return null;
}

function writeStoredMode(mode: PacingMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Same fail-open policy as readStoredMode.
  }
}

function targetForMode(mode: PacingMode, profileCenter: number | null): number | null {
  if (mode === 'auto' || profileCenter === null) return null;
  if (mode === 'easier') return clamp(profileCenter + 1.0, 1, 10);
  if (mode === 'harder') return clamp(profileCenter - 1.0, 1, 10);
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MODE_META: Record<PacingMode, { label: string; color: string; tip: string }> = {
  auto: {
    label: 'Auto',
    color: 'text-[#9090A8] border-[#2A2A3A] bg-[#111118] hover:border-[#7C3AED]/40',
    tip: 'Use your learned FSRS profile center.',
  },
  easier: {
    label: 'Gentler',
    color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50',
    tip: 'Bias new cards toward easier — fewer harsh lapses.',
  },
  harder: {
    label: 'Firmer',
    color: 'text-amber-300 border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50',
    tip: 'Bias new cards toward harder — tighter intervals, faster feedback.',
  },
};

export const PacingOverride: React.FC<PacingOverrideProps> = ({
  profileCenter,
  initialMode,
  onChange,
}) => {
  const [mode, setMode] = useState<PacingMode>(initialMode ?? 'auto');
  const [open, setOpen] = useState(false);

  // Sync once on mount with whatever was persisted from a prior session.
  useEffect(() => {
    const stored = readStoredMode();
    if (stored && stored !== mode) {
      setMode(stored);
      onChange(stored, targetForMode(stored, profileCenter));
    }
    // Intentionally run once on mount; profileCenter changes are surfaced
    // by the parent's handleRate path, not by re-firing onChange here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePick = (next: PacingMode) => {
    setMode(next);
    writeStoredMode(next);
    onChange(next, targetForMode(next, profileCenter));
    setOpen(false);
  };

  const meta = MODE_META[mode];
  const target = targetForMode(mode, profileCenter);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={meta.tip}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors ${meta.color}`}
      >
        <Gauge size={12} />
        {meta.label}
        {target !== null && (
          <span className="text-[9px] opacity-60 font-mono">· d={target.toFixed(1)}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 top-full mt-1.5 z-50 w-[220px] rounded-lg border border-[#2A2A3A] bg-[#0E0E15] shadow-xl shadow-black/40 p-1"
            role="menu"
          >
            <div className="px-2 py-1.5 text-[9px] uppercase tracking-widest text-[#7A7A96] font-bold">
              Pacing for this session
            </div>
            {(Object.keys(MODE_META) as PacingMode[]).map(m => {
              const mTarget = targetForMode(m, profileCenter);
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handlePick(m)}
                  role="menuitemradio"
                  aria-checked={active}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                    active
                      ? 'bg-[#7C3AED]/15 text-[#F0EFFE]'
                      : 'text-[#9090A8] hover:bg-[#1A1A24] hover:text-[#F0EFFE]'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{MODE_META[m].label}</span>
                    <span className="text-[9px] text-[#7A7A96]">{MODE_META[m].tip}</span>
                  </div>
                  <span className="font-mono text-[9px] text-[#7A7A96]">
                    {mTarget !== null ? `d=${mTarget.toFixed(1)}` : 'auto'}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PacingOverride;
