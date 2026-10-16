/**
 * The Windows app's study session: keyboard first (Space shows the answer,
 * 1–4 grade, Esc ends — asking once a card is graded), each grade showing
 * its next interval, a summary at the end, and an empty state with a way
 * back. StudyModePage keeps the engine; studyDesign() picks the screens.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Rating, type Card } from '../types';
import {
  WindowsStudyComplete,
  WindowsStudyEmpty,
  WindowsStudySession,
  studyDesign,
} from '../components/windows/WindowsStudySession';

type W = Window & { __TAURI_INTERNALS__?: unknown };
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

const card = { id: 'c1', deckId: 'd1', front: 'What does the mitochondria produce?', back: 'ATP' } as unknown as Card;

function session(overrides: Partial<React.ComponentProps<typeof WindowsStudySession>> = {}) {
  const props = {
    deckTitle: 'Biology 101',
    card,
    index: 8,
    total: 24,
    flipped: false,
    onFlip: vi.fn(),
    onRate: vi.fn(),
    onExit: vi.fn(),
    intervals: { [Rating.AGAIN]: 0.007, [Rating.HARD]: 1, [Rating.GOOD]: 3, [Rating.EASY]: 8 },
    ...overrides,
  };
  const view = render(<WindowsStudySession {...props} />);
  return { ...props, rerender: (o: Partial<typeof props>) => view.rerender(<WindowsStudySession {...props} {...o} />) };
}
const key = (k: string, target: Window | Element = window) => fireEvent.keyDown(target, { key: k });

describe('studyDesign', () => {
  it('picks the Windows screens in the Windows app', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    expect(studyDesign({ platform: 'web', preview: false })).toBe('windows');
  });
  it('keeps iPhone and preview sessions on the iOS screens', () => {
    expect(studyDesign({ platform: 'ios', preview: false })).toBe('ios');
    expect(studyDesign({ platform: 'web', preview: true })).toBe('ios');
  });

  it('uses the Windows screens for a preview inside the Windows app', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    expect(studyDesign({ platform: 'web', preview: true })).toBe('windows');
  });
  it('leaves the website and Android alone', () => {
    expect(studyDesign({ platform: 'web', preview: false })).toBe('web');
    expect(studyDesign({ platform: 'android', preview: false })).toBe('web');
  });
});

describe('WindowsStudySession', () => {
  it('shows the course, progress and question', () => {
    session();
    expect(screen.getByText('Biology 101')).toBeVisible();
    expect(screen.getByText('9 of 24')).toBeVisible();
    expect(screen.getByText('What does the mitochondria produce?').closest('.win-index-card')).not.toBeNull();
    expect(screen.getByText('What does the mitochondria produce?')).toBeVisible();
    expect(screen.queryByText('ATP')).toBeNull();
  });

  it('shows the answer with Space and grades with 1–4', () => {
    const s = session();
    key(' ');
    expect(s.onFlip).toHaveBeenCalledTimes(1);
    s.rerender({ flipped: true });
    expect(screen.getByText('ATP')).toBeVisible();
    key('3');
    expect(s.onRate).toHaveBeenLastCalledWith(Rating.GOOD);
    key('1');
    expect(s.onRate).toHaveBeenLastCalledWith(Rating.AGAIN);
    key('2');
    expect(s.onRate).toHaveBeenLastCalledWith(Rating.HARD);
    key('4');
    expect(s.onRate).toHaveBeenLastCalledWith(Rating.EASY);
  });

  it('does not grade before the answer is shown', () => {
    const s = session();
    key('4');
    expect(s.onRate).not.toHaveBeenCalled();
  });

  it('shows each grade with its next interval, Good as the main button', () => {
    session({ flipped: true });
    expect(screen.getByRole('button', { name: /Good/ })).toHaveTextContent('3d');
    expect(screen.getByRole('button', { name: /Again/ })).toHaveTextContent('10m');
    expect(screen.getByRole('button', { name: /Good/ })).toHaveClass('win-button-primary');
  });

  it('grades by click too', () => {
    const s = session({ flipped: true });
    fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(s.onRate).toHaveBeenCalledWith(Rating.EASY);
  });

  it('ends at once with Esc before any card is graded', () => {
    const s = session({ index: 0 });
    key('Escape');
    expect(s.onExit).toHaveBeenCalledTimes(1);
  });

  it('asks before ending once a card is graded', () => {
    const s = session({ index: 4 });
    key('Escape');
    expect(s.onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep studying' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    key('Escape');
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(s.onExit).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the end-session dialog so a card can not be graded behind it', () => {
    session({ index: 4, flipped: true });
    key('Escape');
    const dialog = screen.getByRole('dialog');
    const [keep, end] = within(dialog).getAllByRole('button');
    end.focus();
    fireEvent.keyDown(end, { key: 'Tab' });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(end);
  });

  it('ignores keys while typing', () => {
    const s = session();
    const input = document.createElement('input');
    document.body.appendChild(input);
    key(' ', input);
    expect(s.onFlip).not.toHaveBeenCalled();
    input.remove();
  });
});

describe('WindowsStudyComplete and WindowsStudyEmpty', () => {
  it('sums up the session', () => {
    const onDone = vi.fn();
    const onRestart = vi.fn();
    render(<WindowsStudyComplete deckTitle="Biology 101" reviewed={24} correct={21} elapsedMs={492_000} onDone={onDone} onRestart={onRestart} />);
    expect(screen.getByText('24')).toBeVisible();
    expect(screen.getByText('88%')).toBeVisible();
    expect(screen.getByText('8 min 12 s')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Today' }));
    expect(onDone).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Study again' }));
    expect(onRestart).toHaveBeenCalled();
  });

  it('has a Windows empty state with a way back', () => {
    const onDone = vi.fn();
    render(<WindowsStudyEmpty onDone={onDone} />);
    expect(screen.getByText('Nothing to study here right now')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Today' }));
    expect(onDone).toHaveBeenCalled();
  });
});
