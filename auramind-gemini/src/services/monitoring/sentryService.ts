import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const ENV = import.meta.env.MODE || 'development';

export function initSentry(): void {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENV,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: ENV === 'production' ? 0.25 : 1.0,
    // Pin what Sentry is allowed to collect, rather than inheriting a default.
    //
    // v10 defaulted to restrictive here because `sendDefaultPii` was unset, and
    // v11 removes that option entirely: an unset `dataCollection` collects
    // userInfo, cookies, all HTTP request/response bodies, database query data
    // and genAI inputs+outputs *by default*. For this app that would mean
    // students' flashcard text and Prof. Aura conversations - which go to
    // /api/ai - plus auth and subscription payloads, starting to reach Sentry
    // on a merge nobody would read as a privacy change.
    //
    // These values are the v10 defaults written out. `dataCollection` already
    // exists in 10.71, so this is a no-op today and makes the v11 bump
    // behaviourally inert.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      urlQueryParams: true,
      stackFrameVariables: true,
      frameContextLines: 5,
    },
  });
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!SENTRY_DSN) return;
  Sentry.captureMessage(message, level);
}

export { Sentry };
export default Sentry;
