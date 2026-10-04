import { readClientEnv } from '../../lib/env';
/**
 * puterProvider — Puter.js as a free, user-pays fallback AI provider.
 *
 * Why this exists
 * ───────────────
 * `groqClient.ts` covers the developer-paid path (Groq requires the dev to
 * put a key in `.env`). `templateDeckGenerator.ts` covers the last-resort
 * offline path (deterministic, no API needed). This module fills the middle:
 * Puter.js, which lets *the user* sign in with their own Puter account so
 * they pay for AI consumption directly. For most BonaMind end users this
 * removes the developer-key requirement entirely.
 *
 * Why Puter:
 *   - Zero developer cost: Puter charges the user, not the developer.
 *   - Sign-in is one popup (no API key to copy).
 *   - Auto temp-user creation means first-time users get an account in two
 *     clicks without a sign-up form.
 *   - 500+ models (GPT-4o-mini, Claude 3.5 Sonnet, Gemini 2.5 Flash, …).
 *   - Run entirely from the browser, gated by CORS; no server needed.
 *
 * Why dynamic import:
 *   - `@heyputer/puter.js` is 20-30 KB gzipped. Lazy-loading keeps the
 *     initial Vite chunk lean and avoids breaking offline-first installs
 *     (if the import fails, we throw PuterUnavailableError rather than
 *     crash the app).
 *   - The Vite code-splitter will produce a vendored Puter chunk only
 *     fetched on first AI request.
 *
 * Error model
 * ───────────
 *   - `isAuthRequired: true`  → no Puter session yet; UI MUST show a "Sign
 *     in with Puter" button (cannot auto-pop because popup blockers reject
 *     async-triggered popups).
 *   - `isQuotaExhausted: true` → user hit Puter's free cap; caller should
 *     drop through to the offline template (or surface an upgrade CTA in
 *     a future iteration).
 *   - Otherwise → upstream outage / network failure / SDK load error.
 *     Caller should drop through to the offline template.
 */

// Ambient declaration for `@heyputer/puter.js` lives in `src/types/puter.d.ts`
// so TypeScript can typecheck the dynamic import before `npm install` has
// resolved the real package. Once the package is installed on disk, the
// vendored types (if any) shadow the ambient decl and TS narrows the import
// automatically.

function readEnv(key: string, fallback = ''): string {
// Allowlisted read — see CLIENT_ENV in lib/env.ts. Dynamic indexing of
// import.meta.env makes Vite inline every VITE_ var into the bundle.
  return readClientEnv(key) ?? fallback;
}

function isPuterEnabled(): boolean {
  return readEnv('VITE_USE_PUTER', 'true') === 'true';
}

export class PuterUnavailableError extends Error {
  /** Identifier used by callers (and analytics) to attribute the failure. */
  readonly provider = 'puter' as const;
  /** True when `puter.auth.isSignedIn()` returns false at request time. */
  readonly isAuthRequired: boolean;
  /** True when Puter responded with quota / rate-limit (HTTP 429 or Pay-As-You-Go cap). */
  readonly isQuotaExhausted: boolean;
  /** Sanitised one-line description safe to log. */
  readonly puterMessage: string;

  constructor(
    message: string,
    opts: {
      isAuthRequired?: boolean;
      isQuotaExhausted?: boolean;
      puterMessage?: string;
    } = {},
  ) {
    super(message);
    this.name = 'PuterUnavailableError';
    this.isAuthRequired = !!opts.isAuthRequired;
    this.isQuotaExhausted = !!opts.isQuotaExhausted;
    this.puterMessage = opts.puterMessage ?? '';
  }
}

interface PuterChatShape {
  content: string;
  raw: any;
  source: 'puter';
}

// (forward) — `loadPuterModule` is implemented further down this file.
// We deliberately re-export it as a single declaration rather than via
// `export { loadPuterModule }` so the TypeScript checker doesn't duplicate
// the symbol across two declarations.

/**
 * puterChat — single non-streaming chat completion through Puter.js.
 *
 * Mirrors the surface of `groqChat` so callers can switch providers with
 * minimal plumbing:
 *   - Throws `PuterUnavailableError` (never plain `Error`).
 *   - `{ content, raw }` shape compatible with the existing JSON parser
 *     in `groqService.generateDeckFromTopic`.
 *   - `source: 'puter'` tag in the return lets analytics distinguish
 *     Puter-served AI decks from offline-template decks.
 */
