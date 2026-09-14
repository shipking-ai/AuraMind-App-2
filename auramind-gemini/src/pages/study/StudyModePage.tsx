import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, Lightbulb, Mic, X, Star, ChevronDown, Wind, Timer as TimerIcon, RotateCcw } from '@/components/icons';
import { usePersonalizedFsrs } from '../../hooks/usePersonalizedFsrs';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { useHaptics } from '../../hooks/useNative';
import { ImpactStyle } from '../../lib/nativeShim';
import { Capacitor } from '../../lib/nativeShim';
import { PersonalizationIndicator } from '../../components/study/PersonalizationIndicator';
import { DifficultyChip } from '../../components/study/DifficultyChip';
import { PacingOverride, type PacingMode } from '../../components/study/PacingOverride';
import { LiveCompareBadge } from '../../components/study/LiveCompareBadge';
import { PROFILE_DIFFICULTY_CENTER } from '../../services/study/fsrs';
import { dbService } from '../../services/database/dbService';
import { sessionService } from '../../services/database/modules/sessionService';
import { cardReviewsService } from '../../services/database/modules/cardReviewsService';
import { calculateSRS } from '../../services/study/srs';
import { isOnline, queueCardReview, getCachedDecks, getCachedCards } from '../../services/offline/offlineStudyService';
import { applyPersonalizedDifficultyInit } from '../../services/study/fsrs';
import { Rating } from '../../types';
import type { StudySession, Card, Deck } from '../../types';
import { VideoBackground } from '../../components/ui/VideoBackground';
import { addNotification } from '../../services/notifications/notificationStore';
import { toast } from 'sonner';
import FlowMode from '../../components/study/FlowMode';
import MultiplayerStudyBanner from '../../components/study/MultiplayerStudyBanner';
import SessionReplayModal from '../../components/study/SessionReplayModal';
import { useMultiplayerStudy } from '../../hooks/useMultiplayerStudy';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { useAppPreference, getAppPreference } from '../../lib/appPreferences';
import { loadOfflineAwareData } from '../../lib/offlineAwareData';
import { trackStudySession } from '../../services/gamification/gamificationService';
import { useTimer, MotionPath } from '../../lib/effects';
import { VoiceStudyControls } from '../../components/study/VoiceStudyControls';
import { OfflineBanner } from '../../components/shared/OfflineBanner';

