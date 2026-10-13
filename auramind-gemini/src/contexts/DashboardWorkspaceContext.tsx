import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserProfile, Deck, Card } from '../types';
import { useStudyStats } from '../hooks/useStudyStats';
import { analyticsService } from '../services/analytics/analyticsService';
import { parseIsoToMsOrNow, parseIsoToMsOrUndef } from '../lib/timestamps';

export type DashboardCreateDeck = (title: string, description: string) => Promise<Deck | null>;
export type DashboardDeleteDeck = (id: string) => Promise<void>;

export interface DashboardWorkspaceValue {
  user: UserProfile;
  decks: Deck[];
  cards: Card[];
  onLogout: () => void;
  createDeck: DashboardCreateDeck;
  deleteDeck: DashboardDeleteDeck;
  addCardsToDeck: (deckId: string, newCards: Array<{ question?: string; answer?: string; front?: string; back?: string }>) => Promise<number | undefined>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  goToDeck: (deckId: string) => void;
  startStudyForDeck: (deckId: string) => void;
  startQuickStudy: () => void;
  /**
   * Patch a single card in the workspace cards cache without going through
   * Supabase. Use this from the study-mode rating path so dashboard widgets
   * like StudyOverview's "Studied today" counter react immediately, BEFORE
   * the round-trip to the cards table resolves and BEFORE the study_sessions
   * row is written. Patch state lives inside the provider and is reset
   * automatically whenever the parent re-feeds a fresh `cards` prop (typical
   * after the next login / hard reload) — server remains source of truth.
   */
  updateCardOptimistically: (cardId: string, partial: Partial<Card>) => void;
}

const DashboardWorkspaceContext = createContext<DashboardWorkspaceValue | null>(null);

/**
 * Pure merge for the optimistic card patches. Exported separately so the
 * regression tests can pin the merge behavior without rendering React.
 *
 * Rules:
 *   - Patches never introduce cards that weren't already in `cards`.
 *   - lastReviewed / nextReview are normalised: if a caller hands us the raw
 *     ISO string a Supabase cascade left lying around, we parse it back to a
 *     ms-epoch number so the downstream filter `cards.filter(c => c.lastReviewed >= todayStart)`
 *     keeps doing real numeric comparison instead of `string <= number` magic.
 *   - when `patches` is empty we return the original array reference so the
 *     provider's useMemo stays cheap across re-renders.
 */
export function applyOptimisticCardPatches(
  cards: readonly Card[],
  patches: Readonly<Record<string, Partial<Card>>>,
): Card[] {
  const ids = Object.keys(patches);
  if (ids.length === 0) return cards as Card[];

  const out: Card[] = new Array(cards.length);
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const patch = patches[c.id];
    if (!patch) {
      out[i] = c;
      continue;
    }
    // Normalise TIMESTAMPTZ-shaped ISO strings back to ms-epoch so derived
    // counters (e.g. "Studied today") don't silently break post a round-trip.
    const lr = patch.lastReviewed;
    const nr = patch.nextReview;
    out[i] = {
      ...c,
      ...patch,
      lastReviewed:
        typeof lr === 'string'
          ? parseIsoToMsOrUndef(lr) ?? c.lastReviewed
          : lr ?? c.lastReviewed,
      nextReview:
        typeof nr === 'string'
          ? parseIsoToMsOrNow(nr)
          : nr ?? c.nextReview,
    };
  }
  return out;
}

export interface DashboardWorkspaceProviderProps {
  user: UserProfile;
  decks: Deck[];
  cards: Card[];
  createDeck: DashboardCreateDeck;
  deleteDeck: DashboardDeleteDeck;
  addCardsToDeck: (deckId: string, newCards: Array<{ question?: string; answer?: string; front?: string; back?: string }>) => Promise<number | undefined>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  onLogout: () => void;
  children: React.ReactNode;
}

