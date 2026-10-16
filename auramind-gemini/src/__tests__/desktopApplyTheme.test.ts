/**
 * desktop.applyTheme: with "System" the window is left following Windows
 * (setTheme(null)) — forcing a theme there made WebView2 stop reporting the
 * Windows setting, so the app followed only the first switch. An explicit
 * Light/Dark pins it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const win = vi.hoisted(() => ({ setTheme: vi.fn(async () => undefined), setBackgroundColor: vi.fn(async () => undefined) }));
const invoke = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => win }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { desktop } from '../desktop/bridge';

type W = Window & { __TAURI_INTERNALS__?: unknown };
beforeEach(() => { (window as W).__TAURI_INTERNALS__ = {}; win.setTheme.mockClear(); win.setBackgroundColor.mockClear(); invoke.mockClear(); });
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

describe('desktop.applyTheme', () => {
  it('leaves the window following Windows for "System"', async () => {
    await desktop.applyTheme('light', true);
    expect(win.setTheme).toHaveBeenCalledWith(null);
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#f6f3ec');
    expect(invoke).toHaveBeenCalledWith('set_title_bar_theme', { dark: false });
  });

  it('pins the window for an explicit choice', async () => {
    await desktop.applyTheme('dark', false);
    expect(win.setTheme).toHaveBeenCalledWith('dark');
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#262420');
    expect(invoke).toHaveBeenCalledWith('set_title_bar_theme', { dark: true });
  });
});