export async function puterChat(opts: {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<PuterChatShape> {
  if (!isPuterEnabled()) {
    throw new PuterUnavailableError(
      'Puter.js is disabled (VITE_USE_PUTER != "true").',
      {},
    );
  }

  const puter = await loadPuterModule();

  // Pre-flight auth check. We can NOT auto-prompt here: Puter's auth popup
  // requires a synchronous user gesture, and by the time this code runs
  // the user's input event has long since completed. The caller in
  // `CardsDecks.tsx` catches `isAuthRequired === true` and surfaces a
  // button the user clicks to trigger the popup.
  let signedIn: boolean;
  try {
    signedIn = puter.auth && typeof puter.auth.isSignedIn === 'function'
      ? Boolean(await puter.auth.isSignedIn())
      : Boolean(puter.auth?.currentUser) || false;
  } catch {
    signedIn = false;
  }
  if (!signedIn) {
    throw new PuterUnavailableError(
      'Puter.js requires the user to sign in before AI calls can succeed. ' +
      'The UI should surface a "Sign in with Puter" button (auto-pop is blocked).',
      { isAuthRequired: true, puterMessage: 'not signed in' },
    );
  }

  // Build messages payload. Puter.ai.chat accepts either a prompt string
  // or a messages-shaped array. Use the messages path so we can later
  // support system prompts without API-surface drift.
  const messages = opts.prompt
    ? [{ role: 'user', content: opts.prompt }]
    : opts.messages ?? [];

  const model = opts.model ?? readEnv('VITE_PUTER_MODEL', 'gpt-5-nano');
  const max_tokens = opts.maxTokens ?? 4000;
  const temperature = opts.temperature ?? 0.7;

  let raw: any;
  try {
    // Puter SDK signature: `(promptOrMessages, testMode?, options?)`. We
    // pass `false` for `testMode` to ensure we hit the real network.
    if (typeof puter.ai.chat === 'function') {
      raw = await puter.ai.chat(messages, false, {
        model,
        max_tokens,
        temperature,
      });
    } else if (typeof puter.ai?.complete === 'function') {
      raw = await puter.ai.complete({ messages, model, max_tokens, temperature });
    } else {
      throw new PuterUnavailableError(
        'Puter.js SDK loaded but puter.ai.chat is unavailable — SDK shape changed.',
        { puterMessage: 'no chat/complete on puter.ai' },
      );
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    // Heuristic classification — Puter's error shape isn't stable yet.
    const lower = msg.toLowerCase();
    const isQuota = /quota|rate.?limit|exhaust|429|cap/.test(lower);
    throw new PuterUnavailableError(
      `Puter AI call failed: ${msg}`,
      { isQuotaExhausted: isQuota, puterMessage: msg },
    );
  }

  // Normalise to { content } — Puter's response shape varies slightly by
  // prompt vs messages path. Try common paths in order.
  const content: string =
    raw?.message?.content ??
    raw?.choices?.[0]?.message?.content ??
    raw?.text ??
    raw?.answer ??
    (typeof raw === 'string' ? raw : '');

  return { content, raw, source: 'puter' };
}

/**
 * puterModulePromise — singleton lazy-import of the @heyputer/puter.js SDK.
 * Either null (never loaded) or an in-flight / resolved Promise resolving
 * to the SDK module's `.default` export (or the module itself).
 */
let puterModulePromise: Promise<any> | null = null;

/**
 * Open the Puter sign-in popup. MUST be called inside a synchronous click
 * handler — browsers block popups that open outside a user gesture. The
 * `CardsDecks.tsx` flow shows this in a button labelled "Sign in with Puter
 * (free, no API key needed)" and triggers the popup from the onClick.
 */
export async function signInWithPuter(): Promise<boolean> {
  if (!isPuterEnabled()) return false;
  try {
    const puter = await loadPuterModule();
    if (!puter.auth || typeof puter.auth.signIn !== 'function') return false;
    await puter.auth.signIn();
    cacheAuthedState(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache the result of `isSignedIn()` so synchronous checks work without
 * a Puter-SDK round-trip. Updated by `loadPuterModule()` post-load and by
 * `signInWithPuter()` / `signOutPuter()`. The page-side UI uses this to
 * show the right auth affordance without flickering through a loading
 * state on mount.
 */
let authedCache: boolean | null = null;

function cacheAuthedState(value: boolean | null): void {
  authedCache = value;
}

/** Official Puter.js browser bundle. Sets `window.puter` on load. */
const PUTER_CDN_URL = 'https://js.puter.com/v2/';

/**
 * Load the Puter SDK.
 *
 * Loaded from Puter's CDN rather than the `@heyputer/puter.js` npm package,
 * because the package ships raw ESM source that pulls Node polyfills
 * (path-browserify, an XHR shim, a localStorage shim). Rollup does not carry
 * that through a production build: the SDK silently ends up absent from
 * `dist/` even though the dev server serves it fine — so Puter worked in dev
 * and failed in production.
 *
 * History worth keeping: before that, the import was wrapped in
 * `new Function('s', 'return import(s)')` to hide the specifier from Vite's
 * resolver. That also stopped Vite from REWRITING it, so the browser received
 * the bare string '@heyputer/puter.js' and threw "Failed to resolve module
 * specifier" on every single call. Puter never once loaded.
 *
 * The script tag is injected on first use, so it costs nothing until someone
 * actually falls through to Puter. `https://js.puter.com` must stay in the
 * CSP `script-src` (vercel.json and api/_middleware.ts) or the browser blocks
 * it silently.
 */
export async function loadPuterModule(): Promise<any> {
  if (!puterModulePromise) {
    puterModulePromise = (async () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new PuterUnavailableError(
          'Puter.js needs a browser environment (window/document).',
          {},
        );
      }

      // Already present (a previous load, or a host page that included it).
      const existing = (window as any).puter;
      if (existing?.ai) return sampleAuth(existing);

      await new Promise<void>((resolve, reject) => {
        const done = (el: HTMLScriptElement) => {
          el.dataset.puterLoaded = 'true';
          resolve();
        };

        const prior = document.querySelector<HTMLScriptElement>(
          `script[src="${PUTER_CDN_URL}"]`,
        );
        if (prior) {
          if (prior.dataset.puterLoaded === 'true') return resolve();
          prior.addEventListener('load', () => done(prior), { once: true });
          prior.addEventListener('error', () => reject(new Error('script error')), { once: true });
          return;
        }

        const el = document.createElement('script');
        el.src = PUTER_CDN_URL;
        el.async = true;
        el.addEventListener('load', () => done(el), { once: true });
        el.addEventListener('error', () => reject(new Error('script error')), { once: true });
        document.head.appendChild(el);
      }).catch((e: any) => {
        throw new PuterUnavailableError(
          `Puter.js failed to load from ${PUTER_CDN_URL}. Most likely the CSP ` +
          `script-src is missing https://js.puter.com, or the device is offline.`,
          { puterMessage: e?.message || String(e) },
        );
      });

      const sdk = (window as any).puter;
      if (!sdk?.ai) {
        throw new PuterUnavailableError(
          'Puter.js loaded but window.puter.ai is missing — the CDN bundle may have changed shape.',
          {},
        );
      }
      return sampleAuth(sdk);
    })();
  }
  return puterModulePromise;
}

/**
 * Sample auth state once at load so `isPuterAuthed()` can answer
 * synchronously afterwards.
 */
function sampleAuth(sdk: any): any {
  try {
    authedCache = Boolean(sdk?.auth?.isSignedIn?.());
  } catch {
    authedCache = false;
  }
  return sdk;
}

/**
 * Synchronous auth check — returns the most recent known auth state.
 * Caveat: only refreshes after a `loadPuterModule()` round-trip has
 * sampled `isSignedIn()`. On first render, returns `false` (conservative)
 * until the page calls `await puterChat()` or `getPuterUser()` once.
 */
export function isPuterAuthedSync(): boolean {
  return authedCache === true;
}

/**
 * Sign out the Puter session. Resets the auth cache so subsequent
 * isPuterAuthed() checks return false synchronously. Returns true if
 * the SDK reported success.
 */
export async function signOutPuter(): Promise<boolean> {
  if (!isPuterEnabled()) return false;
  try {
    const puter = await loadPuterModule();
    if (!puter.auth || typeof puter.auth.signOut !== 'function') return false;
    await puter.auth.signOut();
    cacheAuthedState(false);
    return true;
  } catch {
    cacheAuthedState(false);
    return false;
  }
}

/**
 * getPuterUser — fetch/refresh the current Puter user record.
 * Returns `null` when signed out or the SDK doesn't expose user info.
 */
export async function getPuterUser(): Promise<{ uuid?: string; username?: string; email?: string } | null> {
  if (!isPuterEnabled()) return null;
  try {
    const puter = await loadPuterModule();
    if (!puter.auth) return null;
    if (typeof puter.auth.user === 'function') {
      const u = await puter.auth.user();
      cacheAuthedState(Boolean(u));
      return u ?? null;
    }
    if (puter.auth.currentUser) {
      return puter.auth.currentUser;
    }
    return null;
  } catch {
    return null;
  }
}
