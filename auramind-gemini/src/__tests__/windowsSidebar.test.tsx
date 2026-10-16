/**
 * The Windows app's sidebar: the core places in order, Classes only for
 * class members, the current place marked, and a collapse toggle (☰ or
 * Ctrl+B) that is remembered — except a narrow window, which collapses it
 * without touching the saved choice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';

const fetchMyClassrooms = vi.hoisted(() => vi.fn());
vi.mock('../services/classroom/classroomService', () => ({
  classroomService: { fetchMyClassrooms: (...a: unknown[]) => fetchMyClassrooms(...a) },
}));

import { WindowsSidebar } from '../components/windows/WindowsSidebar';
import { renderWithWorkspace } from './helpers/windowsWorkspace';

type W = Window & { __TAURI_INTERNALS__?: unknown };
let narrow = false;
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  (window as W).__TAURI_INTERNALS__ = {};
  narrow = false;
  fetchMyClassrooms.mockReset().mockResolvedValue([]);
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width') ? narrow : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  delete (window as W).__TAURI_INTERNALS__;
  window.matchMedia = realMatchMedia;
  localStorage.clear();
});

const nav = () => screen.getByRole('navigation', { name: 'BonaMind' });
const navLabels = () => within(nav()).getAllByRole('link').map((a) => a.getAttribute('aria-label'));

describe('WindowsSidebar', () => {
  it('lists the places in order', async () => {
    renderWithWorkspace(<WindowsSidebar />);
    await waitFor(() => expect(fetchMyClassrooms).toHaveBeenCalledWith('u-1'));
    expect(navLabels()).toEqual(['Today', 'Library', 'New course', 'Linnea', 'Settings']);
  });

  it('shows Classes only for class members', async () => {
    fetchMyClassrooms.mockResolvedValue([{ role: 'student', classroom: { id: 'k1' } }]);
    renderWithWorkspace(<WindowsSidebar />);
    await waitFor(() =>
      expect(navLabels()).toEqual(['Today', 'Library', 'New course', 'Linnea', 'Classes', 'Settings']),
    );
  });

  it('hides Classes when the lookup fails', async () => {
    fetchMyClassrooms.mockRejectedValue(new Error('offline'));
    renderWithWorkspace(<WindowsSidebar />);
    await waitFor(() => expect(fetchMyClassrooms).toHaveBeenCalled());
    expect(navLabels()).not.toContain('Classes');
  });

  it('marks the current place', () => {
    renderWithWorkspace(<WindowsSidebar />, { path: '/dashboard/decks' });
    expect(within(nav()).getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav()).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current');
  });

  it('collapses and expands with ☰ and Ctrl+B and remembers it', () => {
    renderWithWorkspace(<WindowsSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(nav()).toHaveClass('is-collapsed');
    expect(localStorage.getItem('bonamind_win_sidebar')).toBe('"collapsed"');
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(nav()).not.toHaveClass('is-collapsed');
    expect(localStorage.getItem('bonamind_win_sidebar')).toBe('"expanded"');
  });

  it('ignores Ctrl+B while typing', () => {
    renderWithWorkspace(<><input aria-label="search" /><WindowsSidebar /></>);
    const input = screen.getByLabelText('search');
    input.focus();
    fireEvent.keyDown(input, { key: 'b', ctrlKey: true });
    expect(nav()).not.toHaveClass('is-collapsed');
  });

  it('collapses on a narrow window without changing the preference', () => {
    narrow = true;
    renderWithWorkspace(<WindowsSidebar />);
    expect(nav()).toHaveClass('is-collapsed');
    expect(localStorage.getItem('bonamind_win_sidebar')).toBeNull();
  });
});
