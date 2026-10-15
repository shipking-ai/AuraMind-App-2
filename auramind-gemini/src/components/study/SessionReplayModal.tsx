/**
 * SessionReplayModal — Step-through walk of the user's most recent study
 * session. Lets the user "scrub" through their cards without re-doing
 * the review: each step shows the front, the rating they gave, the back,
 * and the time gap to the next card.
 *
 * The user often finishes a session and asks "what did I just spend 10 min
 * on?" — this answers that.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronLeft, ChevronRight, RotateCcw, Sparkles, Clock, Layers,
} from '@/components/icons';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { useSessionReplay, type ReplayEntry } from '../../hooks/useSessionReplay';
import ProfLinneaEmptyState from '../ui/ProfLinneaEmptyState';

interface Props {
  open: boolean;
  onClose: () => void;
}

const RATING_COLOR: Record<ReplayEntry['rating'], string> = {
  again: 'text-red-400 bg-red-500/10 border-red-500/20',
  hard: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  good: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  easy: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const RATING_LABEL: Record<ReplayEntry['rating'], string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

function fmtGap(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

export default function SessionReplayModal({ open, onClose }: Props) {
  const userId = useCurrentUserId();
  const { session, loading } = useSessionReplay(userId ?? undefined);
  const [index, setIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setIndex(0);
      requestAnimationFrame(() => closeRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min((session?.entries.length ?? 1) - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, session?.entries.length, onClose]);

  const entry = session?.entries?.[index];
  const next = session?.entries?.[index + 1];
  const gapMs = useMemo(() => {
    if (!entry || !next) return 0;
    return Math.max(0, next.reviewedAt - entry.reviewedAt);
  }, [entry, next]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replay-title"
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className="relative w-[560px] max-w-[92vw] bg-[#0E0E14] border border-[#2A2A3A] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 p-5 border-b border-[#2A2A3A]/50">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#A78BFA] font-semibold">
              <Layers size={11} />
              Session Replay
            </div>
            <h2 id="replay-title" className="text-[#F0EFFE] text-base font-semibold mt-0.5">
              {session?.deckTitle || 'Your latest session'}
            </h2>
            {session && session.entries.length > 0 && (
              <p className="text-[10px] text-[#7A7A96] mt-0.5">
                {session.entries.length} card{session.entries.length === 1 ? '' : 's'} reviewed
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close replay"
            className="w-8 h-8 rounded-lg bg-[#111118] border border-[#2A2A3A] flex items-center justify-center text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#3A3A4F] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#7C3AED]/30 border-t-[#7C3AED] rounded-full animate-spin" />
            </div>
          ) : !session || session.entries.length === 0 ? (
            <div className="py-6">
              <ProfLinneaEmptyState
                mood="inviting"
                size="sm"
                eyebrow="SESSION REPLAY"
                title="Nothing to replay yet"
                description="Finish a study session and you can step back through it card by card here."
                actions={[
                  {
                    label: 'Start a session',
                    icon: Sparkles,
                    onClick: onClose,
                    primary: true,
                    href: '/dashboard/study',
                  },
                ]}
              />
            </div>
          ) : (
            <>
              {/* Stepped card display */}
              <div className="rounded-xl border border-[#2A2A3A] bg-[#111118] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#2A2A3A]/40 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#7A7A96] uppercase tracking-widest">
                    Card {index + 1} of {session.entries.length}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${RATING_COLOR[entry!.rating]}`}
                  >
                    {RATING_LABEL[entry!.rating]}
                  </span>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={entry!.id + '-' + index}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="px-5 py-5"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-[#A78BFA] mb-1.5">
                      Front
                    </div>
                    <p className="text-[#F0EFFE] text-base leading-relaxed mb-3">
                      {entry!.front}
                    </p>
                    <div className="h-px bg-[#2A2A3A]/50 my-3" />
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-[#A78BFA] mb-1.5">
                      Back
                    </div>
                    <p className="text-[#8A8AA3] text-sm leading-relaxed">
                      {entry!.back || '—'}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {next && (
                  <div className="px-5 py-2.5 border-t border-[#2A2A3A]/40 bg-[#0A0A12] flex items-center gap-2 text-[10px] text-[#7A7A96]">
                    <Clock size={10} className="text-[#7C3AED]" />
                    <span>Then you answered</span>
                    <span className="font-semibold text-[#9090A8]">{next.front.slice(0, 28)}{next.front.length > 28 ? '…' : ''}</span>
                    <span className="ml-auto font-mono">{fmtGap(gapMs)} later</span>
                  </div>
                )}
              </div>

              {/* Stepper controls */}
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-[#111118] border border-[#2A2A3A] text-[#F0EFFE] hover:border-[#7C3AED]/40 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <ChevronLeft size={13} />
                  Previous
                </button>
                <div className="flex items-center gap-1.5">
                  {session.entries.map((_, i) => {
                    const far = i !== index;
                    return (
                      <span
                        key={i}
                        className={`block rounded-full transition-all ${
                          i === index
                            ? 'w-3 h-2 bg-[#7C3AED]'
                            : far
                            ? 'w-1.5 h-1.5 bg-[#2A2A3A]'
                            : 'w-2 h-2 bg-[#7C3AED]/50'
                        }`}
                      />
                    );
                  })}
                </div>
                <button
                  onClick={() => setIndex((i) => Math.min(session.entries.length - 1, i + 1))}
                  disabled={index >= session.entries.length - 1}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  Next
                  <ChevronRight size={13} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2A2A3A]/50 flex items-center justify-between text-[10px] text-[#7A7A96]">
          <span className="flex items-center gap-1.5">
            <RotateCcw size={10} />
            Replays read-only · no FSRS rewrites
          </span>
          <span className="font-mono">
            <kbd className="px-1 py-0.5 rounded border border-[#2A2A3A] bg-[#111118] text-[9px] mr-1">←</kbd>
            <kbd className="px-1 py-0.5 rounded border border-[#2A2A3A] bg-[#111118] text-[9px]">→</kbd>
            <span className="ml-1.5">to step</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
