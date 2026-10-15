import { registerPlugin } from '@capacitor/core';
import { Capacitor } from './nativeShim';

/**
 * Launcher and window integrations from the native BonaDevice plugin
 * (android/app/src/main/java/com/auramind/app/BonaDevicePlugin.java).
 *
 * Every function is a silent no-op outside the installed Android app and
 * swallows bridge failures: these are conveniences layered over a working
 * app, and none of them may ever interrupt studying.
 */

interface DeckShortcut {
  id: string;
  title: string;
}

interface BonaDevicePlugin {
  setKeepAwake(options: { enabled: boolean }): Promise<void>;
  setRecentDecks(options: { decks: DeckShortcut[] }): Promise<void>;
  reportDeckUsed(options: { id: string }): Promise<void>;
  canPinShortcuts(): Promise<{ supported: boolean }>;
  pinDeck(options: DeckShortcut): Promise<{ requested: boolean }>;
}

const BonaDevice = registerPlugin<BonaDevicePlugin>('BonaDevice');

function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function setKeepAwake(enabled: boolean): Promise<void> {
  if (!isAndroidApp()) return;
  try {
    await BonaDevice.setKeepAwake({ enabled });
  } catch {
    // The screen timing out is the default behaviour, not a failure.
  }
}

let lastPublished = '';

/**
 * Publish the decks that should appear when the launcher icon is
 * long-pressed. Deduped so re-renders don't hammer the bridge; the native
 * side caps the list at what launchers actually show.
 */
export async function publishRecentDecks(decks: DeckShortcut[]): Promise<void> {
  if (!isAndroidApp()) return;
  const clean = decks
    .filter((deck) => deck.id && deck.title?.trim())
    .slice(0, 2)
    .map((deck) => ({ id: deck.id, title: deck.title.trim() }));
  const key = JSON.stringify(clean);
  if (key === lastPublished) return;
  try {
    await BonaDevice.setRecentDecks({ decks: clean });
    lastPublished = key;
  } catch {
    // Shortcuts are garnish on the launcher.
  }
}

export async function reportDeckUsed(id: string): Promise<void> {
  if (!isAndroidApp() || !id) return;
  try {
    await BonaDevice.reportDeckUsed({ id });
  } catch {
    // Ranking signal only.
  }
}

export async function canPinDecks(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    return (await BonaDevice.canPinShortcuts()).supported === true;
  } catch {
    return false;
  }
}

/** Ask the launcher to pin a one-tap "study this deck" icon. */
export async function pinDeckToHomeScreen(deck: DeckShortcut): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    return (await BonaDevice.pinDeck(deck)).requested === true;
  } catch {
    return false;
  }
}

/** Test seam: forget the publish dedupe. */
export function __resetBonaDeviceForTests(): void {
  lastPublished = '';
}
