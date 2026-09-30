/**
 * The Windows app's contract between React and the Rust shell
 * (src-tauri/src/commands.rs). Every call is a no-op in a browser tab or the
 * phone apps, and never throws into the UI: a missing native feature must
 * degrade to the plain app. Tauri packages load lazily so none of this
 * reaches the website's bundle.
 */
import { isDesktopApp } from '../lib/platform';

export interface DueState { due: number; fadingCount: number; topDecks: string[]; streak: number; studying: boolean }
export interface PlannedNudge { atMs: number; title: string; body: string }
export type FileHandoff =
  | { kind: 'file'; name: string; mime: string; base64: string }
  | { kind: 'error'; name: string; reason: 'unsupported' | 'too-large' | 'unreadable' };
export interface ShortcutResult { ok: boolean; reason?: 'taken' | 'invalid' | null }
export interface DesktopEvents {
  'deep-link': { url: string };
  'create-from-file': FileHandoff;
  'cards-changed': Record<string, never>;
  'open-route': { path: string };
}

async function call<T>(command: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  if (!isDesktopApp()) return fallback as T;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<T>(command, args)) ?? (fallback as T);
  } catch (err) {
    console.warn(`[desktop] ${command} failed`, err);
    return fallback as T;
  }
}

export const desktop = {
  appReady: () => call<void>('app_ready'),
  showMain: (path?: string) => call<void>('show_main', { path }),
  setDueState: (due: DueState) => call<void>('set_due_state', { due }),
  scheduleNudges: (nudges: PlannedNudge[]) => call<void>('schedule_nudges', { nudges }),
  quickReviewDone: () => call<void>('quick_review_done'),
  cardsChanged: () => call<void>('cards_changed'),
  setShortcut: (accelerator: string) =>
    call<ShortcutResult>('set_shortcut', { accelerator }, { ok: false, reason: 'invalid' }),
  getAutostart: () => call<boolean>('get_autostart', undefined, false),
  setAutostart: (enabled: boolean) => call<boolean>('set_autostart', { enabled }, false),
  /** null = can't tell (not the Windows app, or no installed shortcut yet). */
  notificationsEnabled: () => call<boolean | null>('notifications_enabled', undefined, null),
  async setTitle(title: string): Promise<void> {
    if (!isDesktopApp()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setTitle(title);
    } catch {
      /* title is cosmetic */
    }
  },
  async on<K extends keyof DesktopEvents>(
    event: K,
    handler: (payload: DesktopEvents[K]) => void,
  ): Promise<() => void> {
    if (!isDesktopApp()) return () => {};
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<DesktopEvents[K]>(event, (e) => handler(e.payload));
    } catch {
      return () => {};
    }
  },
};
