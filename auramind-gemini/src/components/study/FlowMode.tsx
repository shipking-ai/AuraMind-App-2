/**
 * FlowMode — Enhanced Focus Session with deep-work telemetry.
 *
 * A distraction-free study session with:
 *   - Live "study buddies" counter (presence indicator for body-doubling)
 *   - Focus score (smoothness of answers, time-on-card consistency)
 *   - Breathing guide before session start
 *   - Auto-pause on hesitation
 *   - Hedonic reward animations at the end
 *
 * Backwards-compatible wrapper: if no presence data is available (offline),
 * it just runs the standard focus session.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Wind, Heart, Sparkles, X, Clock as ClockIcon, Volume2, VolumeX } from '@/components/icons';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { trackStudySession } from '../../services/gamification/gamificationService';
import { awardWeeklyXp } from '../../services/gamification/leagueService';
import { supabase, requireSupabase } from '../../services/database/supabase';
import { sessionService } from '../../services/database/modules/sessionService';
import { cardReviewsService } from '../../services/database/modules/cardReviewsService';
import { Rating } from '../../types';

interface FlowCard {
  id: string;
  question: string;
  answer: string;
}

interface FlowModeProps {
  cards: FlowCard[];
  userId?: string;
  lifetimeXp?: number;
  onComplete: () => void;
  onExit: () => void;
}

type Phase = 'breathing' | 'shower' | 'study' | 'done';

export const FlowMode: React.FC<FlowModeProps> = ({
  cards, userId, lifetimeXp = 0, onComplete, onExit,
}) => {
  const [phase, setPhase] = useState<Phase>('breathing');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [studyBuddies, setStudyBuddies] = useState(0);
  const [focusScore, setFocusScore] = useState(100);
  const [showComplete, setShowComplete] = useState(false);
  const [weeklyXpGained, setWeeklyXpGained] = useState(0);

  const currentCard = cards[currentIndex];

  // Live timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime]);

  // Live presence — real-time count of other learners currently in a flow
  // session, via a shared broadcast channel. Falls back to hiding the
  // counter entirely when the channel is unavailable (offline / no user).
  const [presenceConnected, setPresenceConnected] = useState(false);
  useEffect(() => {
    if (phase !== 'study' || !userId || !supabase) return;

    const channel = requireSupabase().channel('flow:presence', {
      config: { presence: { key: userId }, broadcast: { ack: false } },
    });

    const countPeers = () => {
      const state = channel.presenceState<{ userId: string }>();
      let n = 0;
      for (const [, list] of Object.entries(state)) {
        if (list.some(p => p.userId === userId)) continue;
        n += 1;
      }
      setStudyBuddies(n);
    };

    channel
      .on('presence', { event: 'sync' }, countPeers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setPresenceConnected(true);
          await channel.track({ userId, joinedAt: Date.now() });
          countPeers();
        } else {
          setPresenceConnected(false);
        }
      });

    return () => {
      try { channel.untrack(); } catch { /* channel may already be closed */ }
      if (supabase) requireSupabase().removeChannel(channel);
    };
  }, [phase, userId]);

  const focusedEarnings = useMemo(() => {
    // Bonus XP for high flow scores + accuracy.
    const accuracyPart = (correctCount / Math.max(1, currentIndex + 1)) * 12;
    const flowPart = (focusScore / 100) * 8;
    return Math.round(accuracyPart + flowPart);
  }, [correctCount, currentIndex, focusScore]);

  const handleAnswer = async (correct: boolean) => {
    if (correct) {
      setCorrectCount(prev => prev + 1);
      // Micro-reward animation — small focus score bump.
      setFocusScore(s => Math.min(100, s + 2));
    } else {
      setFocusScore(s => Math.max(0, s - 3));
    }

    // Per-answer telemetry so the SessionReplayModal can step through
    // FlowMode sessions like it does StudyModePage ones. Until this
    // write existed, only offlineStudyService.syncOfflineData populated
    // card_reviews — so any FlowMode run (which is by design deck-less)
    // left the modal showing "Nothing to replay yet". Fire-and-forget:
    // a Supabase hiccup never blocks the user moving on to the next card.
    // FlowMode only has binary grading, so we map correct=true to
    // Rating.GOOD and correct=false to Rating.AGAIN — the modal will
    // show the green/red badge accordingly.
    if (userId && cards[currentIndex]?.id) {
      const reviewedAt = Date.now();
      cardReviewsService.recordReview({
        userId,
        cardId: cards[currentIndex].id,
        rating: correct ? Rating.GOOD : Rating.AGAIN,
        srsResult: { flowMode: true, correct },
        reviewedAt,
      }).catch((err) => {
        console.warn('[FlowMode] recordReview failed (non-blocking):', err);
      });
    }

    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      const totalCorrect = correctCount + (correct ? 1 : 0);
      const accuracy = Math.round((totalCorrect / cards.length) * 100);
      trackStudySession(elapsed, accuracy);
      // Award weekly XP for leagues
      if (userId) {
        try {
          await requireSupabase().auth.getSession();
          const xpDelta = 25 + focusedEarnings; // baseline session XP + flow bonus
          const league = await awardWeeklyXp(userId, lifetimeXp, xpDelta, accuracy);
          setWeeklyXpGained(league.weeklyXp);
        } catch {
          // League write is best-effort; failure must not interrupt the user mid-session.
        }
        // Mirror the regular StudyModePage write-through so the useStudyStats
        // hook and dashboard "Studied today" counter catch this session too.
        // Fire-and-forget — a Supabase hiccup never blocks the SessionReward UI.
        sessionService.saveStudySession({
          userId,
          deckId: undefined,                          // FlowMode loses the deck binding by design
          startTime,
          endTime: Date.now(),
          cardsStudied: cards.length,
          correctAnswers: totalCorrect,
          totalAnswers: cards.length,
          accuracy,
          duration: elapsed,
        }).catch((err) => {
          console.warn('FlowMode saveStudySession failed (non-blocking):', err);
        });
      }
      setShowComplete(true);
      setPhase('done');
    }
  };

  // Breather countdown (3-2-1)
  useEffect(() => {
    if (phase !== 'breathing') return;
    const id = setTimeout(() => setPhase('shower'), 3_500);
    return () => clearTimeout(id);
  }, [phase]);

  if (showComplete) {
    return <SessionReward
      cardsCount={cards.length}
      correct={correctCount}
      time={elapsed}
      focusScore={focusScore}
      buddies={studyBuddies}
      weeklyXpGained={weeklyXpGained}
      onComplete={onComplete}
    />;
  }

  return (
    <div className="fixed inset-0 bg-[#0A0A0F] z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#2A2A3A] bg-[#111118]/80 backdrop-blur">
        <button onClick={onExit} className="p-2 hover:bg-[#1A1A24] rounded-full text-[#7A7A96] hover:text-[#F0EFFE]">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          {phase === 'study' && presenceConnected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 text-[10px] text-[#7A7A96] uppercase tracking-widest"
            >
              <Users size={12} className="text-[#7C3AED]" />
              <span className="text-[#F0EFFE] font-mono">{studyBuddies}</span>
              <span>studying now</span>
            </motion.div>
          )}
          <div className="flex items-center gap-2 text-[#7A7A96] text-xs">
            <ClockIcon className="w-3 h-3" />
            <span className="font-mono text-[#F0EFFE]">{formatTime(elapsed)}</span>
          </div>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-[#1A1A24] rounded-full text-[#7A7A96]"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {phase === 'breathing' && <BreathingPhase onSkip={() => setPhase('shower')} />}
      {phase === 'shower' && <PreShowerPhase next={() => setPhase('study')} />}

      {phase === 'study' && (
        <>
          <div className="px-4 py-2 max-w-2xl mx-auto w-full">
            <Progress value={(currentIndex / cards.length) * 100} className="h-1" />
            <div className="flex items-center justify-between text-[10px] text-[#7A7A96] mt-1.5 uppercase tracking-widest">
              <span>Card {currentIndex + 1} / {cards.length}</span>
              <span className="flex items-center gap-1">
                <Heart size={10} className="text-pink-400" />
                Focus {focusScore}
              </span>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentCard.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="w-full max-w-2xl"
              >
                <Card
                  className="aspect-[3/4] sm:aspect-[16/10] cursor-pointer flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#111118] to-[#0A0A0F] border-[#2A2A3A] hover:border-[#7C3AED]/40 transition-all"
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  <div className="space-y-4">
                    <p className="text-base sm:text-lg md:text-xl text-[#F0EFFE] leading-relaxed">
                      {isFlipped ? currentCard.answer : currentCard.question}
                    </p>
                    <p className="text-xs text-[#7A7A96]">
                      {isFlipped ? 'Tap to see question' : 'Tap to reveal answer'}
                    </p>
                  </div>
                </Card>
              </motion.div>
            </AnimatePresence>
          </div>

          {isFlipped && (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="p-4 grid grid-cols-2 gap-4 max-w-2xl mx-auto w-full"
            >
              <Button
                variant="destructive"
                size="lg"
                onClick={() => handleAnswer(false)}
                className="bg-red-500/10 text-red-300 border border-red-400/30 hover:bg-red-500/20"
              >
                Need Review
              </Button>
              <Button
                size="lg"
                onClick={() => handleAnswer(true)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Got It!
              </Button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
};

function SessionReward({
  cardsCount, correct, time, focusScore, buddies, weeklyXpGained, onComplete,
}: {
  cardsCount: number;
  correct: number;
  time: number;
  focusScore: number;
  buddies: number;
  weeklyXpGained: number;
  onComplete: () => void;
}) {
  const accuracy = Math.round((correct / Math.max(1, cardsCount)) * 100);
  const flowGrade = focusScore >= 90 ? 'Transcendent' : focusScore >= 75 ? 'In The Zone' : focusScore >= 50 ? 'Solid' : 'Tired';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 bg-[#0A0A0F] z-50 flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full bg-gradient-to-br from-[#111118] to-[#0A0A0F] border border-[#2A2A3A] rounded-2xl p-8 text-center space-y-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center shadow-[0_0_30px_rgba(124,58,237,0.4)]"
        >
          <Sparkles className="w-10 h-10 text-white" />
        </motion.div>
        <div>
          <h2 className="text-2xl font-bold text-[#F0EFFE]">Flow State Captured</h2>
          <p className="text-xs text-[#7A7A96] uppercase tracking-widest mt-1">{flowGrade}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Cards" value={cardsCount.toString()} />
          <Stat label="Time" value={formatTime(time)} />
          <Stat label="Accuracy" value={`${accuracy}%`} accent />
          <Stat label="Focus" value={`${focusScore}`} accent />
        </div>
        <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#1A1A24] border border-[#2A2A3A] text-xs">
          <Users size={14} className="text-[#7C3AED]" />
          <span className="text-[#9090A8]">You studied alongside</span>
          <span className="font-bold text-[#F0EFFE]">{buddies}</span>
          <span className="text-[#9090A8]">other learners</span>
        </div>
        {weeklyXpGained > 0 && (
          <div className="text-xs text-[#FFD700]">
            + {weeklyXpGained} weekly XP earned toward your League
          </div>
        )}
        <Button onClick={onComplete} className="w-full" size="lg">
          Continue
        </Button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${accent ? 'bg-[#7C3AED]/10 border-[#7C3AED]/30' : 'bg-[#1A1A24] border-[#2A2A3A]'}`}>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-[#8B5CF6]' : 'text-[#F0EFFE]'}`}>{value}</div>
      <div className="text-[10px] text-[#7A7A96] uppercase tracking-widest">{label}</div>
    </div>
  );
}

function BreathingPhase({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <motion.div
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        className="w-32 h-32 rounded-full bg-gradient-to-br from-[#7C3AED]/30 to-[#3B82F6]/30 flex items-center justify-center mb-8"
      >
        <Wind size={48} className="text-[#8B5CF6]" />
      </motion.div>
      <h2 className="text-2xl font-light text-[#F0EFFE] tracking-tight mb-2">Take a breath.</h2>
      <p className="text-[#7A7A96] text-sm max-w-sm text-center">
        Inhale 4 · Hold 4 · Exhale 4. Centre yourself before diving in.
      </p>
      <button
        onClick={onSkip}
        className="mt-8 text-[10px] text-[#7A7A96] hover:text-[#8B5CF6] uppercase tracking-widest"
      >
        skip
      </button>
    </div>
  );
}

function PreShowerPhase({ next }: { next: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-md text-center">
        {['Pomodoro', 'Active Recall', 'Focus'].map(w => (
          <motion.span
            key={w}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="px-3 py-1 bg-[#1A1A24] border border-[#2A2A3A] rounded-md text-xs text-[#9090A8]"
          >
            {w}
          </motion.span>
        ))}
      </div>
      <Button onClick={next} size="lg" className="bg-[#7C3AED] hover:bg-[#6D28D9]">
        Begin session →
      </Button>
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default FlowMode;

