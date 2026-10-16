/**
 * Test helper: render a Windows screen inside a router and the real
 * DashboardWorkspaceProvider with fixture data. Study and deck actions
 * navigate for real; <Where /> exposes the current path.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { DashboardWorkspaceProvider } from '../../contexts/DashboardWorkspaceContext';
import type { Card, Deck, UserProfile } from '../../types';

export const NOW = new Date('2026-10-16T19:00:00').getTime();
const DAY = 86_400_000;

export const testUser = {
  id: 'u-1',
  name: 'Matt Smith',
  email: 'matt@example.com',
  plan: 'Pro',
  role: 'user',
  streak: 12,
  streakFreezes: 0,
  joinedDate: NOW,
  isEmailVerified: true,
  isPhoneVerified: false,
} as unknown as UserProfile;

export function deck(id: string, title: string, cardCount = 0): Deck {
  return { id, title, description: '', createdAt: NOW - 30 * DAY, cardCount } as Deck;
}

/** `due` cards due an hour ago, `later` cards due in two days. */
export function cardsFor(deckId: string, due: number, later = 0, lastReviewed?: number): Card[] {
  const make = (i: number, nextReview: number): Card =>
    ({ id: `${deckId}-c${i}`, deckId, front: `Q${i}`, back: `A${i}`, nextReview, lastReviewed } as unknown as Card);
  return [
    ...Array.from({ length: due }, (_, i) => make(i, NOW - 3_600_000)),
    ...Array.from({ length: later }, (_, i) => make(due + i, NOW + 2 * DAY)),
  ];
}

export interface WorkspaceFixture {
  user?: UserProfile;
  decks?: Deck[];
  cards?: Card[];
  deleteDeck?: (id: string) => Promise<void>;
  onLogout?: () => void;
}

export function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

export function renderWithWorkspace(
  ui: React.ReactElement,
  { path = '/dashboard', fixture = {} }: { path?: string; fixture?: WorkspaceFixture } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DashboardWorkspaceProvider
        user={fixture.user ?? testUser}
        decks={fixture.decks ?? []}
        cards={fixture.cards ?? []}
        createDeck={vi.fn(async () => null)}
        deleteDeck={fixture.deleteDeck ?? vi.fn(async () => undefined)}
        addCardsToDeck={vi.fn(async () => 0)}
        updateProfile={vi.fn(async () => undefined)}
        onLogout={fixture.onLogout ?? vi.fn()}
      >
        <Routes>
          <Route path="*" element={<>{ui}<Where /></>} />
        </Routes>
      </DashboardWorkspaceProvider>
    </MemoryRouter>,
  );
}
