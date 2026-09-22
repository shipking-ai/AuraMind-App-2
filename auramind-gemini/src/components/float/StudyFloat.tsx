/**
 * Study Float — desktop web only. Pops the due-card queue out into an
 * always-on-top Document Picture-in-Picture window, so reviews happen in the
 * corner of the screen while the user works in another app or tab.
 *
 * Chromium browsers (Chrome/Edge 116+) and Firefox 151+ ship the API; where it
 * is missing, or inside the native apps, the button is not rendered at all.
 * Grading goes through reviewCard, so float reviews are real reviews.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Layers, RotateCcw, X } from '@/components/icons';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { Card, Rating } from '../../types';
import { formatInterval, previewIntervals, retentionFromSetting } from '../../services/study/srs';
import { reviewCard } from '../../services/study/quickReview';
import { useAppPreference } from '../../lib/appPreferences';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { analyticsService } from '../../services/analytics/analyticsService';
import { Capacitor } from '../../lib/nativeShim';

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

const FLOAT_SIZE = { width: 380, height: 520 };
const QUEUE_LIMIT = 50;
const DAY_MS = 86_400_000;

function pipApi(): DocumentPictureInPicture | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture ?? null;
}

export function isStudyFloatSupported(): boolean {
  return pipApi() !== null && !Capacitor.isNativePlatform();
}

/** Due cards, most overdue first, as the float's review order. */
export function buildFloatQueue(cards: readonly Card[], now: number, limit = QUEUE_LIMIT): string[] {
  return cards
    .filter((c) => (c.nextReview ?? 0) <= now)
    .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))
    .slice(0, limit)
    .map((c) => c.id);
}