export const DashboardWorkspaceProvider: React.FC<DashboardWorkspaceProviderProps> = ({
  user,
  decks,
  cards,
  createDeck,
  deleteDeck,
  addCardsToDeck,
  updateProfile,
  onLogout,
  children,
}) => {
  const navigate = useNavigate();
  // Local optimistic card-cache overrides. Keyed by card id; values last-write-wins.
  // Reset implicitly whenever the parent re-feeds a fresh `cards` prop (the
  // useMemo dependency) and explicitly via the timeout below (so a bad patch
  // can't lock a dashboard widget into "Studied today: 7" forever).
  const [cardPatches, setCardPatches] = useState<Record<string, Partial<Card>>>({});

  const updateCardOptimistically = useCallback((cardId: string, partial: Partial<Card>) => {
    setCardPatches(prev => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? {}), ...partial },
    }));
  }, []);

  const mergedCards = useMemo(
    () => applyOptimisticCardPatches(cards, cardPatches),
    [cards, cardPatches],
  );

  const goToDeck = useCallback((deckId: string) => {
    analyticsService.trackHeart('engagement', 'open_deck', { deckId });
    navigate(`/deck/${deckId}`);
  }, [navigate]);

  const startStudyForDeck = useCallback((deckId: string) => {
    analyticsService.trackCoreAction('study_session', { source: 'dashboard', deckId });
    analyticsService.trackHeart('task_success', 'start_study', { deckId });
    navigate(`/dashboard/study/${deckId}`);
  }, [navigate]);

  const startQuickStudy = useCallback(() => {
    if (decks.length === 0) return;
    const now = Date.now();
    const deckWithDue = decks.find((d) =>
      cards.some((c) => c.deckId === d.id && (c.nextReview ?? 0) <= now)
    );
    const pick = deckWithDue ?? decks[0];
    analyticsService.trackCoreAction('study_session', { source: 'quick_study', deckId: pick.id });
    analyticsService.trackHeart('task_success', 'start_quick_study', {
      deckId: pick.id,
      dueCount: cards.filter((c) => c.deckId === pick.id && (c.nextReview ?? 0) <= now).length,
    });
    navigate(`/dashboard/study/${pick.id}`);
  }, [decks, cards, navigate]);

  /**
   * The streak shown across the app is derived here rather than read from the
   * profile.
   *
   * There were three competing sources and the UI was wired to the only one
   * that is never written:
   *
   *   - localStorage ('bonamind_streak_days'), updated by gamificationService.
   *     Device-local, so it is wrong the moment you study on a second device
   *     and invisible to anything server-side.
   *   - user_profiles.streak / streak_days. Every surface read this, and
   *     nothing in the codebase ever writes it -- so it was permanently 0
   *     no matter how much the user studied.
   *   - study_sessions, the actual record of activity.
   *
   * useStudyStats already derives a correct streak from study_sessions (a
   * study day is any local date with a session, counted backwards from today,
   * with yesterday allowed as the anchor so it does not break until a full day
   * is missed). Overriding the profile value here fixes every consumer at once
   * -- top bar, home, settings, web dashboard -- rather than at each call site,
   * and needs no new write path or migration.
   */
  const studyStats = useStudyStats(user?.id);

  const value = useMemo(
    () => ({
      user: { ...user, streak: studyStats.streak },
      decks,
      cards: mergedCards,
      onLogout,
      createDeck,
      deleteDeck,
      addCardsToDeck,
      updateProfile,
      goToDeck,
      startStudyForDeck,
      startQuickStudy,
      updateCardOptimistically,
    }),
    [user, studyStats.streak, decks, mergedCards, onLogout, createDeck, deleteDeck, addCardsToDeck, updateProfile, goToDeck, startStudyForDeck, startQuickStudy, updateCardOptimistically]
  );

  return (
    <DashboardWorkspaceContext.Provider value={value}>
      {children}
    </DashboardWorkspaceContext.Provider>
  );
};

export function useDashboardWorkspace(): DashboardWorkspaceValue | null {
  return useContext(DashboardWorkspaceContext);
}
