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
