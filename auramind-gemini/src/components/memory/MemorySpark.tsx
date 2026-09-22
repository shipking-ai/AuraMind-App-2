/**
 * MemorySpark — Surface 1 of the memory spark system.
 *
 * While the user is present but not busy (dashboard/decks routes, visible tab,
 * no study session open), a spark occasionally surfaces a card whose FSRS
 * retrievability is fading but not gone: front shown + spoken, tap to reveal,
 * grade with the normal four buttons. Reviews go through the same SRS path as
 * StudyModePage (calculateSRS → dbService.updateCard → cardReviewsService),
 * so sparks are real reviews, tagged in the spark log as 'popup'.
 *
 * Mounted once in NovaDashboardShell. All when/how logic lives in the pure
 * sparkScheduler — this component is surface wiring only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Volume2, Eye } from '@/components/icons';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { Card, Rating } from '../../types';
import { reviewCard } from '../../services/study/quickReview';
import { speak, isSpeechOutputAvailable } from '../../services/voice/speechOutput';
import { useAppPreference } from '../../lib/appPreferences';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { analyticsService } from '../../services/analytics/analyticsService';
import {
  DEFAULT_SPARK_PREFERENCES,
  getSparkLog,
  isQuietHour,
  pickSparkCard,
  recordSpark,
  shouldFireNow,
  type SparkPreferences,
} from '../../services/memory/sparkScheduler';

const POLL_MS = 90_000;
const AUTO_DISMISS_MS = 45_000;

/** Routes where a pop-up is welcome. Everything else (study, chat, generator,
 * settings, admin work) is either busy or private. */
const SPARKABLE_PREFIXES = ['/dashboard', '/decks', '/classes'];
const SPARKABLE_EXACT = ['/dashboard'];

interface Phase {
  card: Card;
  revealed: boolean;
}

function useSparkPreferences(): SparkPreferences {
  const [enabled] = useAppPreference('auramind_sparksEnabled', true);
  const [popupEnabled] = useAppPreference('auramind_sparksPopup', true);
  const [quietStart] = useAppPreference('auramind_sparksQuietStart', '22:00');
  const [quietEnd] = useAppPreference('auramind_sparksQuietEnd', '08:00');
  return useMemo(() => ({
    enabled: enabled && popupEnabled,
    popupEnabled,
    notificationsEnabled: true,
    quietStartHour: Number.isFinite(parseInt(quietStart, 10)) ? parseInt(quietStart, 10) : DEFAULT_SPARK_PREFERENCES.quietStartHour,
    quietEndHour: Number.isFinite(parseInt(quietEnd, 10)) ? parseInt(quietEnd, 10) : DEFAULT_SPARK_PREFERENCES.quietEndHour,
  }), [enabled, popupEnabled, quietStart, quietEnd]);
}