const RATING_BTNS = [
  { label: 'Again', rating: Rating.AGAIN, interval: '5m', color: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20' },
  { label: 'Hard', rating: Rating.HARD, interval: '1d', color: 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/20' },
  { label: 'Good', rating: Rating.GOOD, interval: '3d', color: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20' },
  { label: 'Easy', rating: Rating.EASY, interval: '1w', color: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20' },
];

const KEY_MAP: Record<string, string> = {
  'Again': '1',
  'Hard': '2',
  'Good': '3',
  'Easy': '4',
};

const RatingButton = ({ label, rating, interval, color, onRate, showInterval = true }: {
  label: string; rating: Rating; interval: string; color: string; onRate: (r: Rating) => void; showInterval?: boolean;
}) => (
  <motion.button
    onClick={() => onRate(rating)}
    className={`flex-1 px-4 py-3 rounded-xl border text-xs font-medium ${color} flex flex-col items-center gap-0.5`}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
    <span>{label}</span>
    {showInterval && <span className="text-[10px] opacity-60">{interval}</span>}
    <kbd className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded border border-current/20 bg-black/10 text-[9px] font-mono opacity-60">
      {KEY_MAP[label]}
    </kbd>
  </motion.button>
);

const SessionComplete = ({ stats, deckTitle, onRestart, onExit, onReplay }: {
  stats: { total: number; correct: number }; deckTitle: string; onRestart: () => void; onExit: () => void; onReplay?: () => void;
}) => (
  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 0.95 }}
    className="flex items-center justify-center min-h-screen bg-[#0A0A0F] p-6"
  >
    <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-8 max-w-sm w-full text-center">
      <div className="text-3xl mb-4"><Sparkles size={36} /></div>
      <h2 className="text-[#F0EFFE] text-lg font-light mb-1">Session Complete</h2>
      <p className="text-[#7A7A96] text-xs mb-6">{deckTitle}</p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#1A1A24] rounded-lg p-3">
          <div className="text-[#F0EFFE] text-xl font-semibold">{stats.total}</div>
          <div className="text-[#7A7A96] text-[11px]">Cards reviewed</div>
        </div>
        <div className="bg-[#1A1A24] rounded-lg p-3">
          <div className="text-emerald-400 text-xl font-semibold">{Math.round((stats.correct / Math.max(stats.total, 1)) * 100)}%</div>
          <div className="text-[#7A7A96] text-[11px]">Accuracy</div>
        </div>
      </div>
      <button onClick={onRestart} className="w-full py-2.5 bg-[#7C3AED] text-white text-xs font-medium rounded-lg hover:bg-[#6D28D9] transition-all mb-2">Study Again</button>
      {onReplay && (
        <button onClick={onReplay} className="w-full py-2.5 border border-[#2A2A3A] text-[#F0EFFE] text-xs font-medium rounded-lg hover:border-[#7C3AED]/40 transition-all mb-2 flex items-center justify-center gap-2">
          <RotateCcw size={12} /> Replay what I just studied
        </button>
      )}
      <button onClick={onExit} className="w-full py-2.5 border border-[#2A2A3A] text-[#7A7A96] text-xs font-medium rounded-lg hover:text-[#F0EFFE] transition-all">Back to Dashboard</button>
    </div>
  </motion.div>
);

export default function StudyModePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const isAndroidApp = Capacitor.getPlatform() === 'android';

  const [deck, setDeck] = useState<Deck | null>(null);
  const [studyCards, setStudyCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const userId = useCurrentUserId();
  const workspace = useDashboardWorkspace();
  const [dailyGoal] = useAppPreference('auramind_dailyGoal', '20');
  const [newCards] = useAppPreference('auramind_newCards', '10');
  const [maxReviews] = useAppPreference('auramind_maxReviews', '100');
  const [retention] = useAppPreference('auramind_retention', 'Balanced - 85%');
  const [reviewOrder] = useAppPreference('auramind_reviewOrder', 'FSRS - Optimized');
  const [showIntervals] = useAppPreference('auramind_showIntervals', true);
  const [showHintFirst] = useAppPreference('auramind_showHintFirst', false);
  const [keyboardShortcuts] = useAppPreference('auramind_keyboardShortcuts', true);
  // Tracks when the active study session began. Reset every time the user
  // resets the session via "Study Again" so a re-runs session's startTime
  // doesn't bleed into the prior session row. Used by the session-save
  // flow at the bottom of handleRate.
  const sessionStartTimeRef = useRef<number>(Date.now());
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const [xpParticles, setXpParticles] = useState<{ id: number; color: string }[]>([]);
  const [displayedXP, setDisplayedXP] = useState(0);
  const particleId = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [tiltEnabled, _setTiltEnabled] = useState(true);
  const [isRating, setIsRating] = useState(false);
  const [flowModeOpen, setFlowModeOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const _studyTimer = useTimer({ duration: Infinity, autoplay: true });
  const { impact, success, warning } = useHaptics();
  useEffect(() => {
    // Poll elapsed time every second for display
    const interval = setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  const personalization = usePersonalizedFsrs(userId);
  // Per-session pacing override flows through the fourth arg of
  // applyPersonalizedDifficultyInit. Derived reactively so a mid-session
  // profileCenter change (e.g. fresh tuner pass) automatically re-points the
  // target — never stale.
  const [pacingMode, setPacingMode] = useState<PacingMode>('auto');
  const profileCenter = personalization.profileLabel
    ? PROFILE_DIFFICULTY_CENTER[personalization.profileLabel] ?? null
    : null;
  const pacingTarget = useMemo(() => {
    const clamp = (v: number) => Math.min(10, Math.max(1, v));
    if (pacingMode === 'auto' || profileCenter === null) return null;
    if (pacingMode === 'easier') return clamp(profileCenter + 1.0);
    if (pacingMode === 'harder') return clamp(profileCenter - 1.0);
    return null;
  }, [pacingMode, profileCenter]);

  useEffect(() => {
    const init = async () => {
      if (userId === undefined) return; // boot still loading
      if (userId === null) { navigate('/auth'); return; }
      try {
        const { decks: fetchedDecks, cards: allCards } = await loadOfflineAwareData(userId, {
          online: isOnline(),
          offlineMode: getAppPreference('auramind_offlineMode', false),
          autoSync: false,
          getCachedDecks,
          getCachedCards,
          fetchDecks: (id) => dbService.fetchDecks(id),
          fetchCards: (id) => dbService.fetchCards(id),
        });
        const fetchedDeck = fetchedDecks.find(d => d.id === deckId);
        if (!fetchedDeck) { navigate('/dashboard/study'); return; }
        setDeck(fetchedDeck);
        // Filter cards for this deck
        const deckCards = allCards.filter((c: Card) => c.deckId === deckId);
        const due = deckCards.filter((c: Card) => (c.nextReview ?? 0) <= Date.now());
        const queue = [...(due.length > 0 ? due : deckCards)];
        if (reviewOrder === 'Random') {
          queue.sort(() => Math.random() - 0.5);
        } else if (reviewOrder === 'Newest first') {
          queue.sort((a, b) => (b.lastReviewed ?? 0) - (a.lastReviewed ?? 0));
        } else if (reviewOrder === 'Oldest first') {
          queue.sort((a, b) => (a.lastReviewed ?? 0) - (b.lastReviewed ?? 0));
        } else if (reviewOrder === 'Hardest first') {
          queue.sort((a, b) => {
            const difficulty = (card: Card) =>
              (card.lapses ?? 0) * 10 + (10 - (card.understandingLevel ?? 5));
            return difficulty(b) - difficulty(a);
          });
        }
        const requestedNewCards = Number(newCards);
        const isNewCard = (card: Card) =>
          (card.repetition ?? 0) === 0 &&
          !card.lastReviewed &&
          !(card.fsrsState?.repetitions);
        const newCardIds = new Set(
          Number.isFinite(requestedNewCards) && requestedNewCards >= 0
            ? queue.filter(isNewCard).slice(Math.max(0, requestedNewCards)).map((card) => card.id)
            : [],
        );
        const pacedQueue = queue.filter((card) => !newCardIds.has(card.id));
        const requestedGoal = Number(dailyGoal);
        const requestedMax = Number(maxReviews);
        const sessionLimit = Math.max(
          1,
          Math.min(
            pacedQueue.length,
            Number.isFinite(requestedGoal) && requestedGoal > 0 ? requestedGoal : 20,
            Number.isFinite(requestedMax) && requestedMax > 0 ? requestedMax : 100,
          ),
        );
        setStudyCards(pacedQueue.slice(0, sessionLimit));
      } catch (err) {
        console.error('Failed to load study session:', err);
        navigate('/dashboard/study');
      } finally {
        setLoading(false);
      }
    };
    if (deckId) init();
  }, [dailyGoal, deckId, maxReviews, navigate, newCards, reviewOrder, userId]);

  const spawnParticles = useCallback((_x: number, _y: number) => {
    const colors = ['#7C3AED', '#8B5CF6', '#3B82F6', '#A78BFA'];
    const newParticles = Array.from({ length: 12 }, () => ({
      id: particleId.current++,
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    setParticles(prev => [...prev, ...newParticles]);
    // Spawn MotionPath-based XP particle that rides a curve to the XP counter
    const xpColors = ['#F59E0B', '#FBBF24', '#FCD34D', '#A78BFA'];
    setXpParticles(prev => [...prev, {
      id: particleId.current++,
      color: xpColors[Math.floor(Math.random() * xpColors.length)],
    }]);
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(n => n.id === p.id)));
    }, 800);
    setTimeout(() => {
      setXpParticles(prev => prev.filter((_, i) => i > 0));
    }, 1400);
  }, []);

  const currentCard = studyCards[index];
  const currentHint = (currentCard?.back || "")
    .split(/[.!?]\s+/)[0]
    .slice(0, 120);

  /**
   * Flip the card and tick.
   *
   * The flip is the single most repeated gesture in the product -- a user
   * doing a 40-card session performs it 40 times -- and it was the one step
   * of the loop with no tactile response, while rating already had one. A
   * light impact is deliberate: the answer reveal is not an outcome, so it
   * should not feel like the success/warning notification that rating gives.
   *
   * Errors are swallowed because useHaptics' promises are unguarded; a
   * missing bridge must never surface as an unhandled rejection mid-session.
   */
  const toggleFlip = useCallback(() => {
    if (!currentCard) return;
    setFlipped((f) => !f);
    void Promise.resolve(impact(ImpactStyle.Light)).catch(() => undefined);
  }, [currentCard, impact]);

  const handleRate = useCallback(async (rating: Rating, event?: React.MouseEvent) => {
    if (!currentCard || !userId || isRating) return;
    setIsRating(true);
    // Real Android builds provide tactile feedback for the rating outcome;
    // browser builds keep the same flow without a forced vibration.
    void (rating === Rating.AGAIN ? warning() : rating >= Rating.GOOD ? success() : impact());
    if (event) {
      spawnParticles(event.clientX, event.clientY);
    } else {
      spawnParticles(window.innerWidth / 2, window.innerHeight / 2);
    }
    try {
      // Apply the personalized difficulty bias on a card's first review
      // so the DifficultyChip's promise actually reaches the FSRS state.
      // pacingTarget is the per-session override (Gentler/Firmer); it
      // supersedes the profile center when set, and is silently clamped
      // to FSRS's [1..10] difficulty range inside the helper.
      const biased = applyPersonalizedDifficultyInit(
        currentCard,
        personalization.profileLabel,
        personalization.weights,
        pacingTarget ?? undefined,
      );
      const targetRetention = retention.startsWith('Conservative')
        ? 0.9
        : retention.startsWith('Aggressive')
          ? 0.8
          : 0.85;
      const res = calculateSRS(biased.card, rating, personalization.weights, targetRetention);
      // Single round-trip: schedule writes and bias writes travel together so
      // the two never race against stale row reads.
      const update: Partial<Card> = {
        interval: res.interval,
        repetition: res.repetition,
        easeFactor: res.easeFactor,
        nextReview: Date.now() + res.interval * 86400000,
        lastReviewed: Date.now(),
      };
      if (biased.applied && biased.card.fsrsState) {
        update.fsrsState = biased.card.fsrsState;
      }
      // Persist the review to the offline queue BEFORE attempting the network
      // write, whenever the device reports no connection.
      //
      // dbService.updateCard() swallows a failed Supabase write and returns the
      // in-memory optimistic card, so the caller cannot tell a successful save
      // from a lost one. Offline, that meant a full study session advanced
      // normally on screen and every review was discarded on reload — the worst
      // possible failure for a spaced-repetition app. The rating is only known
      // here, which is why the queueing lives at the call site.
      if (!isOnline()) {
        try {
          await queueCardReview(currentCard.id, rating, res);
        } catch (queueErr) {
          console.warn('[StudyMode] Could not queue review for later sync:', queueErr);
        }
      }
      await dbService.updateCard(currentCard.id, update);
      // Optimistically mirror the write into the workspace cards-cache so the
      // dashboard widgets (StudyOverview's "Studied today" stat, the deck
      // bucketing on CardsDecks, etc.) reflect the new lastReviewed IMMEDIATELY
      // — well before either Supabase's read-after-write propagates back or
      // the study_sessions row inserts. The provider's local patch is reset
      // the next time the parent re-feeds a fresh `cards` prop.
      workspace?.updateCardOptimistically?.(currentCard.id, update);
      // Mirror the rating into the `card_reviews` table so the
      // SessionReplayModal has data to step through. Before this write
      // existed, only the offline sync path populated card_reviews — a
      // 100% online study session left the modal showing "Nothing to
      // replay yet". Fire-and-forget on purpose: a Supabase hiccup must
      // never block the user from seeing the next card. PSQL constraint
      // `card_reviews.rating >= 0` (relaxed from 0..4 → 0..∞ by
      // migration 20260724000001_card_reviews_rating_range_fix) covers
      // FSRS v5 Rating.EASY (=5) writes that were silently rejected by
      // the old `rating <= 4` check.
      if (userId) {
        const reviewedAt = Date.now();
        // JSON.stringify drops `undefined` keys on the wire, so assign
        // fsrsState directly rather than guarding with a ternary. Cleaner
        // diff; identical payload.
        cardReviewsService.recordReview({
          userId,
          cardId: currentCard.id,
          rating,
          srsResult: {
            interval: res.interval,
            repetition: res.repetition,
            easeFactor: res.easeFactor,
            fsrsState: res.fsrsState,
          },
          reviewedAt,
        }).catch((err) => {
          console.warn('[StudyModePage] recordReview failed (non-blocking):', err);
        });
      }
    } catch (err) {
      console.error('Failed to update card:', err);
      // Continue anyway — don't block the user from finishing
    }
    setSessionStats(prev => ({
      correct: prev.correct + (rating >= Rating.GOOD ? 1 : 0),
      total: prev.total + 1,
    }));
    if (index >= studyCards.length - 1) {
      // Calculate post-this-rating totals (closure captures sessionStats as
      // of the start of this render, so we add 1 for this rating locally).
      const finalTotal = sessionStats.total + 1;
      const finalCorrect = sessionStats.correct + (rating >= Rating.GOOD ? 1 : 0);
      const sessionEndTime = Date.now();
      const sessionDuration = sessionEndTime - sessionStartTimeRef.current;
      const sessionAccuracy = finalTotal > 0
        ? Math.round((finalCorrect / finalTotal) * 100)
        : 0;
      // Persist a study_session row so the useStudyStats hook (which reads
      // study_sessions) counts this card+session toward the "Studied today"
      // and streak counters. Done in a fire-and-forget tail so a Supabase
      // hiccup never blocks the Session Complete UI from rendering.
      //
      // ALSO: localStorage gamification (the streak widget on ModernDashboard,
      // MobileDashboard, AchievementsDashboard, LeaderboardPage fallback, etc.)
      // reads `stats.streakDays` from gamificationService.getUserStats(). That
      // value is only updated by trackStudySession — without this call, the
      // streak widget stays stuck at 0 even after the user completes a study
      // session. FlowMode already mirrors this call;
      // StudyModePage was the only producer missing it.
      if (userId) {
        const sessionPayload: Omit<StudySession, 'id'> = {
          userId,
          deckId: deck?.id,
          startTime: sessionStartTimeRef.current,
          endTime: sessionEndTime,
          cardsStudied: finalTotal,
          correctAnswers: finalCorrect,
          totalAnswers: finalTotal,
          accuracy: sessionAccuracy,
          duration: sessionDuration,
        };
        sessionService.saveStudySession(sessionPayload).catch((err) => {
          console.warn('saveStudySession failed (non-blocking):', err);
        });
        // Fire-and-forget update to the localStorage-backed streak counter.
        // duration is the field name AND the unit (minutes) in the gamification
        // layer; convert ms → minutes and pass through the percent accuracy.
        // Wrapped in try/catch so a storage quota or runtime error can't
        // break the Session Complete UI.
        try {
          trackStudySession(sessionDuration / 60000, sessionAccuracy);
        } catch (err) {
          console.warn('trackStudySession failed (non-blocking):', err);
        }
      }
      // Dispatch notification for study session completion
      const cardsReviewed = studyCards.length;
      addNotification({
        title: 'Study Session Complete!',
        description: `${deck?.title || 'Deck'} · ${cardsReviewed} cards reviewed`,
        type: 'success',
        actionUrl: '/dashboard',
        actionLabel: 'Dashboard',
      });
      toast.success('Study session complete!', {
        description: `${cardsReviewed} cards reviewed in ${deck?.title || 'deck'}`,
        duration: 5000,
      });
      setCompleted(true);
      // Finishing the queue is the one genuinely celebratory beat in the
      // session; rating a single card should never feel this emphatic.
      void Promise.resolve(success()).catch(() => undefined);
    } else {
      setIndex(i => i + 1);
      setFlipped(false);
    }
    setIsRating(false);
  }, [currentCard, userId, index, studyCards.length, spawnParticles, isRating, personalization.profileLabel, personalization.weights, pacingTarget, retention, deck?.id, deck?.title, sessionStats.correct, sessionStats.total, workspace, impact, success, warning]);

  const handleTilt = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || !tiltEnabled) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (y - 0.5) * -12, y: (x - 0.5) * 12 });
  }, [tiltEnabled]);

  const resetTilt = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (sessionStats.total === 0) { setDisplayedXP(0); return; }
    const target = sessionStats.total * 10;
    let current = displayedXP;
    const step = Math.max(1, Math.floor((target - current) / 8));
    if (current >= target) return;
    const timer = setInterval(() => {
      current = Math.min(target, current + step);
      setDisplayedXP(current);
      if (current >= target) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStats.total]);

  const handleRestart = () => {
    setIndex(0); setFlipped(false); setCompleted(false);
    setSessionStats({ correct: 0, total: 0 });
    // New session, new startTime — the next session-save will reflect a fresh run.
    sessionStartTimeRef.current = Date.now();
  };

  useEffect(() => {
    if (!keyboardShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (completed) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); toggleFlip(); }
      if (flipped && currentCard) {
        const map: Record<string, Rating> = {
          'Digit1': Rating.AGAIN, 'Numpad1': Rating.AGAIN,
          'Digit2': Rating.HARD, 'Numpad2': Rating.HARD,
          'Digit3': Rating.GOOD, 'Numpad3': Rating.GOOD,
          'Digit4': Rating.EASY, 'Numpad4': Rating.EASY,
          'Slash': Rating.AGAIN,
        };
        const r = map[e.code] ?? map[e.key];
        if (r !== undefined) handleRate(r);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, currentCard, handleRate, completed, keyboardShortcuts, toggleFlip]);

  // Replay modal opens from the Session-Complete screen so the user can immediately
  // scrub through what they just studied. We instantiate it here so the modal
  // shell mounts on first render (no portal lag).
  const [replayOpen, setReplayOpen] = useState(false);

  // Multiplayer presence hook — wires the room to deckId so anyone studying
  // the same deck shows up in the banner. We expose a simple toggle so the
  // banner de-mounts cleanly when the user opts out.
  const [presenceJoined, setPresenceJoined] = useState(false);
  const presenceUser = workspace?.user as { id?: string; name?: string; avatar?: string } | undefined;
  const presence = useMultiplayerStudy({
    deckId: deck?.id ?? 'lobby',
    currentUserId: presenceUser?.id ?? userId ?? '',
    name: presenceUser?.name ?? 'You',
    avatar: presenceUser?.avatar,
    enabled: presenceJoined && !!deck?.id,
  });

  const lifetimeXp = Number(
    typeof window !== 'undefined' ? localStorage.getItem('auramind_user_xp') ?? 0 : 0,
  );

  if (loading) return <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center"><div className="text-[#7A7A96] text-sm">Loading...</div></div>;

  if (completed) return (
    <>
      <SessionComplete
        stats={sessionStats}
        deckTitle={deck?.title || ''}
        onRestart={handleRestart}
        onExit={() => navigate('/dashboard/study')}
        onReplay={() => setReplayOpen(true)}
      />
      <SessionReplayModal open={replayOpen} onClose={() => setReplayOpen(false)} />
    </>
  );

  if (flowModeOpen && studyCards.length > 0) {
    const flowCards = studyCards.slice(index).map(c => ({
      id: c.id,
      question: c.question ?? c.front,
      answer: c.answer ?? c.back,
    }));
    return (
      <FlowMode
        cards={flowCards}
        userId={userId ?? undefined}
        lifetimeXp={lifetimeXp}
        onComplete={() => setFlowModeOpen(false)}
        onExit={() => setFlowModeOpen(false)}
      />
    );
  }

  if (studyCards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0A0F]">
        <div className="text-[#7A7A96] text-sm">No cards to study</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#0A0A0F] flex flex-col relative ${isAndroidApp ? 'android-study-page' : ''}`}>
      <VideoBackground name="study-session" opacity={0.3} />

      {/* Multiplayer Study banner — opt-in party mode. Mounts at top of study
          surface so users can launch or join a presence room without leaving
          the session. */}
      {/* Sits above the session so a mid-study disconnect is visible without
          the user having to notice something is wrong. Renders nothing while
          online. */}
      <div className="px-6 pt-3 empty:hidden">
        <OfflineBanner />
      </div>

      {deck?.id && (
        <div className="px-6 pt-3">
          <MultiplayerStudyBanner
            state={presence}
            onToggleJoin={() => setPresenceJoined(j => !j)}
            joined={presenceJoined}
            deckTitle={deck.title}
          />
        </div>
      )}

      {/* Top bar */}
      <div className="android-study-header flex items-center justify-between px-6 py-3 border-b border-[#2A2A3A]/50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/study')}
            className="w-8 h-8 rounded-lg bg-[#111118] border border-[#2A2A3A] flex items-center justify-center text-[#7A7A96] hover:text-[#F0EFFE] transition-colors text-sm"
          ><X size={14} /></button>
          <span className="text-[#F0EFFE] text-sm font-medium">{deck?.title || 'Study'}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress dots */}
          <div className="flex items-center gap-1">
            {studyCards.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-all duration-200 ${
                i < index ? 'bg-emerald-500' : i === index ? 'bg-[#7C3AED]' : 'bg-[#2A2A3A]'
              }`} />
            ))}
          </div>
          <span className="text-[#7A7A96] text-xs">{index + 1} / {studyCards.length}</span>
          <Zap size={14} className="text-amber-400" />
          <span id="xp-counter" className="text-amber-400 text-xs tabular-nums">{displayedXP}</span>              {/* Study timer — elapsed time since session start */}
          <div className="flex items-center gap-1.5 text-[#7A7A96] text-[11px] tabular-nums">
            <TimerIcon size={12} />
            {Math.floor(elapsedMs / 60000)}:{String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}
          </div>

          <button
            onClick={() => setVoiceMode(v => !v)}
            title="Voice study: AI speaks questions aloud, listens to your answers, and grades them"
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border transition-colors text-[11px] ${
              voiceMode
                ? 'bg-[#7C3AED]/20 border-[#7C3AED]/40 text-[#8B5CF6]'
                : 'bg-[#111118] border-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#7C3AED]/40'
            }`}
          >
            <Mic size={12} />
            Voice
          </button>
          <button onClick={() => setFlowModeOpen(true)}
            title="Flow Mode awards weekly XP toward your League. Card scheduling is unchanged."
            className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#111118] border border-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#7C3AED]/40 transition-colors text-[11px]"
          >
            <Wind size={12} />
            Flow Mode
          </button>
          <PersonalizationIndicator
            status={personalization.status}
            profileLabel={personalization.profileLabel}
          />
          <DifficultyChip profileLabel={personalization.profileLabel} />
          <LiveCompareBadge
            profileLabel={personalization.profileLabel}
            profileCenter={profileCenter}
            userId={userId ?? null}
          />
          <PacingOverride
            profileCenter={profileCenter}
            initialMode={pacingMode}
            onChange={setPacingMode}
          />
          <button className="w-7 h-7 rounded-lg bg-[#111118] border border-[#2A2A3A] flex items-center justify-center text-[#7A7A96] hover:text-[#F0EFFE] transition-colors text-xs">
            ↩
          </button>
        </div>
      </div>

      {/* Floating particles + MotionPath XP burst */}
      <div className="fixed inset-0 pointer-events-none z-50">
        <AnimatePresence>
          {particles.map(p => (
            <motion.div
              key={p.id}
              initial={{ x: '50vw', y: '50vh', scale: 1, opacity: 1 }}
              animate={{ x: `calc(50vw + ${p.x}px)`, y: `calc(50vh + ${p.y}px)`, scale: 0, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute"
            >
              <Star size={10} fill={p.color} color={p.color} />
            </motion.div>
          ))}
          {/* MotionPath XP particles — ride a reward curve from card area to XP counter */}
          {xpParticles.map((p, idx) => {
            // Position relative to card center using cardRef
            const cardRect = cardRef.current?.getBoundingClientRect();
            const cX = cardRect ? cardRect.left + cardRect.width / 2 : window.innerWidth / 2;
            const cY = cardRect ? cardRect.top + 20 : window.innerHeight * 0.6;
            // Offset each successive particle slightly so they fan out
            const xOffset = idx * 20 - 20;
            return (
              <div
                key={p.id}
                className="fixed pointer-events-none"
                style={{ left: cX + xOffset, top: cY, width: 0, height: 0 }}
              >
                <MotionPath
                  path="M0,0 C40,-80 120,-100 200,-60 C260,-30 300,0 350,20"
                  duration={1200}
                  autoplay
                  className="w-0 h-0"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}` }}
                  />
                </MotionPath>
              </div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Card area */}
      <div className="android-study-card-area flex-1 flex items-center justify-center p-6" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
        {/* Radial violet spotlight behind card */}
        <div className="absolute w-[600px] h-[600px] rounded-full bg-gradient-radial from-violet-500/8 via-violet-500/3 to-transparent pointer-events-none" style={{ filter: 'blur(60px)' }} />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard?.id || 'empty'}
            initial={{ opacity: 0, x: 60, rotate: 3 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: -60, rotate: -3 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="relative"
            style={{ perspective: '800px' }}
          >
            {/* Stack effect — rotated cards behind */}
            <div
              className="flashcard-paper absolute inset-0 rounded-[8px]"
              style={{ transform: 'rotate(-3deg) translateY(14px)', opacity: 0.6, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}
            />
            <div
              className="flashcard-paper absolute inset-0 rounded-[8px]"
              style={{ transform: 'rotate(2.5deg) translateY(7px)', opacity: 0.8, boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}
            />

            {/* Flip shell.
                The card itself owns the pointer tilt on a 75ms transition, so
                the flip cannot live on the same element -- one element cannot
                run two durations for `transform`. Nesting gives each its own:
                this shell rotates the card 180deg over 520ms while the child
                keeps tilting at 75ms underneath.

                The two stacked papers behind are siblings of this shell, so
                the deck stays put and only the top card turns -- which is what
                the gesture looks like in the hand. */}
            <div
              style={{
                transformStyle: 'preserve-3d',
                transform: `rotateY(${flipped ? 180 : 0}deg)`,
                transition: 'transform 520ms cubic-bezier(0.2, 0.7, 0.2, 1)',
              }}
            >
            <div
              ref={cardRef}
              className="android-study-card flashcard-paper relative w-[500px] max-w-[90vw] min-h-[340px] rounded-[8px] cursor-pointer select-none overflow-hidden transition-transform duration-75 ease-out"
              style={{
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotate(-1.5deg)`,
                boxShadow: '0 1px 0 0 #E8E4CC, 0 2px 0 0 #F5F0D8, 0 3px 0 0 #EDE8C8, 0 4px 6px rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.35), 0 0 50px rgba(124,58,237,0.08)',
              }}
              onClick={toggleFlip}
            >
              {/* Red margin line */}
              <div aria-hidden className="absolute top-0 bottom-0" style={{ left: '44px', width: '1px', background: 'rgba(239, 68, 68, 0.28)' }} />

              <AnimatePresence mode="wait" initial={false}>
                {!flipped ? (
                  <motion.div
                    key="front"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="relative p-8 pt-12 pb-12 flex flex-col min-h-[340px]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-[10px] uppercase font-medium text-[#8A8570] tracking-[0.15em] border-b border-[#D4CFA8] pb-1">
                        {deck?.title || 'STUDY'}
                      </div>
                      <div className="text-[10px] text-[#B8B09A]">{index + 1} / {studyCards.length}</div>
                    </div>
                    <div
                      className="relative flex-1 flex items-center justify-center mt-4"
                      style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #E8E3CC 31px, #E8E3CC 32px)' }}
                    >
                      <div
                        className="text-[#1A1828] font-medium text-center text-2xl"
                        style={{ lineHeight: '32px', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {currentCard?.front || ''}
                      </div>
                    </div>
                    {showHintFirst && currentHint && (
                      <button
                        type="button"
                        className="mx-auto mt-2 max-w-[85%] rounded-lg border border-[#D4CFA8] bg-[#FFF8E7] px-3 py-1.5 text-left text-[11px] text-[#6B6550]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="font-semibold">Hint · </span>{currentHint}
                      </button>
                    )}
                    <div className="mt-2 flex flex-col items-center gap-0.5 text-[#B8B09A]">
                      <span className="text-xs">Tap to reveal</span>
                      <ChevronDown className="h-3 w-3" />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="back"
                    /* Un-mirror. The shell above sits at 180deg whenever this
                       face is showing, so the answer would otherwise render
                       backwards.
                       rotateY has to be one of framer's own animated values,
                       not an inline style: framer composes `transform` from
                       the values it manages, so a style transform here is
                       overwritten by its translateY and the counter-rotation
                       silently does nothing. */
                    initial={{ opacity: 0, y: 8, rotateY: 180 }}
                    animate={{ opacity: 1, y: 0, rotateY: 180 }}
                    exit={{ opacity: 0, y: -8, rotateY: 180 }}
                    transition={{ duration: 0.2, delay: 0.05 }}
                    className="relative p-8 pt-12 pb-12 min-h-[340px]"
                  >
                    <div className="text-sm text-[#6B6550] border-b border-dashed border-[#D4CFA8] pb-1">
                      {currentCard?.front || ''}
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-widest text-[#8A8570]">Answer</div>
                    <div className="mt-1 text-base font-medium text-[#1A1828] leading-snug">
                      {currentCard?.back || ''}
                    </div>
                    {currentCard?.citations && currentCard.citations.length > 0 && currentCard.sourceLabel && (
                      <div className="mt-3 text-xs text-[#6B6550] leading-relaxed">
                        <span className="font-semibold text-[#1A1828]">Source — </span>
                        {currentCard.sourceLabel}
                      </div>
                    )}
                    {currentCard?.verified && (
                      <div className="mt-2 rounded border border-[#D4CFA8] bg-[#FFF8E7] px-2 py-1 text-xs text-[#6B6550]">
                        <Lightbulb size={12} className="text-amber-700 inline mr-1" />
                        Verified by AI fact-check
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Voice study controls (hands-free) */}
      {voiceMode && currentCard && (
        <div className="android-study-voice-panel px-6 pb-2">
          <div className="max-w-lg mx-auto">
            <VoiceStudyControls
              question={currentCard.front || currentCard.question || ''}
              answer={currentCard.back || currentCard.answer || ''}
              onAnswerEvaluated={(/* correct, spoken, verdict */) => {
                // Reveal the answer so the student can self-check, then
                // the rating bar appears as usual.
                setFlipped(true);
              }}
              onRequestNextCard={() => {
                setFlipped(false);
                if (index < studyCards.length - 1) setIndex(i => i + 1);
              }}
            />
          </div>
        </div>
      )}

      {/* Rating bar */}
      <AnimatePresence>
        {flipped && currentCard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25 }}
            className="android-study-rating px-6 pb-6"
          >
            <div className="max-w-lg mx-auto">
              <div className="text-center mb-3">
                <span className="text-[#7A7A96] text-[11px]">How well did you know this?</span>
              </div>
              <motion.div
                className="flex gap-2"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
                }}
              >
                {RATING_BTNS.map(btn => (
                  <motion.div
                    key={btn.label}
                    variants={{
                      hidden: { opacity: 0, y: 16, scale: 0.9 },
                      visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
                    }}
                  >
                    <RatingButton {...btn} showInterval={showIntervals} onRate={(r) => handleRate(r, undefined)} />
                  </motion.div>
                ))}
              </motion.div>
              <div className="text-center mt-2 flex items-center justify-center gap-1.5">
                <span className="text-[#3A3A4F] text-[10px]">Press</span>
                <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-[#2A2A3A] bg-[#1A1A24] text-[9px] font-mono text-[#7A7A96]">1</kbd>
                <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-[#2A2A3A] bg-[#1A1A24] text-[9px] font-mono text-[#7A7A96]">2</kbd>
                <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-[#2A2A3A] bg-[#1A1A24] text-[9px] font-mono text-[#7A7A96]">3</kbd>
                <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-[#2A2A3A] bg-[#1A1A24] text-[9px] font-mono text-[#7A7A96]">4</kbd>
                <span className="text-[#3A3A4F] text-[10px]">or</span>
                <kbd className="inline-flex h-5 items-center gap-0.5 rounded border border-[#2A2A3A] bg-[#1A1A24] px-1.5 text-[9px] font-mono text-[#7A7A96]">Space</kbd>
                <span className="text-[#3A3A4F] text-[10px]">to flip</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
