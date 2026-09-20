import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Flame, BookOpen, Brain, Plus, ArrowRight, Play,
  Target, Sparkles, Zap, Clock, ChevronRight, Layers, Check,
} from '@/components/icons';
import { toast } from 'sonner';
import { NoDecksArt } from '../../graphics';
import { createStarterDeck } from '../../../services/decks/starterDeckService';
import { useDashboardWorkspace } from '../../../contexts/DashboardWorkspaceContext';
import type { Deck, Card } from '../../../types';
import {
  CountUp, FadeUp, RevealOnScroll, SRAnnounce, AnimatedBar, AnimatedRing,
} from './motion';
import { AnimatedSparkline, SalesAreaChart } from './NovaCharts';
import { PulsingDot } from './icons';
import {
  bucketReviewsByDay,
  fetchDailyReviewCounts,
  type DayActivity,
} from '../../../services/database/modules/reviewActivityService';

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Trailing review activity for the charts. Reads the real per-review log
 * (`card_reviews`) on mount / account switch; while loading — or when the
 * log is unreachable (offline) — falls back to bucketing the already-loaded
 * client cards by `lastReviewed` day. Both sources are real data; nothing
 * here is ever invented. The fallback undercounts multi-review days (one
 * timestamp per card) but never fabricates.
 */
