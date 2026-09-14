import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Device } from '@capacitor/device';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Native capability facade.
 *
 * The web build still uses this same module, but Capacitor's plugin bridges
 * become real Android implementations inside the APK. Every consumer keeps
 * an explicit `Capacitor.isNativePlatform()` guard where a browser fallback
 * is not meaningful, so the website remains safe to run without plugins.
 */
export { Capacitor };
export {
  App,
  Clipboard,
  Device,
  Directory,
  Filesystem,
  Haptics,
  ImpactStyle,
  Keyboard,
  LocalNotifications,
  Network,
  NotificationType,
  Preferences,
  Share,
  SplashScreen,
  StatusBar,
  Style,
};

/**
 * Real FCM plugin. Until google-services.json is configured (drop it in
 * android/app/google-services.json and rebuild), register() rejects and the
 * push service treats push as unavailable — every consumer already handles
 * that path, so activation needs credentials and nothing else.
 */
export { PushNotifications };

export type BiometryType = 'none' | 'fingerprint' | 'face' | 'iris' | 'multiple';

export interface BiometricAvailability {
  isAvailable: boolean;
  biometryType: BiometryType;
  /** Machine-readable when unavailable: not_enrolled, no_hardware, … */
  reason?: string;
}

export interface NativeBiometricPlugin {
  isAvailable(options?: { useFallback?: boolean }): Promise<BiometricAvailability>;
  verifyIdentity(options: {
    reason?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    useFallback?: boolean;
  }): Promise<{ success: boolean }>;
  setCredentials(options: { username: string; password: string; server: string }): Promise<void>;
  getCredentials(options: { server: string }): Promise<{ username: string; password: string }>;
  deleteCredentials(options: { server: string }): Promise<void>;
}

/**
 * First-party native plugin (BiometricAuthPlugin.java): the system biometric
 * sheet plus a Keystore-backed credential vault. On web the proxy rejects
 * with "not implemented" — every consumer guards with
 * `Capacitor.isNativePlatform()` first, so the website never touches it.
 */
export const NativeBiometric = registerPlugin<NativeBiometricPlugin>('BiometricAuth');

export async function getVersion(): Promise<string> {
  try {
    const info = await App.getInfo();
    return info.version;
  } catch {
    return '2.0.0';
  }
}

export async function getName(): Promise<string> {
  try {
    const info = await App.getInfo();
    return info.name;
  } catch {
    return 'AuraMind';
  }
}

export async function check(): Promise<{ version: string; body?: string } | null> {
  return null;
}
