import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => vi.fn());
const setTitle = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: (...a: unknown[]) => listen(...a) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTitle }) }));

import { desktop } from '../desktop/bridge';

type W = Window & { __TAURI_INTERNALS__?: unknown };

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  listen.mockReset();
  setTitle.mockReset();
});
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

describe('desktop bridge', () => {
  it('does nothing in a browser tab', async () => {
    await desktop.appReady();
    await desktop.setDueState({ due: 1, fadingCount: 0, topDecks: [], streak: 0, studying: false });
    expect(invoke).not.toHaveBeenCalled();
    await expect(desktop.getAutostart()).resolves.toBe(false);
    await expect(desktop.setShortcut('Ctrl+Alt+Q')).resolves.toEqual({ ok: false, reason: 'invalid' });
    const off = await desktop.on('deep-link', () => {});
    expect(listen).not.toHaveBeenCalled();
    off();
  });

  it('sends each command with the argument names Rust expects', async () => {
    (window as W).__TAURI_INTERNALS__ = {};
    const due = { due: 12, fadingCount: 3, topDecks: ['Spanish A1'], streak: 5, studying: false };
    await desktop.setDueState(due);
    await desktop.scheduleNudges([{ atMs: 1, title: 't', body: 'b' }]);
    await desktop.showMain('/dashboard/generator');
    await desktop.setAutostart(true);
    expect(invoke).toHaveBeenCalledWith('set_due_state', { due });
    expect(invoke).toHaveBeenCalledWith('schedule_nudges', { nudges: [{ atMs: 1, title: 't', body: 'b' }] });
    expect(invoke).toHaveBeenCalledWith('show_main', { path: '/dashboard/generator' });
    expect(invoke).toHaveBeenCalledWith('set_autostart', { enabled: true });
  });

  it('delivers event payloads to the handler', async () => {
    (window as W).__TAURI_INTERNALS__ = {};
    const unlisten = vi.fn();
    listen.mockImplementation(async (_name: string, cb: (e: { payload: unknown }) => void) => {
      cb({ payload: { url: 'auramind://app/study' } });
      return unlisten;
    });
    const handler = vi.fn();
    const off = await desktop.on('deep-link', handler);
    expect(listen).toHaveBeenCalledWith('deep-link', expect.any(Function));
    expect(handler).toHaveBeenCalledWith({ url: 'auramind://app/study' });
    off();
    expect(unlisten).toHaveBeenCalled();
  });

  it('a failing command never throws into the UI', async () => {
    (window as W).__TAURI_INTERNALS__ = {};
    invoke.mockRejectedValueOnce(new Error('not allowed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(desktop.appReady()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