function useDailyReviewActivity(userId: string | undefined, days: number) {
  const [activity, setActivity] = useState<DayActivity[] | null>(null);
  useEffect(() => {
    if (!userId) {
      setActivity(null);
      return;
    }
    let cancelled = false;
    setActivity(null);
    void fetchDailyReviewCounts(userId, days).then(result => {
      if (!cancelled) setActivity(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, days]);
  return activity;
}

/** Fallback buckets from client cards (lastReviewed day). Real, partial. */
function bucketClientCards(cards: Card[], days: number): DayActivity[] {
  const stamps = cards
    .map(c => c.lastReviewed ?? NaN)
    .filter(ts => Number.isFinite(ts));
  return bucketReviewsByDay(stamps, days);
}

function deckStats(deck: Deck, cards: Card[]) {
  const now = Date.now();
  const mine = cards.filter(c => c.deckId === deck.id);
  const due = mine.filter(c => (c.nextReview ?? 0) <= now).length;
  const studied = mine.filter(c => (c.repetition ?? 0) > 0).length;
  const mastered = mine.filter(c => (c.repetition ?? 0) >= 3 && (c.lapses ?? 0) === 0).length;
  const total = mine.length;
  const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
  return { due, studied, mastered, total, pct };
}

// ─── Metric pill ────────────────────────────────────────────────────────────

function MetricPill({
  icon: Icon,
  label,
  value,
  suffix = '',
  accent,
  spark,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  accent: 'violet' | 'amber' | 'cyan' | 'fuchsia';
  spark?: Array<[number, number]>;
  delay?: number;
}) {
  const chip = {
    violet: 'nova-chip-violet',
    amber: 'nova-chip-amber',
    cyan: 'nova-chip-cyan',
    fuchsia: 'nova-chip-fuchsia',
  }[accent];
  const trend = {
    violet: ['#A78BFA', '#7C3AED'] as [string, string],
    amber: ['#FCD34D', '#F59E0B'] as [string, string],
    cyan: ['#67E8F9', '#06B6D4'] as [string, string],
    fuchsia: ['#F0ABFC', '#D946EF'] as [string, string],
  }[accent];

  return (
    <FadeUp delay={delay}>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        className="nova-card p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-black/25 ${chip}`}>
            <Icon className="h-4 w-4 text-white" aria-hidden />
          </div>
          {spark && spark.length > 0 && (
            <AnimatedSparkline points={spark} gradientFrom={trend[0]} gradientTo={trend[1]} width={72} height={28} />
          )}
        </div>
        <div className="nova-label mt-4">{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="text-[1.75rem] sm:text-[2rem] font-bold tabular-nums leading-none tracking-tight text-white">
            <CountUp value={value} duration={1} delay={delay + 0.12} />
          </span>
          {suffix && <span className="text-sm font-semibold text-zinc-400">{suffix}</span>}
        </div>
      </motion.div>
    </FadeUp>
  );
}

// ─── Command Hero ───────────────────────────────────────────────────────────

function CommandHero({
  greeting,
  firstName,
  dueCount,
  studiedToday,
  streak,
  onStudy,
  onCreate,
}: {
  greeting: string;
  firstName: string;
  dueCount: number;
  studiedToday: number;
  streak: number;
  onStudy: () => void;
  onCreate: () => void;
}) {
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const status =
    dueCount === 0
      ? 'You are fully caught up. Protect the streak or deepen mastery.'
      : dueCount === 1
        ? 'One card is waiting — a two-minute session keeps your curve sharp.'
        : `${dueCount} cards are due. A focused session locks them back into memory.`;

  return (
    <FadeUp y={10}>
      <section className="nova-card-elevated nova-sheen relative overflow-hidden">
        <div className="relative z-10 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-10 lg:p-10">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-100/90">
                <PulsingDot size={5} color="#A78BFA" />
                AuraMind
              </span>
              <span className="text-[11px] tabular-nums text-zinc-400">
                {dayName} · {dateStr}
              </span>
            </div>

            <p className="nova-label text-violet-200/80">{greeting}</p>
            <h1 className="nova-display mt-2 text-4xl leading-[1.05] text-white sm:text-5xl lg:text-[3.4rem]">
              {firstName}
            </h1>
            <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-zinc-300/90 sm:text-[15px]">
              {status}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <motion.button
                type="button"
                onClick={onStudy}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="nova-cta"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                {dueCount > 0 ? 'Start study session' : 'Review for mastery'}
              </motion.button>
              <motion.button
                type="button"
                onClick={onCreate}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="nova-cta-ghost"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New deck
              </motion.button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: 'Due now', value: dueCount, accent: 'text-cyan-200' },
              { label: 'Today', value: studiedToday, accent: 'text-violet-200' },
              { label: 'Streak', value: streak, accent: 'text-amber-200', suffix: 'd' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-4 backdrop-blur-sm sm:px-4"
              >
                <div className="nova-label">{stat.label}</div>
                <div className={`mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl ${stat.accent}`}>
                  <CountUp value={stat.value} duration={1} delay={0.25 + i * 0.08} />
                  {stat.suffix ?? ''}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Ambient neural constellation */}
        <svg
          viewBox="0 0 420 280"
          className="pointer-events-none absolute -right-6 top-0 h-full w-[55%] opacity-70 sm:w-[48%]"
          aria-hidden
        >
          <defs>
            <radialGradient id="nova-cmd-glow" cx="70%" cy="35%" r="55%">
              <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.45" />
              <stop offset="45%" stopColor="#22D3EE" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0B1020" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="nova-cmd-orb" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E879F9" />
              <stop offset="55%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <rect width="420" height="280" fill="url(#nova-cmd-glow)" />
          {[0, 1, 2, 3, 4].map(i => (
            <motion.circle
              key={i}
              cx={290}
              cy={110}
              r={22 + i * 22}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={1.2 - i * 0.08}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
          <motion.circle
            cx={290}
            cy={110}
            r={18}
            fill="url(#nova-cmd-orb)"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 240, damping: 18 }}
          />
          {[
            { x: 220, y: 190, c: '#67E8F9' },
            { x: 340, y: 175, c: '#F0ABFC' },
            { x: 360, y: 95, c: '#FCD34D' },
            { x: 200, y: 95, c: '#A78BFA' },
          ].map((p, i) => (
            <motion.circle
              key={`n${i}`}
              cx={p.x}
              cy={p.y}
              r={2.4}
              fill={p.c}
              animate={{ y: [p.y, p.y - 7, p.y] }}
              transition={{ duration: 3.2 + i * 0.35, repeat: Infinity, ease: 'easeInOut', delay: 0.5 + i * 0.1 }}
            />
          ))}
        </svg>
      </section>
    </FadeUp>
  );
}

// ─── Memory Health ──────────────────────────────────────────────────────────

function MemoryHealth({
  retention,
  mastered,
  total,
  avgEase,
}: {
  retention: number;
  mastered: number;
  total: number;
  avgEase: number;
}) {
  return (
    <FadeUp delay={0.18}>
      <div className="nova-card flex h-full flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="nova-label">Memory health</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Retention curve</h2>
          </div>
          <Target className="h-4 w-4 text-cyan-300/80" aria-hidden />
        </div>

        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-5 sm:flex-row sm:gap-8">
          <AnimatedRing
            value={retention / 100}
            size={128}
            strokeWidth={8}
            gradientId="nova-retention-ring"
            gradientFrom="#22D3EE"
            gradientTo="#8B5CF6"
          >
            <span className="text-2xl font-bold tabular-nums text-white leading-none">
              <CountUp value={retention} duration={1.1} delay={0.25} />
              <span className="text-sm text-zinc-400">%</span>
            </span>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              retained
            </span>
          </AnimatedRing>

          <div className="w-full space-y-4 sm:max-w-[180px]">
            <div>
              <div className="mb-1.5 flex justify-between text-[11px]">
                <span className="text-zinc-400">Mastered</span>
                <span className="font-semibold tabular-nums text-white">{mastered}/{total}</span>
              </div>
              <AnimatedBar
                value={mastered}
                max={Math.max(total, 1)}
                delay={0.3}
                gradient="from-violet-500 to-fuchsia-400"
              />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-[11px]">
                <span className="text-zinc-400">Avg ease</span>
                <span className="font-semibold tabular-nums text-cyan-200">{avgEase.toFixed(2)}</span>
              </div>
              <AnimatedBar
                value={avgEase}
                max={3.5}
                delay={0.4}
                gradient="from-cyan-400 to-emerald-400"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Ease above 2.5 means reviews stay light. Below 2.0 and the queue gets heavier.
            </p>
          </div>
        </div>
      </div>
    </FadeUp>
  );
}

// ─── Activity chart ─────────────────────────────────────────────────────────

function ActivityPanel({
  totalCards,
  studiedToday,
  dueNow,
  days,
}: {
  totalCards: number;
  studiedToday: number;
  dueNow: number;
  /** Trailing-7-day review counts (real log data). Never synthesized. */
  days: DayActivity[];
}) {
  const points = useMemo(
    () => days.map(d => ({ label: d.label, value: d.count })),
    [days],
  );

  return (
    <FadeUp delay={0.22}>
      <div className="nova-card-elevated h-full p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="nova-label">This week</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">
                <CountUp value={totalCards} duration={1} delay={0.28} />
              </span>
              <span className="text-xs text-zinc-400">cards in library</span>
            </div>
          </div>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold tabular-nums text-cyan-200">
            {dueNow} due
          </div>
        </div>
        <SalesAreaChart
          points={points}
          width={680}
          height={180}
          gradientId="nova-week-area"
          showBadge={`${studiedToday} today`}
          showLabels
          showGrid
        />
      </div>
    </FadeUp>
  );
}

// ─── Focus queue ────────────────────────────────────────────────────────────

function FocusQueue({
  decks,
  cards,
  onStudy,
}: {
  decks: Deck[];
  cards: Card[];
  onStudy: (deckId: string) => void;
}) {
  const navigate = useNavigate();
  const ranked = useMemo(() => {
    return decks
      .map(deck => ({ deck, ...deckStats(deck, cards) }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.due - a.due || b.pct - a.pct)
      .slice(0, 5);
  }, [decks, cards]);

  return (
    <FadeUp delay={0.26}>
      <div className="nova-card h-full p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="nova-label">Focus queue</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">What to study next</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/study')}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-200 hover:text-white"
          >
            All decks <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </div>

        {ranked.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Layers className="mb-3 h-8 w-8 text-zinc-600" aria-hidden />
            <p className="text-sm text-zinc-400">No decks yet — create one to build your queue.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {ranked.map((item, i) => (
              <motion.li
                key={item.deck.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.32 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <button
                  type="button"
                  onClick={() => onStudy(item.deck.id)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3 text-left transition-all hover:border-violet-400/30 hover:bg-white/[0.06]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl nova-chip-violet shadow-md shadow-violet-500/20">
                    <Brain className="h-4 w-4 text-white" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white group-hover:text-violet-100">
                      {item.deck.title}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="nova-track flex-1">
                        <motion.span
                          className="nova-track-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${item.pct}%` }}
                          transition={{ delay: 0.4 + i * 0.05, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums text-zinc-500">{item.pct}%</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {item.due > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-cyan-400/10 px-2 py-1 text-[10px] font-bold tabular-nums text-cyan-200">
                        <Clock className="h-3 w-3" aria-hidden />
                        {item.due}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-300">Clear</span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300" aria-hidden />
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </FadeUp>
  );
}

// ─── Today's plan ───────────────────────────────────────────────────────────

function TodaysPlan({
  dueCount,
  studiedToday,
  streak,
  mastered,
  onStudy,
  onChat,
}: {
  dueCount: number;
  studiedToday: number;
  streak: number;
  mastered: number;
  onStudy: () => void;
  onChat: () => void;
}) {
  const steps = [
    {
      done: studiedToday > 0,
      title: studiedToday > 0 ? `Reviewed ${studiedToday} cards` : 'Open a study session',
      hint: dueCount > 0 ? `${dueCount} waiting in queue` : 'Optional mastery pass',
      action: onStudy,
    },
    {
      done: streak > 0 && studiedToday > 0,
      title: streak > 0 ? `Keep the ${streak}-day streak` : 'Start a streak today',
      hint: 'Consistency beats volume',
      action: onStudy,
    },
    {
      done: false,
      title: 'Ask Prof. Aura',
      hint: 'Generate cards or explain a concept',
      action: onChat,
    },
  ];

  return (
    <FadeUp delay={0.3}>
      <div className="nova-card flex h-full flex-col p-5 sm:p-6">
        <div className="mb-1 flex items-center justify-between">
          <div className="nova-label">Today&apos;s plan</div>
          <span className="text-[10px] font-bold tabular-nums text-emerald-300">
            +{studiedToday * 12} XP
          </span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-white">Three moves</h2>
        <p className="mt-1 text-xs text-zinc-400">
          {mastered} cards at mastery · streak vault open
        </p>

        <ol className="mt-5 flex-1 space-y-2">
          {steps.map((step, i) => (
            <li key={step.title}>
              <button
                type="button"
                onClick={step.action}
                className="flex w-full items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-3 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step.done
                      ? 'bg-emerald-400/20 text-emerald-300'
                      : 'bg-white/10 text-zinc-300'
                  }`}
                >
                  {step.done ? <Check size={13} aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{step.title}</span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">{step.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <motion.button
          type="button"
          onClick={onStudy}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="nova-cta mt-5 w-full"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Dive in now
        </motion.button>
      </div>
    </FadeUp>
  );
}

// ─── Continue learning grid ─────────────────────────────────────────────────

function ContinueLearning({ decks, cards }: { decks: Deck[]; cards: Card[] }) {
  const navigate = useNavigate();
  const items = useMemo(
    () => decks.slice(0, 4).map(deck => ({ deck, ...deckStats(deck, cards) })),
    [decks, cards],
  );

  if (items.length === 0) return null;

  return (
    <RevealOnScroll y={16}>
      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="nova-label">Library</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Continue learning</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/decks')}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-200 hover:text-white"
          >
            Open library <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <motion.button
              key={item.deck.id}
              type="button"
              onClick={() => navigate(`/dashboard/study/${item.deck.id}`)}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4 }}
              className="nova-card group overflow-hidden p-4 text-left"
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-500/20 ring-1 ring-white/10">
                  <BookOpen className="h-4 w-4 text-violet-100" aria-hidden />
                </div>
                {item.due > 0 ? (
                  <span className="rounded-md bg-rose-400/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-rose-200">
                    {item.due} due
                  </span>
                ) : (
                  <Flame className="h-3.5 w-3.5 text-amber-300/70" aria-hidden />
                )}
              </div>
              <div className="truncate text-sm font-semibold text-white group-hover:text-violet-100">
                {item.deck.title}
              </div>
              <div className="mt-1 text-[11px] tabular-nums text-zinc-500">
                {item.total} cards · {item.mastered} mastered
              </div>
              <div className="nova-track mt-4">
                <motion.span
                  className="nova-track-fill"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${item.pct}%` }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + i * 0.05, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-bold tabular-nums text-zinc-500">
                <span>{item.pct}% explored</span>
                <span className="inline-flex items-center gap-0.5 text-violet-200 opacity-0 transition-opacity group-hover:opacity-100">
                  Study <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </RevealOnScroll>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

/**
 * First-run empty state.
 *
 * Both original paths cost the user work before anything happened — author
 * cards by hand, or type a topic and wait on the generator — and neither
 * reached the voice mode they signed up for. The primary action is now a
 * ready-made deck that is one tap from a real session, so time-to-first-value
 * is a click rather than a chore.
 *
 * The headline states the next action rather than the current absence;
 * "Your library is empty" describes a problem the user already knows about.
 */
function EmptyState({
  onCreate,
  onGenerate,
  onTrySample,
  seeding,
}: {
  onCreate: () => void;
  onGenerate: () => void;
  onTrySample: () => void;
  seeding: boolean;
}) {
  return (
    <FadeUp delay={0.2}>
      <div className="nova-card-elevated px-6 py-14 text-center sm:px-12">
        {/* Shows audio and documents becoming cards — the value proposition,
            rather than a generic sparkle. */}
        <NoDecksArt size={176} className="mx-auto mb-5 text-violet-300/70" />
        <p className="nova-label text-violet-200/80">AuraMind</p>
        <h2 className="nova-display mt-2 text-3xl text-white sm:text-4xl">
          Start with eight cards
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-300/85">
          Try a short deck on how memory works — about two minutes, and you can
          answer it out loud. Or build your own from a topic, a recording, or a
          document.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={onTrySample} disabled={seeding} className="nova-cta">
            <Play className="h-3.5 w-3.5" aria-hidden />
            {seeding ? 'Setting up…' : 'Try a sample deck'}
          </button>
          <button type="button" onClick={onGenerate} className="nova-cta-ghost">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Generate with AI
          </button>
          <button type="button" onClick={onCreate} className="nova-cta-ghost">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Create my own
          </button>
        </div>
      </div>
    </FadeUp>
  );
}

// ─── NovaOverview ───────────────────────────────────────────────────────────

export function NovaOverview() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const { user, decks, cards, startQuickStudy, startStudyForDeck } = workspace!;

  const [seedingSample, setSeedingSample] = useState(false);

  /**
   * Seeds the starter deck and drops the user straight into it.
   *
   * Goes to the session rather than the deck list on purpose: the point of
   * this path is that the first study session happens immediately, without
   * an intermediate screen asking the user to choose something again.
   */
  const handleTrySample = useCallback(async () => {
    if (!user?.id || seedingSample) return;
    setSeedingSample(true);
    try {
      const { deck } = await createStarterDeck(user.id);
      startStudyForDeck(deck.id);
    } catch (err) {
      console.error('[NovaOverview] Could not create the starter deck:', err);
      toast.error('Could not set up the sample deck. Please try again.');
      setSeedingSample(false);
    }
  }, [user?.id, seedingSample, startStudyForDeck]);

  const todayStart = startOfTodayMs();
  const dueCount = useMemo(() => cards.filter(c => (c.nextReview ?? 0) <= Date.now()).length, [cards]);
  const studiedToday = useMemo(
    () => cards.filter(c => (c.lastReviewed ?? 0) >= todayStart).length,
    [cards, todayStart],
  );
  const mastered = useMemo(
    () => cards.filter(c => (c.lapses ?? 0) === 0 && (c.repetition ?? 0) >= 3).length,
    [cards],
  );
  const retention = useMemo(() => {
    const reviewed = cards.filter(c => (c.repetition ?? 0) > 0).length;
    if (reviewed === 0) return 0;
    const solid = cards.filter(c => (c.repetition ?? 0) >= 2 && (c.lapses ?? 0) <= 1).length;
    return Math.min(100, Math.round((solid / reviewed) * 100));
  }, [cards]);
  const avgEase = useMemo(() => {
    if (cards.length === 0) return 2.5;
    const sum = cards.reduce((acc, c) => acc + (c.easeFactor ?? 2.5), 0);
    return sum / cards.length;
  }, [cards]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'Learner';
  const streak = user?.streak ?? 0;

  // Trailing-8-day review log for the charts (real data; null while
  // loading/offline, in which case the client-card fallback below applies).
  const logActivity = useDailyReviewActivity(user?.id, 8);
  const fallbackDays = useMemo(() => bucketClientCards(cards, 8), [cards]);
  const trail = logActivity ?? fallbackDays;
  const weekDays = useMemo(() => trail.slice(-7), [trail]);
  // Reviewed spark: real trailing counts. Streak spark: real studied/not
  // per day. Due + Mastered are point-in-time snapshots with no stored
  // history — reconstructing it would be fabrication, so those pills carry
  // no spark (the prop is optional).
  const sparkToday: Array<[number, number]> = useMemo(
    () => trail.map((d, i) => [i, d.count] as [number, number]),
    [trail],
  );
  const sparkStreak: Array<[number, number]> = useMemo(
    () => trail.map((d, i) => [i, d.studied ? 1 : 0] as [number, number]),
    [trail],
  );

  const goStudy = () => {
    if (decks.length === 0) {
      navigate('/dashboard/decks');
      return;
    }
    startQuickStudy();
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <SRAnnounce
        message={`Dashboard ready. ${dueCount} cards due, ${studiedToday} reviewed today, ${streak} day streak.`}
      />

      <CommandHero
        greeting={greeting}
        firstName={firstName}
        dueCount={dueCount}
        studiedToday={studiedToday}
        streak={streak}
        onStudy={goStudy}
        onCreate={() => navigate('/dashboard/decks')}
      />

      {decks.length === 0 ? (
        <EmptyState
          onCreate={() => navigate('/dashboard/decks')}
          onGenerate={() => navigate('/dashboard/generator')}
          onTrySample={handleTrySample}
          seeding={seedingSample}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <MetricPill icon={Clock} label="Due now" value={dueCount} accent="cyan" delay={0.04} />
            <MetricPill icon={Zap} label="Reviewed today" value={studiedToday} accent="violet" spark={sparkToday} delay={0.08} />
            <MetricPill icon={Flame} label="Streak" value={streak} suffix="d" accent="amber" spark={sparkStreak} delay={0.12} />
            <MetricPill icon={Brain} label="Mastered" value={mastered} accent="fuchsia" delay={0.16} />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ActivityPanel totalCards={cards.length} studiedToday={studiedToday} dueNow={dueCount} days={weekDays} />
            </div>
            <div className="lg:col-span-2">
              <MemoryHealth
                retention={retention}
                mastered={mastered}
                total={cards.length}
                avgEase={avgEase}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <FocusQueue decks={decks} cards={cards} onStudy={startStudyForDeck} />
            </div>
            <div className="lg:col-span-2">
              <TodaysPlan
                dueCount={dueCount}
                studiedToday={studiedToday}
                streak={streak}
                mastered={mastered}
                onStudy={goStudy}
                onChat={() => navigate('/dashboard/chat')}
              />
            </div>
          </div>

          <ContinueLearning decks={decks} cards={cards} />
        </>
      )}
    </div>
  );
}
