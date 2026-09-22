import { registerPlugin } from '@capacitor/core';
import { Capacitor } from './nativeShim';

/**
 * The study session as an Android Live Update, through the native
 * AuraLiveUpdate plugin (android/app/src/main/java/com/auramind/app/
 * AuraLiveUpdatePlugin.java).
 *
 * On Android 16 the session shows as a status-bar chip and at the top of the
 * lock screen while the user is elsewhere; on older releases it is an
 * ordinary ongoing progress notification. Everywhere else — web, iOS — every
 * call is a silent no-op, and a bridge failure never interrupts studying.
 */

export interface LiveUpdateSession {
  deckTitle: string;
  total: number;
  done: number;
  /** 1-based positions of the cards graded Again; drawn as dots on the bar. */
  againAt?: number[];
  deepLink?: string;
}

interface AuraLiveUpdatePlugin {
  isSupported(): Promise<{ supported: boolean; promoted: boolean }>;
  start(options: LiveUpdateSession): Promise<{ posted: boolean; promoted?: boolean }>;
  update(options: LiveUpdateSession): Promise<{ posted: boolean; promoted?: boolean }>;
  end(): Promise<void>;
}

const AuraLiveUpdate = registerPlugin<AuraLiveUpdatePlugin>('AuraLiveUpdate');

function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** True only where a session can actually be promoted (Android 16+). */
export async function isLiveUpdateSupported(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    const { supported } = await AuraLiveUpdate.isSupported();
    return supported;
  } catch {
    return false;
  }
}

export async function startLiveUpdate(session: LiveUpdateSession): Promise<void> {
  if (!isAndroidApp()) return;
  try {
    await AuraLiveUpdate.start(session);
  } catch {
    // A session without a notification is still a session.
  }
}

let lastPosted = '';

/**
 * Move the bar. Deduped on the values that are actually drawn, so grading a
 * card mid-flip doesn't re-post an identical notification.
 */
export async function updateLiveUpdate(session: LiveUpdateSession): Promise<void> {
  if (!isAndroidApp()) return;
  const key = `${session.deckTitle}|${session.done}/${session.total}|${(session.againAt ?? []).join(',')}`;
  if (key === lastPosted) return;
  lastPosted = key;
  try {
    await AuraLiveUpdate.update(session);
  } catch {
    /* see startLiveUpdate */
  }
}

/** Ends the Live Update. Safe to call when none is showing. */
export async function endLiveUpdate(): Promise<void> {
  lastPosted = '';
  if (!isAndroidApp()) return;
  try {
    await AuraLiveUpdate.end();
  } catch {
    /* see startLiveUpdate */
  }
}
