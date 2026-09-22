import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IOSVisualPreview from '../components/ios/IOSVisualPreview';

// The iPhone screens rendered with the preview's sample data: five decks,
// 29 cards due (9 + 14 + 4 + 0 + 2), 16 reviewed today.

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/__preview/ios/*" element={<IOSVisualPreview />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('iOS screens', () => {
  it('Today shows the day’s rings, the study button and decks with due cards', () => {
    renderAt('/__preview/ios');
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Study 29 due cards/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Reviews \d+%, Daily goal \d+%, Streak \d+%/ })).toBeTruthy();
    // US History has nothing due, so it is not in Up Next.
    expect(screen.queryByText('US History 1865–1945')).toBeNull();
    expect(screen.getByText('Spanish Conversation')).toBeTruthy();
  });

  it('Library filters with the segmented control and search field', () => {
    renderAt('/__preview/ios/decks');
    expect(screen.getByText('5 decks')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Due' }));
    expect(screen.getByText('4 decks')).toBeTruthy();
    expect(screen.queryByText('US History 1865–1945')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search decks' }), { target: { value: 'span' } });
    expect(screen.getByText('1 deck')).toBeTruthy();
    expect(screen.getByText('Spanish Conversation')).toBeTruthy();
  });

  it('Library opens an action sheet for a deck, with a destructive delete', () => {
    renderAt('/__preview/ios/decks');
    fireEvent.click(screen.getByText('Neuroscience Foundations'));
    const sheet = screen.getByRole('dialog', { name: 'Neuroscience Foundations' });
    expect(within(sheet).getByRole('button', { name: 'Study 9 due cards' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Delete Deck' })).toBeTruthy();
  });

  it('Settings uses switches and marks the current tab', () => {
    renderAt('/__preview/ios/settings');
    const sound = screen.getByRole('switch', { name: 'Sound effects' });
    expect(sound.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sound);
    expect(sound.getAttribute('aria-checked')).toBe('false');
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    expect(within(tabs).getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });
});
