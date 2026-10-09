import type { Card, Deck, StudySession } from '@bonamind/core';
import { getData, getOutbox } from './app';
import { overlayPending } from './overlay';
import { useCachedQuery } from './cachedQuery';

const off = async () => [] as never[];

export function useDecks(userId: string | null) {
  return useCachedQuery<Deck[]>(['decks', userId ?? ''], userId ? () => getData().listDecks(userId) : off, !!userId);
}

export function useCards(userId: string | null) {
  const fetchCards = async (uid: string) => overlayPending(await getData().listCards(uid), await getOutbox().queued(uid));
  return useCachedQuery<Card[]>(['cards', userId ?? ''], userId ? () => fetchCards(userId) : off, !!userId);
}

export function useSessions(userId: string | null) {
  return useCachedQuery<StudySession[]>(['sessions', userId ?? ''], userId ? () => getData().listStudySessions(userId) : off, !!userId);
}

export function useFsrsProfile(userId: string | null) {
  return useCachedQuery<{ weights?: number[]; profileLabel: string | null }>(
    ['fsrs', userId ?? ''],
    userId ? () => getData().getFsrsProfile(userId) : async () => ({ profileLabel: null }),
    !!userId,
  );
}

export function useDisplayName(userId: string | null) {
  return useCachedQuery<string | null>(['name', userId ?? ''], userId ? () => getData().getDisplayName(userId) : async () => null, !!userId);
}
