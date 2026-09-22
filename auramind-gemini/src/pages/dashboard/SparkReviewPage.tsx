/**
 * SparkReviewPage — the landing surface for a tapped spark notification
 * (`/dashboard/spark/:cardId`).
 *
 * Notification sparks show the card FRONT as text; tapping this deep-link
 * speaks the prompt aloud (voice-first, the point of the surface), then the
 * user reveals and grades exactly like an in-app spark. Works from cold
 * start: the card is looked up through the workspace data App already loads.
 * Unknown/stale card ids (e.g. the card was deleted since scheduling) show a
 * gentle empty state and return to the dashboard.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Volume2, Eye } from '@/components/icons';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { Rating } from '../../types';
import { calculateSRS } from '../../services/study/srs';
import { dbService } from '../../services/database/dbService';
import { cardReviewsService } from '../../services/database/modules/cardReviewsService';
import { speak, isSpeechOutputAvailable } from '../../services/voice/speechOutput';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { analyticsService } from '../../services/analytics/analyticsService';
import { recordSpark } from '../../services/memory/sparkScheduler';

const RATING_BUTTONS = [
  ['Again', Rating.AGAIN, 'bg-red-500/15 text-red-300 hover:bg-red-500/25'],
  ['Hard', Rating.HARD, 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'],
  ['Good', Rating.GOOD, 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'],
  ['Easy', Rating.EASY, 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'],
] as const;

export default function SparkReviewPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const userId = useCurrentUserId();
  const [revealed, setRevealed] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const card = useMemo(
    () => workspace?.cards.find((c) => c.id === cardId) ?? null,
    [workspace?.cards, cardId],
  );

  // Speak the prompt on arrival — the "voice-first" spark.
  useEffect(() => {
    if (!card || !isSpeechOutputAvailable()) return;
    setSpeaking(true);
    void speak(card.front || card.question || '').finally(() => setSpeaking(false));
  }, [card]);

  const grade = async (rating: Rating) => {
    if (!card) return;
    recordSpark('notification', card.id);
    try {
      const res = calculateSRS(card, rating);
      const update: Partial<typeof card> = {
        interval: res.interval,
        repetition: res.repetition,
        easeFactor: res.easeFactor,
        nextReview: Date.now() + res.interval * 86_400_000,
        lastReviewed: Date.now(),
      };
      if (res.fsrsState) update.fsrsState = res.fsrsState;
      await dbService.updateCard(card.id, update);
      workspace?.updateCardOptimistically?.(card.id, update);
      if (userId) {
        cardReviewsService.recordReview({
          userId,
          cardId: card.id,
          rating,
          srsResult: {
            interval: res.interval,
            repetition: res.repetition,
            easeFactor: res.easeFactor,
            fsrsState: res.fsrsState,
          },
          reviewedAt: Date.now(),
        }).catch(() => { /* fire-and-forget */ });
      }
      analyticsService.track('spark_reviewed', { cardId: card.id, surface: 'notification', rating });
    } catch {
      // Same contract as the pop-up: never trap the user on a failed write.
    }
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-md rounded-2xl border border-violet-400/20 bg-[#14141d]/95 p-6 shadow-2xl shadow-violet-900/30"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300">
            <Volume2 className={`h-3 w-3 ${speaking ? 'animate-pulse' : ''}`} aria-hidden /> Memory spark
          </span>
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg px-2 py-1"
          >
            Later
          </button>
        </div>

        {!card ? (
          <>
            <p className="text-sm text-zinc-300">This card is no longer available.</p>
            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              Back to dashboard
            </button>
          </>
        ) : (
          <>
            <p className="text-base font-medium leading-relaxed text-white">
              {revealed ? card.back || card.answer || '—' : card.front || card.question || '—'}
            </p>

            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
              >
                <Eye className="h-4 w-4" aria-hidden /> Reveal answer
              </button>
            ) : (
              <div className="mt-5 grid grid-cols-4 gap-2" role="group" aria-label="Rate your recall">
                {RATING_BUTTONS.map(([label, rating, cls]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void grade(rating)}
                    className={`rounded-xl px-1 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${cls}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
