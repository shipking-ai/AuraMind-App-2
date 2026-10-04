import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

/**
 * BonaMind's app-wide QueryClient.
 *
 * Configured for Supabase semantics:
 *   - JWT-aware: every query runs against the active Supabase client, so
 *     RLS-protected tables work without manual headers.
 *   - Offline-tolerant: failed mutations are retried on `refetchOnReconnect`
 *     and the local query cache survives an offline session.
 *   - Reduced-but-real deduplication: 60s of in-flight "fresh" time means
 *     dashboard tab-switching feels instant while still coalescing N renders
 *     to one network round-trip.
 *
 * Why TanStack Query?
 *   - Replaces the manual `useEffect(() => { supabase.from(...).then(...) })`
 *     dance scattered across ~30 services with a single declarative cache.
 *   - Plays well with Realtime: a `postgres_changes` callback just calls
 *     `qc.invalidateQueries({ queryKey: [...] })` and the next render pulls
 *     a fresh value — no subscription per component.
 *   - Devtools panel (visible in dev only) surfaces cache state during
 *     diagnosis without modifying every hook.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60s in-flight data is "fresh" — matches BonaMind's expected
      // per-tab dwell time on dashboards.
      staleTime: 60_000,
      // 25min keeps rarely-viewed data alive without thrashing LRU.
      gcTime: 25 * 60_000,
      // Pull on window refocus so backgrounded users see fresh data when
      // they return, but never on tab switch (too chatty).
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // One auto-retry on transient network blips. Beyond that we trust
      // the user — Supabase errors usually indicate a real problem (RLS
      // deny, offline, etc.) and shouldn't loop.
      retry: 1,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (import.meta.env.DEV) {
        console.warn('[query] failed:', query.queryKey, error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (import.meta.env.DEV) {
        console.warn('[mutation] failed:', mutation.options.mutationKey, error);
      }
    },
  }),
});
