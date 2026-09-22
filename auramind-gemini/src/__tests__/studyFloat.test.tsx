import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FloatReviewer, buildFloatQueue, isStudyFloatSupported } from '../components/float/StudyFloat';
import { Rating, type Card } from '../types';

const NOW = Date.now();
const card = (id: string, due: number, front = `Q ${id}`): Card =>
  ({ id, deckId: 'd1', front, back: `A ${id}`, nextReview: due, interval: 0, repetition: 0, easeFactor: 2.5 }) as Card;

describe('buildFloatQueue', () => {
  it('keeps due cards only, most overdue first', () => {
    const cards = [card('a', NOW - 1_000), card('b', NOW + 86_400_000), card('c', NOW - 9_000)];
    expect(buildFloatQueue(cards, NOW)).toEqual(['c', 'a']);
  });

  it('caps the queue', () => {
    const cards = Array.from({ length: 80 }, (_, i) => card(String(i), NOW - i));
    expect(buildFloatQueue(cards, NOW)).toHaveLength(50);
  });
});

describe('isStudyFloatSupported', () => {
  it('is false without Document Picture-in-Picture', () => {
    expect(isStudyFloatSupported()).toBe(false);
  });
});

describe('FloatReviewer', () => {
  const cards = [card('a', NOW - 1), card('b', NOW - 2)];
  const setup = (onGrade = vi.fn(), onClose = vi.fn()) => {
    render(
      <FloatReviewer
        cards={cards}
        deckTitles={{ d1: 'Neuro' }}
        initialQueue={['b', 'a']}
        retention={0.9}
        onGrade={onGrade}
        onClose={onClose}
        keyTarget={window}
      />,
    );
    return { onGrade, onClose };
  };

  it('flips with Space, grades with number keys and moves on', () => {
    const { onGrade } = setup();
    expect(screen.getByText('Q b')).toBeTruthy();
    expect(screen.queryByText('A b')).toBeNull();
    fireEvent.keyDown(window, { key: '3' }); // ignored until flipped
    expect(onGrade).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText('A b')).toBeTruthy();
    fireEvent.keyDown(window, { key: '3' });
    expect(onGrade).toHaveBeenCalledWith(cards[1], Rating.GOOD);
    expect(screen.getByText('Q a')).toBeTruthy();
    expect(screen.getByText('1 left')).toBeTruthy();
  });

  it('labels grade buttons with when the card returns', () => {
    setup();
    fireEvent.click(screen.getByText('Q b'));
    expect(screen.getByRole('button', { name: /Good\s*\d+d/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Again\s*1d/ })).toBeTruthy();
  });

  it('says all caught up when the queue is empty, and Esc closes', () => {
    const { onClose } = setup();
    for (let i = 0; i < 2; i++) {
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: '4' });
    }
    expect(screen.getByText('All caught up')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
