/**
 * The Windows app's Library: search, three sorts, click to study, and a
 * right-click menu (Study / Open / Delete, with Delete asking first).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';

vi.mock('../services/database/modules/sessionService', () => ({
  sessionService: { fetchStudySessions: vi.fn(async () => []) },
}));

import { libraryRows } from '../components/windows/libraryModel';
import { WindowsLibrary } from '../components/windows/WindowsLibrary';
import { NOW, cardsFor, deck, renderWithWorkspace } from './helpers/windowsWorkspace';

const DAY = 86_400_000;
const bio = deck('d-bio', 'Biology 101');
const spa = deck('d-spa', 'Spanish A2');
const fresh = deck('d-new', 'New deck', 5);
const decks = [fresh, spa, bio];
const cards = [
  ...cardsFor('d-bio', 6, 4, NOW - 3 * DAY),
  ...cardsFor('d-spa', 2, 8, NOW - 1 * DAY),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const titles = (rows: ReturnType<typeof libraryRows>) => rows.map((r) => r.deck.title);
const where = () => screen.getByTestId('where').textContent;
const row = (name: RegExp) => screen.getByRole('button', { name });

describe('libraryRows', () => {
  it('filters by title, case-insensitive', () => {
    expect(titles(libraryRows(decks, cards, NOW, 'BIO', 'due'))).toEqual(['Biology 101']);
  });

  it('sorts by due first by default, then title', () => {
    expect(titles(libraryRows(decks, cards, NOW, '', 'due'))).toEqual(['Biology 101', 'Spanish A2', 'New deck']);
  });

  it('sorts recently studied first, never-studied last', () => {
    expect(titles(libraryRows(decks, cards, NOW, '', 'recent'))).toEqual(['Spanish A2', 'Biology 101', 'New deck']);
  });

  it('sorts A–Z', () => {
    expect(titles(libraryRows(decks, cards, NOW, '', 'az'))).toEqual(['Biology 101', 'New deck', 'Spanish A2']);
  });

  it('counts cards, falling back to the deck total', () => {
    const rows = libraryRows(decks, cards, NOW, '', 'az');
    expect(rows.map((r) => [r.cards, r.due])).toEqual([[10, 6], [5, 0], [10, 2]]);
    expect(rows[0].lastStudied).toBe(NOW - 3 * DAY);
    expect(rows[1].lastStudied).toBeUndefined();
  });
});

describe('WindowsLibrary', () => {
  const mount = (deleteDeck = vi.fn(async () => undefined)) => {
    renderWithWorkspace(<WindowsLibrary />, { path: '/dashboard/decks', fixture: { decks, cards, deleteDeck } });
    return deleteDeck;
  };

  it('searches as you type', () => {
    mount();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), { target: { value: 'span' } });
    expect(screen.queryByRole('button', { name: /Biology 101/ })).toBeNull();
    expect(row(/Spanish A2/)).toBeVisible();
  });

  it('studies a course on click', () => {
    mount();
    fireEvent.click(row(/Biology 101/));
    expect(where()).toBe('/dashboard/study/d-bio');
  });

  it('opens the course page from the right-click menu', () => {
    mount();
    fireEvent.contextMenu(row(/Biology 101/));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Open' }));
    expect(where()).toBe('/deck/d-bio');
  });

  it('studies from the right-click menu', () => {
    mount();
    fireEvent.contextMenu(row(/Spanish A2/));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Study' }));
    expect(where()).toBe('/dashboard/study/d-spa');
  });

  it('closes the menu with Esc', () => {
    mount();
    fireEvent.contextMenu(row(/Spanish A2/));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('asks before deleting', () => {
    const deleteDeck = mount();
    fireEvent.contextMenu(row(/Biology 101/));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(deleteDeck).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete "Biology 101"?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deleteDeck).not.toHaveBeenCalled();

    fireEvent.contextMenu(row(/Biology 101/));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete course' }));
    expect(deleteDeck).toHaveBeenCalledWith('d-bio');
  });

  it('keeps the dialog open and says so when a delete fails', async () => {
    mount(vi.fn(async () => { throw new Error('offline'); }));
    fireEvent.contextMenu(row(/Biology 101/));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete course' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent("Couldn't delete");
  });

  it('closes the delete dialog with Esc and on the backdrop, and puts focus back on the course', () => {
    mount();
    const bio = row(/Biology 101/);
    bio.focus();
    fireEvent.contextMenu(bio);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(bio);

    fireEvent.contextMenu(bio);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.mouseDown(document.querySelector('.win-scrim')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Tab inside the delete dialog', () => {
    mount();
    fireEvent.contextMenu(row(/Biology 101/));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    const [cancel, del] = within(dialog).getAllByRole('button');
    del.focus();
    fireEvent.keyDown(del, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(del);
  });

  it('goes to Create from New course', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'New course' }));
    expect(where()).toBe('/dashboard/generator');
  });

  it('changes the sort', () => {
    mount();
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'az' } });
    const names = screen.getAllByRole('button', { name: /Biology 101|New deck|Spanish A2/ }).map((b) => b.textContent);
    expect(names[0]).toMatch(/^Biology 101/);
    expect(names[1]).toMatch(/^New deck/);
  });
});