export function MemorySpark() {
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const userId = useCurrentUserId();
  const prefs = useSparkPreferences();

  const [phase, setPhase] = useState<Phase | null>(null);
  const busyRef = useRef(false);
  const phaseRef = useRef<Phase | null>(null);
  phaseRef.current = phase;

  const routeAllows = useMemo(() => {
    if (location.pathname.startsWith('/admin')) return false;
    return SPARKABLE_EXACT.includes(location.pathname)
      || SPARKABLE_PREFIXES.some((p) => location.pathname.startsWith(p));
  }, [location.pathname]);

  const grade = useCallback(async (card: Card, rating: Rating) => {
    setPhase(null);
    recordSpark('popup', card.id);
    try {
      const update = await reviewCard(card, rating, userId);
      workspace?.updateCardOptimistically?.(card.id, update);
      analyticsService.track('spark_reviewed', { cardId: card.id, surface: 'popup', rating });
    } catch {
      // A failed spark review must never disturb the session. The card stays
      // in its old state and the normal study flow still covers it.
    }
  }, [userId, workspace]);

  const dismiss = useCallback(() => {
    const p = phaseRef.current;
    if (p) recordSpark('popup', p.card.id); // suppress re-fire for MIN_SPARK_GAP
    setPhase(null);
  }, []);

  // Poll: jittered cadence + coin + caps + quiet hours, then pick.
  useEffect(() => {
    if (!routeAllows || !prefs.enabled) return;
    let cancelled = false;
    let timer: number | undefined;

    const tryFire = (now: number) => {
      const history = getSparkLog();
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      const idle = !phaseRef.current && !busyRef.current;
      if (visible && idle && !isQuietHour(now, prefs)
          && shouldFireNow({ now, history, prefs })
          && workspace?.cards?.length) {
        const picked = pickSparkCard(workspace.cards, { now, history });
        if (picked) {
          setPhase({ card: picked, revealed: false });
          analyticsService.track('spark_shown', { cardId: picked.id, surface: 'popup' });
        }
      }
    };

    const tick = () => {
      if (cancelled) return;
      tryFire(Date.now());
      // Jitter the next poll ±20% so the cadence never feels mechanical.
      const jitter = 0.8 + Math.random() * 0.4;
      timer = window.setTimeout(tick, POLL_MS * jitter);
    };

    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [routeAllows, prefs, workspace?.cards]);

  // E2E/test hook (dev builds only): `?sparks=force` on a sparkable route
  // bypasses the sporadic gate and fires the scheduler's PICK immediately —
  // the eligibility band, caps, and quiet hours still apply, so the test
  // still exercises the real selection logic; only the coin is removed.
  // Production is unaffected: the hook reads no query params there.
  useEffect(() => {
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('sparks') === 'force') {
        const t = window.setTimeout(() => {
          const now = Date.now();
          const picked = pickSparkCard(workspace?.cards ?? [], { now, history: getSparkLog() });
          if (picked) {
            setPhase({ card: picked, revealed: false });
            analyticsService.track('spark_shown', { cardId: picked.id, surface: 'popup' });
          }
        }, 400);
        return () => window.clearTimeout(t);
      }
    }
  }, [workspace?.cards, location.pathname]);

  // Speak the front when a spark appears; the back on reveal.
  useEffect(() => {
    if (!phase || !isSpeechOutputAvailable()) return;
    void speak(phase.revealed ? phase.card.back : phase.card.front).catch(() => {});
  }, [phase]);

  // Auto-dismiss after 45 s of no interaction.
  useEffect(() => {
    if (!phase) return;
    const t = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [phase, dismiss]);

  // Escape dismisses (never mid-reveal grading — Escape then just closes).
  useEffect(() => {
    if (!phase) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, dismiss]);

  if (!phase) return null;

  const front = phase.card.front || phase.card.question || '';
  const back = phase.card.back || phase.card.answer || '';

  return (
    <AnimatePresence>
      <motion.aside
        role="dialog"
        aria-label="Memory spark"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="fixed bottom-24 left-1/2 z-[90] w-[min(92vw,26rem)] -translate-x-1/2 lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0"
      >
        <div className="rounded-2xl border border-violet-400/20 bg-[#14141d]/95 p-5 shadow-2xl shadow-violet-900/30 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300">
              <Volume2 className="h-3 w-3" aria-hidden /> Memory spark
            </span>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss spark"
              className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <p className="text-sm font-medium text-white">
            {phase.revealed ? back || '—' : front || '—'}
          </p>

          {!phase.revealed ? (
            <button
              type="button"
              onClick={() => setPhase((p) => (p ? { ...p, revealed: true } : p))}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden /> Reveal
            </button>
          ) : (
            <div className="mt-4 grid grid-cols-4 gap-1.5" role="group" aria-label="Rate your recall">
              {([
                ['Again', Rating.AGAIN, 'bg-red-500/15 text-red-300 hover:bg-red-500/25'],
                ['Hard', Rating.HARD, 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'],
                ['Good', Rating.GOOD, 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'],
                ['Easy', Rating.EASY, 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'],
              ] as const).map(([label, rating, cls]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void grade(phase.card, rating)}
                  className={`rounded-lg px-1 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${cls}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => { dismiss(); navigate(`/dashboard/decks?deck=${phase.card.deckId}`); }}
            className="mt-2 w-full rounded-lg px-2 py-1.5 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            Study this deck
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