/** Copies the page's styles into the float so Tailwind classes work there. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      target.head.appendChild(style);
    } catch {
      // Cross-origin sheets can't be read; link them instead.
      if (sheet.href) {
        const link = target.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
  target.documentElement.className = document.documentElement.className;
  target.title = 'AuraMind · Float';
}

const GRADES: { rating: Rating; label: string; key: string; tone: string }[] = [
  { rating: Rating.AGAIN, label: 'Again', key: '1', tone: 'border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20' },
  { rating: Rating.HARD, label: 'Hard', key: '2', tone: 'border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20' },
  { rating: Rating.GOOD, label: 'Good', key: '3', tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20' },
  { rating: Rating.EASY, label: 'Easy', key: '4', tone: 'border-sky-400/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20' },
];

export function FloatReviewer({
  cards,
  deckTitles,
  initialQueue,
  retention,
  onGrade,
  onClose,
  keyTarget,
}: {
  cards: readonly Card[];
  deckTitles: Record<string, string>;
  initialQueue: string[];
  retention: number;
  onGrade: (card: Card, rating: Rating) => void;
  onClose: () => void;
  /** The float's own window: keys pressed there drive the reviewer. */
  keyTarget: Window;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const card = queue.length ? byId.get(queue[0]) : undefined;
  const intervals = useMemo(() => (card ? previewIntervals(card, undefined, retention) : null), [card, retention]);

  const grade = useCallback(
    (rating: Rating) => {
      if (!card || !flipped) return;
      onGrade(card, rating);
      setReviewed((n) => n + 1);
      setFlipped(false);
      setQueue((q) => q.slice(1));
    },
    [card, flipped, onGrade],
  );

  // A card deleted in the main window drops out of the queue.
  useEffect(() => {
    if (queue.length && !byId.has(queue[0])) setQueue((q) => q.filter((id) => byId.has(id)));
  }, [queue, byId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (e.key === 'Escape') return onClose();
      const g = GRADES.find((x) => x.key === e.key);
      if (g) grade(g.rating);
    };
    keyTarget.addEventListener('keydown', onKey);
    return () => keyTarget.removeEventListener('keydown', onKey);
  }, [keyTarget, grade, onClose]);

  const nextDue = useMemo(() => {
    const future = cards.map((c) => c.nextReview ?? 0).filter((t) => t > Date.now());
    return future.length ? Math.min(...future) : null;
  }, [cards]);

  return (
    <div className="flex h-screen flex-col gap-3 bg-[#0b0a14] p-4 text-white" style={{ fontFamily: 'inherit' }}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/80">
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Float
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-zinc-400" aria-live="polite">
            {card ? `${queue.length} left` : `${reviewed} done`}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close float"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {card ? (
        <>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-expanded={flipped}
            className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-500/[0.12] via-white/[0.03] to-sky-500/[0.08] p-5 text-left transition-colors hover:border-violet-400/30"
          >
            <span className="mb-3 truncate text-[11px] font-medium text-zinc-400">
              {deckTitles[card.deckId] ?? 'Deck'}
            </span>
            <span className="flex-1 overflow-y-auto whitespace-pre-wrap text-lg font-semibold leading-snug">
              {card.front}
            </span>
            {flipped && (
              <span className="mt-4 max-h-[45%] overflow-y-auto whitespace-pre-wrap border-t border-white/10 pt-4 text-[15px] leading-relaxed text-zinc-200">
                {card.back}
              </span>
            )}
          </button>

          {flipped && intervals ? (
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="Grade">
              {GRADES.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => grade(g.rating)}
                  className={`flex flex-col items-center rounded-xl border py-2 text-xs font-semibold transition-colors ${g.tone}`}
                >
                  {g.label}
                  <span className="mt-0.5 text-[10px] font-medium opacity-70">{formatInterval(intervals[g.rating])}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-zinc-500">
              Click the card or press <kbd className="rounded bg-white/10 px-1">Space</kbd> to flip
            </p>
          )}
          {flipped && (
            <p className="text-center text-[10px] text-zinc-500">Keys 1–4 grade · Esc closes</p>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <Check className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-base font-semibold">All caught up</p>
          <p className="max-w-[16rem] text-sm text-zinc-400">
            {reviewed > 0 ? `${reviewed} reviewed. ` : ''}
            {nextDue ? `Next card is due in ${formatInterval((nextDue - Date.now()) / DAY_MS)}.` : 'Nothing is scheduled yet.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setQueue(buildFloatQueue(cards, Date.now()));
              setReviewed(0);
            }}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

/** Top-bar button that opens the float; renders nothing where unsupported. */
export function StudyFloatButton({ className = '' }: { className?: string }) {
  const workspace = useDashboardWorkspace();
  const userId = useCurrentUserId();
  const [retentionSetting] = useAppPreference('auramind_retention', 'Balanced - 85%');
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [initialQueue, setInitialQueue] = useState<string[]>([]);
  const pipRef = useRef<Window | null>(null);

  const close = useCallback(() => {
    pipRef.current?.close();
    pipRef.current = null;
    setPipWindow(null);
  }, []);

  // Leaving the dashboard unmounts the button; take the float with it.
  useEffect(() => () => pipRef.current?.close(), []);

  const open = useCallback(async () => {
    const api = pipApi();
    if (!api || !workspace) return;
    if (pipRef.current) return pipRef.current.focus();
    try {
      const win = await api.requestWindow(FLOAT_SIZE);
      copyStyles(win.document);
      win.addEventListener('pagehide', () => {
        pipRef.current = null;
        setPipWindow(null);
      });
      pipRef.current = win;
      setInitialQueue(buildFloatQueue(workspace.cards, Date.now()));
      setPipWindow(win);
      analyticsService.track('study_float_opened', {});
    } catch {
      // Needs a user gesture; a blocked request just leaves the button idle.
    }
  }, [workspace]);

  const onGrade = useCallback(
    (card: Card, rating: Rating) => {
      reviewCard(card, rating, userId, retentionFromSetting(retentionSetting))
        .then((update) => {
          workspace?.updateCardOptimistically?.(card.id, update);
          analyticsService.track('float_reviewed', { cardId: card.id, rating });
        })
        .catch(() => { /* the card keeps its old schedule and stays due */ });
    },
    [userId, retentionSetting, workspace],
  );

  const deckTitles = useMemo(
    () => Object.fromEntries((workspace?.decks ?? []).map((d) => [d.id, d.title])),
    [workspace?.decks],
  );

  if (!isStudyFloatSupported() || !workspace) return null;

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Review due cards in a floating window that stays on top of other apps"
        aria-pressed={pipWindow !== null}
        className={`hidden items-center gap-1.5 rounded-xl border border-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-violet-400/30 hover:bg-white/5 hover:text-white md:inline-flex ${className}`}
      >
        <Layers className="h-3.5 w-3.5" aria-hidden />
        {pipWindow ? 'Floating' : 'Float'}
      </button>
      {pipWindow &&
        createPortal(
          <FloatReviewer
            cards={workspace.cards}
            deckTitles={deckTitles}
            initialQueue={initialQueue}
            retention={retentionFromSetting(retentionSetting)}
            onGrade={onGrade}
            onClose={close}
            keyTarget={pipWindow}
          />,
          pipWindow.document.body,
        )}
    </>
  );
}
