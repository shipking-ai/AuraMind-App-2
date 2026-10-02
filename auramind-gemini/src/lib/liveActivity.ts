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
  /**
   * Resolves ONLY when the native plugin is actually registered and answers.
   * A rejection means the plugin is missing from the binary — a build defect,
   * not a user setting.
   */
  isSupported(): Promise<{ supported: boolean; enabled: boolean }>;
  start(options: LiveActivitySession): Promise<{ started: boolean; id?: string }>;
  update(options: LiveActivitySession): Promise<{ updated: boolean }>;
  end(): Promise<void>;
}

const AuraLiveActivity = registerPlugin<AuraLiveActivityPlugin>('AuraLiveActivity');

/**
 * Whether the native plugin is present and answering.
 *
 * Distinct from isLiveActivityAvailable() on purpose. Both return false when
 * the OS refuses — the user's Live Activities setting is off, or the platform
 * is too old — but only this one distinguishes that from the plugin never
 * having been registered, which is a bug in the build.
 *
 * The distinction used to be invisible: SceneDelegate replaced the storyboard's
 * MainViewController (where the plugins are registered) with a bare
 * CAPBridgeViewController, and every call rejected into the same catch that
 * handled "permission denied". Voice and Live Activity silently did nothing,
 * and CI read the result as the OS declining.
 */
export async function isLiveActivityPluginRegistered(): Promise<boolean> {
  if (!isIOSApp()) return false;
  try {
    await AuraLiveActivity.isSupported();
    return true;
  } catch {
    return false;
  }
}

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

export async function startLiveActivity(session: LiveActivitySession): Promise<boolean> {
  if (!isIOSApp()) return false;
  try {
    const { started } = await AuraLiveActivity.start(session);
    return started === true;
  } catch {
    return false;
  }
}

let lastPushed = '';

/**
 * Move the progress. Deduped on the values that are actually drawn, so a
 * re-render mid-card doesn't push an identical update through ActivityKit.
 * Resolves true only when the plugin confirms the update — CI greps the
 * simulator log for a driven session (see IOSVisualPreview's live step).
 */
export async function updateLiveActivity(session: LiveActivitySession): Promise<boolean> {
  if (!isIOSApp()) return false;
  const key = `${session.deckTitle}|${session.done}/${session.total}|${session.again ?? 0}`;
  if (key === lastPushed) return false;
  lastPushed = key;
  try {
    const { updated } = await AuraLiveActivity.update(session);
    return updated === true;
  } catch {
    return false;
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
