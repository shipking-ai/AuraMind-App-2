/**
 * Canonical app origin and email sender — the single source of truth for
 * everything in the API that needs to know "where does this app live".
 *
 * Why this exists
 * ---------------
 * The domain was hardcoded in five places that had to change together, and
 * two of them failed silently rather than loudly:
 *
 *   _middleware.ts CORS allowlist   a request from a new domain gets NO
 *                                   Access-Control-Allow-Origin header, which
 *                                   the browser surfaces as a generic network
 *                                   failure. This is the "login just spins"
 *                                   bug.
 *   stripe-webhook.ts email links   every receipt and dunning email links to
 *                                   the old /dashboard and /subscribe, so
 *                                   customers land on a page that 404s or,
 *                                   worse, keeps billing on the old domain.
 *
 * A rename touches both, so they belong in one file.
 *
 * Relationship to app-identity.ts
 * -------------------------------
 * `auramind-gemini/app-identity.ts` owns the product NAME (what users read).
 * This file owns the DOMAIN (where the app is served) and is consumed by the
 * serverless API, which cannot import from the web app's TypeScript. Two
 * constants, two runtimes, one place each.
 *
 * Environment
 * -----------
 * APP_ORIGIN overrides the default. Set it when the domain changes — it is
 * also what the CORS allowlist derives its web origins from, so setting it in
 * one env var updates auth, API access, and email links together.
 */

/**
 * The canonical https origin, no trailing slash. Used for CORS, absolute URLs
 * in transactional email, and OAuth redirect construction.
 */
export const APP_ORIGIN: string = (process.env.APP_ORIGIN || 'https://auramind.app').replace(/\/+$/, '');

/**
 * Transnational email sender. Kept as its own variable because the sender
 * domain is a DNS/deliverability decision, not necessarily the same host the
 * app is served from — Resend requires the sending domain to be verified even
 * when the app lives elsewhere.
 *
 * A stale sender does not error: mail still sends from the old verified domain
 * while every link in it points at the new site, which reads as a phishing
 * attempt to anyone who checks the headers.
 */
export const EMAIL_FROM: string =
  process.env.RESEND_FROM_EMAIL || 'noreply@mail.auramind.app';

/**
 * Builds an absolute URL on the canonical origin.
 *
 * Accepts a path with or without a leading slash. Going through this rather
 * than string-concatenating `APP_ORIGIN` at each call site is what keeps a
 * double slash (`https://auramind.app//dashboard`) from appearing when one
 * call site passes a leading slash and another does not.
 */
export function appUrl(pathname = ''): string {
  if (!pathname) return APP_ORIGIN;
  return `${APP_ORIGIN}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}