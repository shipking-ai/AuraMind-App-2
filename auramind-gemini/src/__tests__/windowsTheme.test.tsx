/**
 * The Windows app follows the Windows light/dark setting: theme defaults to
 * "system" and auto night mode (forced dark 20:00–07:00) defaults off there,
 * and every resolved-theme change is passed to the window (frame, title bar,
 * background). The website keeps its dark default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const bridge = vi.hoisted(() => ({ applyTheme: vi.fn() }));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));

import { themeDefaults } from '../lib/appPreferences';
import { ThemeProvider, useTheme } from '../hooks/useTheme';

type W = Window & { __TAURI_INTERNALS__?: unknown };

let systemDark = true;
let listeners: Array<(e: { matches: boolean }) => void> = [];
const realMatchMedia = window.matchMedia;

function Probe() {
  const { resolvedTheme } = useTheme();
  return <div data-testid="resolved">{resolvedTheme}</div>;
}

beforeEach(() => {
  systemDark = true;
  listeners = [];
  bridge.applyTheme.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') ? systemDark : false,
    media: query,
    onchange: null,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
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

describe('Windows theme', () => {
  it('defaults to following Windows with auto night mode off in the Windows app', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    expect(themeDefaults()).toEqual({ theme: 'system', autoNightMode: false });
  });

  it('keeps the dark default and auto night mode on the website', () => {
    expect(themeDefaults()).toEqual({ theme: 'dark', autoNightMode: true });
  });

  it('follows a light Windows setting in the Windows app', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    systemDark = false;
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(getByTestId('resolved').textContent).toBe('light');
  });

  it('keeps an explicit stored choice', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    systemDark = false;
    localStorage.setItem('bonamind_theme', JSON.stringify('dark'));
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(getByTestId('resolved').textContent).toBe('dark');
  });

  it('tells the window when the resolved theme changes, still following Windows', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(bridge.applyTheme).toHaveBeenLastCalledWith('dark', true);
    act(() => { systemDark = false; listeners.forEach((l) => l({ matches: false })); });
    expect(bridge.applyTheme).toHaveBeenLastCalledWith('light', true);
  });

  it('pins the window only for an explicit Light or Dark choice', () => {
    (window as W).__TAURI_INTERNALS__ = {};
    localStorage.setItem('bonamind_theme', JSON.stringify('light'));
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(bridge.applyTheme).toHaveBeenLastCalledWith('light', false);
  });

  it('does not touch the window on the website', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(bridge.applyTheme).not.toHaveBeenCalled();
  });
});
