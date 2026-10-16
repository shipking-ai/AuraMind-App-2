/**
 * The Windows app's Settings: account, Light/Dark/System, the existing
 * Windows settings, daily goal, links to the full settings page and (for
 * admins) the admin pages, and Sign out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';

const bridge = vi.hoisted(() => ({
  applyTheme: vi.fn(async () => undefined),
  setShortcut: vi.fn(async () => ({ ok: true })),
  getAutostart: vi.fn(async () => false),
  setAutostart: vi.fn(async (on: boolean) => on),
  notificationsEnabled: vi.fn(async () => true),
}));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));
vi.mock('../services/database/modules/sessionService', () => ({
  sessionService: { fetchStudySessions: vi.fn(async () => []) },
}));

import { ThemeProvider } from '../hooks/useTheme';
import { WindowsSettings } from '../components/windows/WindowsSettings';
import { renderWithWorkspace, testUser } from './helpers/windowsWorkspace';
import { UserRole, type UserProfile } from '../types';

type W = Window & { __TAURI_INTERNALS__?: unknown };
beforeEach(() => { (window as W).__TAURI_INTERNALS__ = {}; localStorage.clear(); });
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; localStorage.clear(); });

const mount = (user: UserProfile = testUser, onLogout = vi.fn()) => {
  renderWithWorkspace(<ThemeProvider><WindowsSettings /></ThemeProvider>, { path: '/dashboard/settings', fixture: { user, onLogout } });
  return onLogout;
};

describe('WindowsSettings', () => {
  it('shows the account', () => {
    mount();
    expect(screen.getByText('Matt Smith')).toBeVisible();
    expect(screen.getByText('matt@example.com')).toBeVisible();
  });

  it('switches between Light, Dark and System', () => {
    mount();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(localStorage.getItem('bonamind_theme')).toBe('"light"');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  });

  it('includes the Windows settings', () => {
    mount();
    expect(screen.getByText('Start with Windows')).toBeInTheDocument();
  });

  it('saves the daily goal', () => {
    mount();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily goal' }), { target: { value: '30' } });
    expect(localStorage.getItem('bonamind_dailyGoal')).toBe('"30"');
  });

  it('links to reminders and the full settings page', () => {
    mount();
    expect(screen.getByRole('link', { name: 'More settings' })).toHaveAttribute('href', '/dashboard/settings/all');
    expect(screen.getByRole('link', { name: 'Reminders' })).toHaveAttribute('href', '/dashboard/settings/all');
  });

  it('shows Admin only to admins', () => {
    mount();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('shows Admin to an admin', () => {
    mount({ ...testUser, role: UserRole.ADMIN } as UserProfile);
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('signs out', () => {
    const onLogout = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalled();
  });
});
