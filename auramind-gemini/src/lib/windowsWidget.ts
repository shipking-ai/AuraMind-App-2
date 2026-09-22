/**
 * Feeds the Windows 11 widget board.
 *
 * Edge lets an installed PWA publish a widget (Adaptive Card) that the user
 * pins next to the weather and the calendar. The card's data lives in the
 * service worker (public/widget-sw.js); this is the app side of that
 * contract — it posts the due state whenever it changes and nothing else.
 *
 * Deliberately the same shape as the Android widget bridge: the web app
 * decides what "due" means, and no other surface gets its own opinion.
 */

export interface WidgetState {
  due: number;
  deck?: string | null;
  streak?: number | null;
}

/** True where a widget board can exist at all (Edge/Windows, installed PWA). */
export function hasWidgetBoard(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    // Chromium exposes the widget entry point on the SW registration; in
    // browsers without the board this is simply absent.
    'widgets' in (navigator as unknown as Record<string, unknown>)
  );
}

let lastPublished = '';

/**
 * Publish the due count, the deck a session would start with, and the day
 * streak. Deduped, and silent everywhere the board does not exist — a widget
 * is an accessory and must never interrupt studying.
 */
export async function publishWindowsWidgetState(state: WidgetState): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const payload = {
    due: Number.isFinite(state.due) && state.due > 0 ? Math.floor(state.due) : 0,
    deck: state.deck?.trim() || '',
    streak:
      Number.isFinite(state.streak) && (state.streak as number) > 0
        ? Math.floor(state.streak as number)
        : 0,
  };
  const key = `${payload.due}|${payload.deck}|${payload.streak}`;
  if (key === lastPublished) return;
  lastPublished = key;
  try {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active ?? navigator.serviceWorker.controller;
    worker?.postMessage({ type: 'auramind-widget-state', state: payload });
  } catch {
    // No worker yet (first load, private window): the next change re-posts.
    lastPublished = '';
  }
}
