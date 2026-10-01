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

  /** "Android", "iPhone" or "Windows", for copy that names the device. */
  export function deviceName(): string {
    // The Windows app reports appPlatform() === "web" because it renders the
    // desktop layout, so without this it would be called "Android".
    if (isDesktopApp()) return "Windows";
    return isIOSApp() ? "iPhone" : "Android";
  }

/**
 * The Windows app (Tauri). It renders the desktop (web) layout, so
 * appPlatform() still says "web" — this is only for the handful of things a
 * browser tab and an installed app do differently.
 */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Any installed app (Android, iOS or Windows) rather than a browser tab.
 *
 * All three serve the bundle from a fixed app origin, which is why they share
 * rules a website doesn't need: no service worker (it would keep serving the
 * previous release's code), no Turnstile (Cloudflare can't issue tokens to
 * the app origin), and no OAuth (the provider can't redirect back into it).
 */
export function isAppShell(): boolean {
  return isNativeApp() || isDesktopApp();
}
