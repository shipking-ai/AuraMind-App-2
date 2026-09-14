import { Capacitor, Preferences } from './nativeShim';

/**
 * Feeds the Android home-screen widget.
 *
 * The widget is a plain RemoteViews AppWidget (see
 * android/app/src/main/java/com/auramind/app/AuraMindWidgetProvider.java). It
 * cannot call into the web layer, so the contract is deliberately dumb: this
 * writes two strings into Capacitor Preferences — which is SharedNames
 * "CapacitorStorage" underneath — and the provider reads them when it redraws.
 *
 * Keeping the count on this side matters. Due-ness is an FSRS question the
 * TypeScript already answers everywhere else; reimplementing that scheduling
 * in Java would give the widget its own subtly different idea of "due" and
 * guarantee the two drift apart.
 *
 * The redraw is triggered by MainActivity.onPause, not from here: a widget is
 * only looked at after leaving the app, so refreshing on the way out is both
 * the right moment and one less bridge call.
 */

const KEY_DUE = 'auramind_widget_due';
const KEY_DECK = 'auramind_widget_deck';
const KEY_STREAK = 'auramind_widget_streak';

/**
 * Publish the current due count, the deck a review would start with, and the
 * day streak for the home-screen widget.
 *
 * No-ops off-native and swallows failures: the widget is an accessory, and a
 * storage error must never interrupt a study session.
 */
export async function publishWidgetState(
  dueCount: number,
  nextDeckName?: string | null,
  streakDays?: number | null,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const safe = Number.isFinite(dueCount) && dueCount >= 0 ? Math.floor(dueCount) : 0;
    await Preferences.set({ key: KEY_DUE, value: String(safe) });
    // An empty string rather than removing the key: the provider treats a
    // missing deck and an empty deck the same way, and set() is one call.
    await Preferences.set({ key: KEY_DECK, value: nextDeckName?.trim() || '' });
    const streak = Number.isFinite(streakDays) && (streakDays as number) > 0
      ? Math.floor(streakDays as number)
      : 0;
    await Preferences.set({ key: KEY_STREAK, value: String(streak) });
  } catch {
    // Accessory surface; never surface a storage failure to the user.
  }
}
