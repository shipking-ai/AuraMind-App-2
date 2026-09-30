import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const bridge = vi.hoisted(() => ({
  setDueState: vi.fn(async () => {}),
  scheduleNudges: vi.fn(async () => {}),
  setShortcut: vi.fn(async () => ({ ok: true })),
  handlers: new Map<string, (p: unknown) => void>(),
}));
vi.mock('../desktop/bridge', () => ({
  desktop: {
    setDueState: bridge.setDueState,
    scheduleNudges: bridge.scheduleNudges,
    setShortcut: bridge.setShortcut,
    on: async (event: string, handler: (p: unknown) => void) => { bridge.handlers.set(event, handler); return () => bridge.handlers.delete(event); },
  },
}));
const refresh = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../lib/workspaceRefresh', () => ({ refreshWorkspace: () => refresh() }));
vi.mock('../hooks/useStudyStats', () => ({ useStudyStats: () => ({ streak: 4 }) }));
const offer = vi.hoisted(() => vi.fn());
vi.mock('../lib/pendingGeneratorFile', () => ({ offerGeneratorFile: (f: File) => offer(f) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));
vi.mock('../services/database/supabase', () => ({ supabase: { auth: { exchangeCodeForSession: vi.fn(async () => ({ error: null })) } } }));

import { useDesktopIntegration } from '../desktop/useDesktopIntegration';
import type { Card, Deck } from '../types';

function Harness({ cards }: { cards: Card[] }) {
  useDesktopIntegration({ cards, decks: [{ id: 'd', title: 'Spanish A1' } as Deck], userId: 'u1', enabled: true });
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const tree = (cards: Card[]) => (
  <MemoryRouter initialEntries={['/dashboard']}><Routes><Route path="*" element={<Harness cards={cards} />} /></Routes></MemoryRouter>
);
const due = (id: string) => ({ id, deckId: 'd', front: id, back: id, nextReview: 0 }) as Card;

beforeEach(() => {
  bridge.setDueState.mockClear(); bridge.scheduleNudges.mockClear(); bridge.handlers.clear();
  refresh.mockClear(); offer.mockClear(); toastError.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('useDesktopIntegration', () => {
  it('publishes the due state once per change, not per render', async () => {
    const { rerender } = render(tree([due('a'), due('b')]));
    await act(async () => {});
    expect(bridge.setDueState).toHaveBeenCalledTimes(1);
    expect(bridge.setDueState).toHaveBeenLastCalledWith(expect.objectContaining({ due: 2, streak: 4, topDecks: ['Spanish A1'] }));
    rerender(tree([due('a'), due('b')]));
    await act(async () => {});
    expect(bridge.setDueState).toHaveBeenCalledTimes(1);
  });

  it('clears to zero when the last card is done', async () => {
    const { rerender } = render(tree([due('a')]));
    await act(async () => {});
    rerender(tree([]));
    await act(async () => {});
    expect(bridge.setDueState).toHaveBeenLastCalledWith(expect.objectContaining({ due: 0 }));
    expect(bridge.scheduleNudges).toHaveBeenLastCalledWith([]);
  });

  it('a file from Explorer lands in the generator; a rejected one explains itself', async () => {
    render(tree([]));
    await act(async () => {});
    await act(async () => { bridge.handlers.get('create-from-file')!({ kind: 'file', name: 'a.pdf', mime: 'application/pdf', base64: 'aGk=' }); });
    expect(offer).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.pdf' }));
    await act(async () => { bridge.handlers.get('create-from-file')!({ kind: 'error', name: 'big.pdf', reason: 'too-large' }); });
    expect(toastError).toHaveBeenCalledWith('big.pdf is over the 50 MB limit.');
  });

  it('Quick Review ratings refresh the workspace; routes and links navigate', async () => {
    const { getByTestId } = render(tree([]));
    await act(async () => {});
    await act(async () => { bridge.handlers.get('cards-changed')!({}); });
    expect(refresh).toHaveBeenCalled();
    await act(async () => { bridge.handlers.get('open-route')!({ path: '/dashboard/decks' }); });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/decks');
    await act(async () => { bridge.handlers.get('deep-link')!({ url: 'auramind://app/study' }); });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/study');
  });
});
