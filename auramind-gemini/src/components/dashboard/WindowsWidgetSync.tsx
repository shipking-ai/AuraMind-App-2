import { useEffect, useMemo } from 'react';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { publishWindowsWidgetState } from '../../lib/windowsWidget';

/**
 * Keeps the Windows 11 widget board in step with the dashboard.
 *
 * Mounted once in the shell. Like the Android widget, it publishes the count
 * rather than letting another surface compute due-ness — that is FSRS, and it
 * lives in TypeScript. Renders nothing, and is inert where no board exists.
 */
export function WindowsWidgetSync() {
  const workspace = useDashboardWorkspace();
  const cards = workspace?.cards;
  const decks = workspace?.decks;
  const streak = workspace?.user?.streak ?? 0;

  const { due, deck } = useMemo(() => {
    const now = Date.now();
    const dueCards = (cards ?? []).filter((c) => (c.nextReview ?? 0) <= now);
    const first = dueCards.sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];
    const title = first ? decks?.find((d) => d.id === first.deckId)?.title ?? '' : '';
    return { due: dueCards.length, deck: title };
  }, [cards, decks]);

  useEffect(() => {
    void publishWindowsWidgetState({ due, deck, streak });
  }, [due, deck, streak]);

  return null;
}

export default WindowsWidgetSync;
