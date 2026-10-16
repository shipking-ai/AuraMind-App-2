/**
 * The real StudyModePage in the Windows app: one keyboard handler only.
 * The website's study handler used to run as well, so Space flipped the card
 * twice (the answer never showed) and 1–4 saved each grade twice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const updateCard = vi.hoisted(() => vi.fn(async (id: string, u: object) => ({ id, ...u })));
vi.mock('../services/database/dbService', () => ({ dbService: { updateCard } }));
vi.mock('../hooks/useCurrentUserId', () => ({ useCurrentUserId: () => 'u-1' }));
vi.mock('../services/database/modules/sessionService', () => ({
  sessionService: { saveStudySession: vi.fn(async (s: object) => ({ id: 's1', ...s })), fetchStudySessions: vi.fn(async () => []) },
}));
vi.mock('../services/database/modules/cardReviewsService', () => ({
  cardReviewsService: { recordReview: vi.fn(async () => undefined) },
}));

import StudyModePage from '../pages/study/StudyModePage';
import { StudyPreviewContext } from '../pages/study/studyPreview';
import type { Card, Deck } from '../types';

type W = Window & { __TAURI_INTERNALS__?: unknown };
const deck = { id: 'd1', title: 'Biology 101', description: '', createdAt: 0, cardCount: 2 } as Deck;
const cards = [
  { id: 'c1', deckId: 'd1', front: 'What does the mitochondria produce?', back: 'ATP', nextReview: 0 },
  { id: 'c2', deckId: 'd1', front: 'What is DNA?', back: 'Genetic code', nextReview: 0 },
] as unknown as Card[];

beforeEach(() => { (window as W).__TAURI_INTERNALS__ = {}; updateCard.mockClear(); });
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; localStorage.clear(); });

function mount() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/study/d1']}>
      <StudyPreviewContext.Provider value={{ deck, cards }}>
        <Routes>
          <Route path="/dashboard/study/:deckId" element={<StudyModePage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </StudyPreviewContext.Provider>
    </MemoryRouter>,
  );
}

describe('StudyModePage in the Windows app', () => {
  it('uses the Windows session screen', async () => {
    mount();
    expect(await screen.findByText('What does the mitochondria produce?')).toBeVisible();
    expect(document.querySelector('.win-study')).not.toBeNull();
  });

  it('shows the answer with Space (one flip, not two)', async () => {
    mount();
    await screen.findByText('What does the mitochondria produce?');
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(await screen.findByText('ATP')).toBeVisible();
  });

  it('saves a grade once per key press', async () => {
    mount();
    await screen.findByText('What does the mitochondria produce?');
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('ATP');
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    await waitFor(() => expect(updateCard).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(updateCard).toHaveBeenCalledTimes(1);
  });
});
