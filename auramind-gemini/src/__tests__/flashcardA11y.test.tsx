// @vitest-environment jsdom
//
// The landing hero's flashcard was a click-only div. It carried
// `role="button"` and an `onClick`, but no `tabIndex` and no `onKeyDown`, so
// it was unreachable by keyboard and could not be activated without a mouse.
// On top of that, `aria-label="Flashcard"` overrode the card's contents, so a
// screen reader announced the literal word "Flashcard" and never the question
// or the answer - strictly worse than no label at all on a study tool.
//
// These cover: keyboard reachability, Enter/Space activation, Space not
// scrolling the page, the content being readable again, the flip being
// announced, and no control semantics when the card is not flippable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Flashcard } from '../components/auramind/flashcard';
import type { FlashcardData } from '../lib/auramind/types';

const CARD: FlashcardData = {
  id: 'c1',
  deckName: 'Neuroscience Foundations',
  category: 'Biology',
  cardNumber: 4,
  totalCards: 24,
  front: 'What powers ATP synthase?',
  back: 'A proton gradient across the inner membrane.',
  explanation: 'The ETC pumps protons, and ATP synthase harvests them.',
  mnemonic: 'ETC charges the battery.',
};

describe('Flashcard keyboard accessibility', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation(
      (q: string) =>
        ({
          matches: false,
          media: q,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is reachable by keyboard', () => {
    render(<Flashcard card={CARD} />);
    const card = screen.getByRole('button');
    // A div is not focusable by default; tabindex is what puts it in the tab order.
    expect(card.tagName).toBe('DIV');
    expect(card.getAttribute('tabindex')).toBe('0');
    card.focus();
    expect(document.activeElement).toBe(card);
  });

  it('exposes the question to assistive tech instead of a bare "Flashcard"', () => {
    render(<Flashcard card={CARD} />);
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-label')).toBeNull();
    expect(card.textContent).toContain('What powers ATP synthase?');
  });

  it('flips on Enter', () => {
    const onFlip = vi.fn();
    render(<Flashcard card={CARD} flipped={false} onFlip={onFlip} />);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('flips on Space and suppresses the page scroll', () => {
    const onFlip = vi.fn();
    render(<Flashcard card={CARD} flipped={false} onFlip={onFlip} />);
    const card = screen.getByRole('button');

    // fireEvent returns false when the handler called preventDefault, and
    // Space's default is a page scroll that would fight the flip.
    const notCancelled = fireEvent.keyDown(card, { key: ' ' });

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('ignores keys that are not activation keys', () => {
    const onFlip = vi.fn();
    render(<Flashcard card={CARD} flipped={false} onFlip={onFlip} />);
    const card = screen.getByRole('button');

    fireEvent.keyDown(card, { key: 'a' });
    fireEvent.keyDown(card, { key: 'ArrowDown' });
    fireEvent.keyDown(card, { key: 'Tab' });

    expect(onFlip).not.toHaveBeenCalled();
  });

  it('announces the flip through a polite live region', () => {
    const { container } = render(<Flashcard card={CARD} />);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it('still flips on click, so the fix did not regress the pointer path', () => {
    const onFlip = vi.fn();
    render(<Flashcard card={CARD} flipped={false} onFlip={onFlip} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('keeps the answer on screen when driven to flipped', () => {
    render(<Flashcard card={CARD} flipped onFlip={() => {}} />);
    expect(screen.getByText('Answer')).toBeTruthy();
    expect(screen.getByText('A proton gradient across the inner membrane.')).toBeTruthy();
  });

  it('carries no control semantics when it is not flippable', () => {
    const { container } = render(<Flashcard card={CARD} flippable={false} />);
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull();
  });
});
