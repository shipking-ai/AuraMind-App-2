/**
 * Where the app is running: the Android app, the iOS app, or the web.
 *
 * The phone layout (bottom nav, home screen, settings sheet) was written for
 * the Android app and is used by both native apps; the checks below keep
 * genuinely Android-only features (widgets, spoken reminders, the back
 * gesture's exit hint) from appearing on iPhone.
 */
import { Capacitor } from "./nativeShim";

export type AppPlatform = "android" | "ios" | "web";

export function appPlatform(): AppPlatform {
  if (!Capacitor.isNativePlatform()) return "web";
  const platform = Capacitor.getPlatform();
  return platform === "ios" ? "ios" : platform === "android" ? "android" : "web";
}

/** Either native app — the phone layout applies. */
export function isNativeApp(): boolean {
  return appPlatform() !== "web";
}

export function isAndroidApp(): boolean {
  return appPlatform() === "android";
}

export function isIOSApp(): boolean {
  return appPlatform() === "ios";
}

/** "Android" or "iPhone", for copy that names the device. */
export function deviceName(): string {
  return isIOSApp() ? "iPhone" : "Android";
}
