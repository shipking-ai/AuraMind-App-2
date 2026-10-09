import type { Card, Deck, StudySession } from '@bonamind/core';
import { getData } from './app';
import { useCachedQuery } from './cachedQuery';

const off = async () => [] as never[];

export function useDecks(userId: string | null) {
  return useCachedQuery<Deck[]>(['decks', userId ?? ''], userId ? () => getData().listDecks(userId) : off, !!userId);
}

export function useCards(userId: string | null) {
  return useCachedQuery<Card[]>(['cards', userId ?? ''], userId ? () => getData().listCards(userId) : off, !!userId);
}

export function useSessions(userId: string | null) {
  return useCachedQuery<StudySession[]>(['sessions', userId ?? ''], userId ? () => getData().listStudySessions(userId) : off, !!userId);
}

export function useDisplayName(userId: string | null) {
  return useCachedQuery<string | null>(['name', userId ?? ''], userId ? () => getData().getDisplayName(userId) : async () => null, !!userId);
}
