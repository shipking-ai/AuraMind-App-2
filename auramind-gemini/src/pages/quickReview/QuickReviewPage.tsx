/**
 * Quick Review: the corner panel opened by Ctrl+Alt+Space, the tray or a
 * notification. Up to 10 due cards, most overdue first; Space flips, 1–4
 * rates, Esc hides. Ratings use the study screen's path (rateCard) and the
 * main window refreshes its counts through the shell.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Card } from '../../types';
import { Rating } from '../../types';
import { dbService } from '../../services/database/dbService';
import { rateCard } from '../../services/study/rateCard';
import { desktop } from '../../desktop/bridge';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';

export const QUICK_REVIEW_LIMIT = 10;
export const DONE_HIDE_MS = 2000;

const RATINGS = [
  ['Again', Rating.AGAIN],
  ['Hard', Rating.HARD],
  ['Good', Rating.GOOD],
  ['Easy', Rating.EASY],
] as const;

export function pickDueCards(cards: Card[], now: number, limit = QUICK_REVIEW_LIMIT): Card[] {
  return cards
    .filter((c) => (c.nextReview ?? 0) <= now)
    .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))
    .slice(0, limit);
}

export function formatNextDue(ms: number | null, now: number): string {
  if (ms === null) return '';
  const minutes = Math.max(1, Math.round((ms - now) / 60_000));
  if (minutes < 60) return `Next card due in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Next card due in ${hours}h`;
  return 'Next card due tomorrow';
}

export default function QuickReviewPage() {
  const userId = useCurrentUserId();
  const [queue, setQueue] = useState<Card[]>([]);
  const [deckTitles, setDeckTitles] = useState<Record<string, string>>({});
  const [nextDue, setNextDue] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('quick-review-window');
    return () => document.documentElement.classList.remove('quick-review-window');
  }, []);

  const load = useCallback(async () => {
    if (typeof userId !== 'string') return;
    setLoading(true);
    const [cards, decks] = await Promise.all([dbService.fetchCards(userId), dbService.fetchDecks(userId)]);
    const now = Date.now();
    setQueue(pickDueCards(cards, now));
    const future = cards.map((c) => c.nextReview ?? 0).filter((t) => t > now);
    setNextDue(future.length ? Math.min(...future) : null);
    setDeckTitles(Object.fromEntries(decks.map((d) => [d.id, d.title])));
    setIndex(0);
    setRevealed(false);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // The window is hidden, not closed, between uses: reload when it returns.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  const done = !loading && index >= queue.length;
  const card = queue[index];

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => void desktop.quickReviewDone(), DONE_HIDE_MS);
    return () => clearTimeout(id);
  }, [done]);

  const rate = useCallback(async (rating: Rating) => {
    if (!card || !revealed) return;
    await rateCard({ card, rating, userId, surface: 'quick-review' });
    void desktop.cardsChanged();
    setRevealed(false);
    setIndex((i) => i + 1);
  }, [card, revealed, userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { void desktop.quickReviewDone(); return; }
      if (!card) return;
      if (e.code === 'Space') { e.preventDefault(); setRevealed(true); return; }
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= 4) void rate(RATINGS[n - 1][1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, rate]);

  const shell = 'flex h-screen w-screen flex-col rounded-[14px] border border-violet-400/30 bg-[#0b1022]/80 p-4 text-[#eceaff] select-none';

  if (userId === null) {
    return (
      <div className={`${shell} items-center justify-center gap-3 text-center`}>
        <p className="text-sm text-zinc-300">Sign in to review your cards.</p>
        <button
          type="button"
          onClick={() => { void desktop.showMain('/auth'); void desktop.quickReviewDone(); }}
          className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-400"
        >
          Sign in to AuraMind
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`${shell} items-center justify-center text-center transition-opacity`}>
        <p className="text-lg font-semibold">All caught up</p>
        <p className="mt-1 text-xs text-zinc-400">{formatNextDue(nextDue, Date.now())}</p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span className="truncate">Quick review{card ? ` · ${deckTitles[card.deckId] ?? ''}` : ''}</span>
        <span className="flex items-center gap-3">
          {queue.length > 0 && <span>{index + 1} / {queue.length}</span>}
          <button type="button" aria-label="Close" onClick={() => void desktop.quickReviewDone()} className="rounded px-1 text-zinc-500 hover:text-zinc-200">✕</button>
        </span>
      </div>

      {card && (
        <>
          <p className="mt-4 text-lg font-semibold leading-snug">{card.front || card.question}</p>
          {revealed ? (
            <p className="mt-3 border-t border-white/10 pt-3 text-sm text-zinc-300">{card.back || card.answer}</p>
          ) : (
            <button type="button" onClick={() => setRevealed(true)} className="mt-4 self-start rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
              Show answer
            </button>
          )}
          <div className="mt-auto">
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Rate your recall">
              {RATINGS.map(([label, rating], i) => (
                <button
                  key={label}
                  type="button"
                  disabled={!revealed}
                  onClick={() => void rate(rating)}
                  className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${label === 'Good' ? 'bg-violet-500/45 hover:bg-violet-500/60' : 'bg-white/[0.06] hover:bg-white/10'}`}
                >
                  {label} <span className="opacity-50">{i + 1}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 h-[3px] overflow-hidden rounded bg-white/[0.08]">
              <div className="h-full rounded bg-gradient-to-r from-[#72F4FF] via-[#8B5CF6] to-[#FF9ACD]" style={{ width: `${(index / Math.max(queue.length, 1)) * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-[10px] text-zinc-500">Space flip · 1–4 rate · Esc hide</p>
          </div>
        </>
      )}
    </div>
  );
}
