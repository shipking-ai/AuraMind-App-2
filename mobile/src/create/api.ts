import { CreateError, type AbortLike, type CreateErrorKind } from '@bonamind/core';
import { getSupabase } from '../data/supabase';
import { env } from '../env';

/** No request in course creation waits longer than this. */
export const REQUEST_TIMEOUT_MS = 45_000;

type CancelSignal = AbortLike & { addEventListener?: (type: 'abort', listener: () => void) => void };

function kindFor(status: number): CreateErrorKind {
  if (status === 402) return 'subscription';
  if (status === 413) return 'too_large';
  if (status === 415 || status === 422) return 'unreadable';
  if (status === 429) return 'rate_limited';
  return 'busy';
}

/**
 * POST JSON to the BonaMind API with the session token read at request time
 * (a token refreshed mid-build is the one sent) and a 45 s timeout. Failures
 * become CreateErrors: a thrown request is `offline`, a timeout `busy`.
 */
export async function authedPost<T>(path: string, body: unknown, signal?: CancelSignal): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, REQUEST_TIMEOUT_MS);
  signal?.addEventListener?.('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (timedOut) throw new CreateError('busy', 'timed out');
    if (signal?.aborted) throw e;
    throw new CreateError('offline', (e as Error)?.message);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new CreateError(kindFor(res.status), `HTTP ${res.status}`);
  return (await res.json()) as T;
}
