import React, { useCallback, useEffect, useRef, useState } from 'react';
import { readClientEnv } from '../../lib/env';

/**
 * Cloudflare Turnstile, wrapped for Supabase auth.
 *
 * Supabase rejects password, signup and recovery requests with
 * `captcha_failed` unless a `captchaToken` is supplied, so every one of those
 * call sites needs a live token before it submits.
 *
 * Three properties of Turnstile tokens drive this component's shape:
 *
 *   - They are SINGLE USE. A failed sign-in consumes the token, so a retry
 *     with the same one fails as `captcha_failed` rather than "wrong
 *     password" — confusing exactly when the user is already frustrated.
 *     Callers must call `reset()` after any failure.
 *   - They EXPIRE (~5 minutes). Someone who opens the page, wanders off, and
 *     comes back to type their password would otherwise submit a dead token.
 *     `expired-callback` clears it so the form blocks rather than failing
 *     obscurely.
 *   - The script is loaded lazily, so it costs nothing on pages that never
 *     authenticate.
 *
 * Renders nothing when VITE_TURNSTILE_SITE_KEY is unset. That is deliberate:
 * local development and CI have no key, and auth must keep working there.
 * The server side is what actually enforces this — Supabase rejects a missing
 * token regardless of what the client renders.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).turnstile) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')), { once: true });
      return;
    }

    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.defer = true;
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error('turnstile script failed')), { once: true });
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/** True when a site key is configured, so callers know whether to require a token. */
export function isTurnstileEnabled(): boolean {
  return Boolean(readClientEnv('VITE_TURNSTILE_SITE_KEY'));
}

export interface TurnstileHandle {
  /** Discard the current token and re-render. Call after any auth failure. */
  reset: () => void;
}

interface Props {
  /** Receives the token, or null when it is cleared, expires, or errors. */
  onToken: (token: string | null) => void;
  /** Set by the parent so it can reset the widget after a failed attempt. */
  handleRef?: React.MutableRefObject<TurnstileHandle | null>;
  className?: string;
}

const TurnstileWidget: React.FC<Props> = ({ onToken, handleRef, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const siteKey = readClientEnv('VITE_TURNSTILE_SITE_KEY');

  const reset = useCallback(() => {
    const turnstile = (window as any).turnstile;
    if (turnstile && widgetIdRef.current !== null) {
      try {
        turnstile.reset(widgetIdRef.current);
      } catch {
        // A reset on an already-removed widget is not worth surfacing.
      }
    }
    onToken(null);
  }, [onToken]);

  useEffect(() => {
    if (handleRef) handleRef.current = { reset };
  }, [handleRef, reset]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    let attempt = 0;
    // Cloudflare can reject the very first render of a session (fingerprint
    // scoring) while issuing a token on the next attempt. Without a retry a
    // stray rejection permanently locks the form behind "Couldn't load the
    // verification check" for the rest of that visit. Once a token has been
    // delivered the widget is healthy, so later error-callbacks are real
    // failures and stop retrying.
    let healthy = false;

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const tearDown = () => {
      cancelled = true;
      const turnstile = (window as any).turnstile;
      if (turnstile && widgetIdRef.current !== null) {
        try {
          turnstile.remove(widgetIdRef.current);
        } catch {
          // Already gone.
        }
      }
      widgetIdRef.current = null;
    };

    const scheduleRetry = () => {
      if (cancelled || healthy) return;
      attempt += 1;
      if (attempt <= 4) {
        // Back off on each retry: 600ms, 1.2s, 1.8s, 2.4s.
        setFailed(false);
        void wait(600 * attempt).then(() => {
          if (!cancelled) void run();
        });
      } else {
        setFailed(true);
      }
    };

    const run = async () => {
      try {
        await loadTurnstileScript();
      } catch {
        scheduleRetry();
        return;
      }
      if (cancelled || !containerRef.current) return;
      const turnstile = (window as any).turnstile;
      if (!turnstile) {
        scheduleRetry();
        return;
      }
      try {
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            healthy = true;
            onToken(token);
          },
          'expired-callback': () => onToken(null),
          'error-callback': () => {
            onToken(null);
            scheduleRetry();
          },
        });
      } catch {
        scheduleRetry();
      }
    };

    void run();

    return tearDown;
    // onToken is stable in practice (useCallback in the parent); re-rendering
    // the widget on every keystroke would reset the challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} />
      {failed && (
        <p className="mt-2 text-xs text-[#F0879B]">
          Couldn&apos;t load the verification check. Disable any script blocker for this
          site, or reload the page.
        </p>
      )}
    </div>
  );
};

export default TurnstileWidget;
