/**
 * The Windows app gets its own shell (sidebar + content) on every dashboard
 * route, study sessions included, but never on the admin pages; browsers and
 * the phone apps never get it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('../services/classroom/classroomService', () => ({
  classroomService: { fetchMyClassrooms: vi.fn(async () => []) },
}));

import { shouldUseWindowsShell } from '../components/windows/windowsShellRoute';
import { WindowsShell } from '../components/windows/WindowsShell';
import { renderWithWorkspace } from './helpers/windowsWorkspace';

type W = Window & { __TAURI_INTERNALS__?: unknown };
const setDesktop = (on: boolean) => {
  if (on) (window as W).__TAURI_INTERNALS__ = {};
  else delete (window as W).__TAURI_INTERNALS__;
};
afterEach(() => { setDesktop(false); localStorage.clear(); });

describe('shouldUseWindowsShell', () => {
  it('uses the Windows shell in the Windows app', () => {
    setDesktop(true);
    expect(shouldUseWindowsShell('/dashboard')).toBe(true);
    expect(shouldUseWindowsShell('/dashboard/decks')).toBe(true);
  });

  it('wraps a study session so the sidebar stays', () => {
    setDesktop(true);
    expect(shouldUseWindowsShell('/dashboard/study/deck-1')).toBe(true);
  });

  it('leaves admin pages on the website layout', () => {
    setDesktop(true);
    expect(shouldUseWindowsShell('/admin')).toBe(false);
    expect(shouldUseWindowsShell('/admin/users')).toBe(false);
  });

  it('keeps the website shell in a browser', () => {
    expect(shouldUseWindowsShell('/dashboard')).toBe(false);
  });
});

describe('WindowsShell', () => {
  it('renders the sidebar beside the page', () => {
    setDesktop(true);
    renderWithWorkspace(<WindowsShell><p>page body</p></WindowsShell>);
    expect(screen.getByRole('navigation', { name: 'BonaMind' })).toHaveClass('win-sidebar');
    expect(screen.getByRole('main')).toHaveTextContent('page body');
    expect(document.querySelector('.win-shell')).not.toBeNull();
  });
});
