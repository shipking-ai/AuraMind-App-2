import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { MarketplaceDeck } from '../services/decks/marketplaceService';

const listPublicDecks = vi.fn();
const forkPublicDeck = vi.fn();
vi.mock('../services/decks/marketplaceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/decks/marketplaceService')>();
  return {
    ...actual,
    listPublicDecks: (...args: unknown[]) => listPublicDecks(...args),
    forkPublicDeck: (...args: unknown[]) => forkPublicDeck(...args),
  };
});

const refreshWorkspace = vi.fn();
vi.mock('../lib/workspaceRefresh', () => ({
  refreshWorkspace: () => refreshWorkspace(),
}));

import { NovaCommunity } from '../components/dashboard/nova/NovaCommunity';

const DECK: MarketplaceDeck = {
  id: 'd1',
  title: 'Spanish A1',
  description: 'Survival phrases',
  category: 'Languages',
  tags: [],
  forkCount: 3,
  publishedAt: null,
  cardCount: 42,
  creatorFirstName: 'Ana',
  isMine: false,
};

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderCommunity() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/decks']}>
      <Routes>
        <Route path="/dashboard/decks" element={<NovaCommunity />} />
        <Route path="/deck/:id" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NovaCommunity', () => {
  beforeEach(() => {
    listPublicDecks.mockReset();
    forkPublicDeck.mockReset();
    refreshWorkspace.mockReset().mockResolvedValue(true);
  });

  it('lists published decks with card count, forks and a first-name byline', async () => {
    listPublicDecks.mockResolvedValue([DECK]);
    renderCommunity();

    expect(await screen.findByText('Spanish A1')).toBeInTheDocument();
    expect(screen.getByText('42 cards')).toBeInTheDocument();
    expect(screen.getByText('3 forks')).toBeInTheDocument();
    expect(screen.getByText('by Ana')).toBeInTheDocument();
  });

  it('adds a deck: forks on the server, reloads the workspace, then opens the copy', async () => {
    listPublicDecks.mockResolvedValue([DECK]);
    forkPublicDeck.mockResolvedValue('copy-1');
    renderCommunity();

    fireEvent.click(await screen.findByRole('button', { name: /add to my library/i }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/deck/copy-1'));
    expect(forkPublicDeck).toHaveBeenCalledWith('d1');
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);
  });

  it('shows an error and stays put when the fork fails', async () => {
    listPublicDecks.mockResolvedValue([DECK]);
    forkPublicDeck.mockRejectedValue(new Error('deck not found or not public'));
    renderCommunity();

    fireEvent.click(await screen.findByRole('button', { name: /add to my library/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(`Couldn't add "Spanish A1"`);
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('says so honestly when nothing is published yet', async () => {
    listPublicDecks.mockResolvedValue([]);
    renderCommunity();
    expect(await screen.findByText('No community decks yet')).toBeInTheDocument();
  });

  it('offers a retry when the listing fails, instead of showing fake decks', async () => {
    listPublicDecks.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([DECK]);
    renderCommunity();

    fireEvent.click(await screen.findByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Spanish A1')).toBeInTheDocument();
  });

  it('refetches with the chosen category and sort', async () => {
    listPublicDecks.mockResolvedValue([]);
    renderCommunity();
    await screen.findByText('No community decks yet');

    fireEvent.click(screen.getByRole('button', { name: 'Languages' }));
    await waitFor(() =>
      expect(listPublicDecks).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'Languages', sort: 'popular' })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'newest' }));
    await waitFor(() =>
      expect(listPublicDecks).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'Languages', sort: 'newest' })),
    );
  });

  it('labels your own published deck and still lets you copy it', async () => {
    listPublicDecks.mockResolvedValue([{ ...DECK, isMine: true }]);
    renderCommunity();
    expect(await screen.findByText('by you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /make a copy/i })).toBeEnabled();
  });
});
