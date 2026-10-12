import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { kvGet, kvSet } from './db';

/**
 * Server data with an instant start: the last-known value is read from the
 * on-device snapshot synchronously, then TanStack Query revalidates it and
 * every fresh result is written back. Only a first install shows loading.
 */
export interface CachedQueryOptions {
  /** 'always': refetch on mount even inside staleTime (screens that need fresh data). */
  refetchOnMount?: 'always';
}

export function useCachedQuery<T>(key: string[], fetcher: () => Promise<T>, enabled = true, opts: CachedQueryOptions = {}) {
  const cacheKey = `q:${key.join('/')}`;
  const query = useQuery({
    queryKey: key,
    queryFn: fetcher,
    enabled,
    initialData: () => kvGet<T>(cacheKey),
    initialDataUpdatedAt: 0, // always stale, so the snapshot is revalidated
    ...(opts.refetchOnMount ? { refetchOnMount: opts.refetchOnMount } : {}),
  });
  useEffect(() => {
    if (query.data !== undefined && query.isFetchedAfterMount) void kvSet(cacheKey, query.data);
  }, [cacheKey, query.data, query.isFetchedAfterMount]);
  return query;
}
