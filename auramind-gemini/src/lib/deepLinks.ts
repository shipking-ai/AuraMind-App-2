/**
 * Deep-link parsing for the installed Android app.
 *
 * Launcher shortcuts fire `auramind://app/<path>` VIEW intents; Capacitor's
 * App plugin forwards them to JS as `appUrlOpen` events. This module turns
 * the URL into a router path — or null when it must be ignored.
 *
 * The allowlist is deliberate: a URL that can drive navigation is a URL that
 * can drive a logged-out user somewhere odd, so only first-party app
 * destinations pass. Everything else (including the dev harness) is dropped.
 */
const ALLOWED_PREFIXES = ["/dashboard", "/generator", "/study", "/decks", "/chat", "/settings"];

/** Where a native surface asked the app to go before it had finished booting. */
export const PENDING_ROUTE_KEY = "auramind_pending_route";

export function parseDeepLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "auramind:") return null;
  const path = parsed.pathname || "/";
  if (path.startsWith("/__e2e")) return null;
  if (!ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }
  // All first-party routes live under /dashboard/*; bare prefixes
  // (auramind://app/study) are normalized so they resolve instead of 404.
  const normalized =
    path === "/dashboard" || path.startsWith("/dashboard/") ? path : `/dashboard${path}`;
  return normalized + parsed.search + parsed.hash;
}

/**
 * A route left by a native surface that opened the app itself rather than
 * through a URL — today the iOS App Intents ("quiz me", the Action button,
 * a Shortcuts automation), which write it before the web layer exists.
 *
 * Read once and cleared, so a cold start honours it and nothing replays it
 * later. Same allowlist as a deep link: the value comes from outside the web
 * app, so it is a claim about where to go, not permission to go anywhere.
 */
export async function consumePendingRoute(): Promise<string | null> {
  try {
    const { Capacitor, Preferences } = await import("./nativeShim");
    if (!Capacitor.isNativePlatform()) return null;
    const { value } = await Preferences.get({ key: PENDING_ROUTE_KEY });
    if (value) await Preferences.remove({ key: PENDING_ROUTE_KEY });
    if (!value) return null;
    return parseDeepLink(`auramind://app${value.startsWith("/") ? value : `/${value}`}`);
  } catch {
    return null;
  }
}
