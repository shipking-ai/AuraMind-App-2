import { registerPlugin } from '@capacitor/core';
import { Capacitor } from './nativeShim';

/**
 * The study session on the iPhone Lock Screen and in the Dynamic Island,
 * through the native AuraLiveActivity plugin
 * (ios/App/App/AuraLiveActivityPlugin.swift).
 *
 * Off iOS — the web app, the Android app — every call is a silent no-op, and
 * a bridge failure is swallowed: a session without a Live Activity is still a
 * session, and an accessory surface must never interrupt studying.
 */

export interface LiveActivitySession {
  deckTitle: string;
  total: number;
  done: number;
  /** Cards graded Again; shown as the part that is coming back. */
  again?: number;
}

interface AuraLiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean; enabled: boolean }>;
  start(options: LiveActivitySession): Promise<{ started: boolean; id?: string }>;
  update(options: LiveActivitySession): Promise<{ updated: boolean }>;
  end(): Promise<void>;
}

const AuraLiveActivity = registerPlugin<AuraLiveActivityPlugin>('AuraLiveActivity');

function isIOSApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** True only where an activity can actually be shown (iOS 16.1+, permitted). */
export async function isLiveActivityAvailable(): Promise<boolean> {
  if (!isIOSApp()) return false;
  try {
    const { supported, enabled } = await AuraLiveActivity.isSupported();
    return supported && enabled;
  } catch {
    return false;
  }
}

export async function startLiveActivity(session: LiveActivitySession): Promise<void> {
  if (!isIOSApp()) return;
  try {
    await AuraLiveActivity.start(session);
  } catch {
    /* accessory surface */
  }
}

let lastPushed = '';

/**
 * Move the progress. Deduped on the values that are actually drawn, so a
 * re-render mid-card doesn't push an identical update through ActivityKit.
 */
export async function updateLiveActivity(session: LiveActivitySession): Promise<void> {
  if (!isIOSApp()) return;
  const key = `${session.deckTitle}|${session.done}/${session.total}|${session.again ?? 0}`;
  if (key === lastPushed) return;
  lastPushed = key;
  try {
    await AuraLiveActivity.update(session);
  } catch {
    /* accessory surface */
  }
}

/** Ends the activity. Safe to call when none is showing. */
export async function endLiveActivity(): Promise<void> {
  lastPushed = '';
  if (!isIOSApp()) return;
  try {
    await AuraLiveActivity.end();
  } catch {
    /* accessory surface */
  }
}
