import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useCachedQuery } from '../cachedQuery';

jest.mock('../db', () => ({ kvGet: () => undefined, kvSet: async () => {} }));

function primed() {
  // Today just fetched this key: within staleTime, a plain mount won't refetch.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } } });
  client.setQueryData(['cards', 'u1'], ['from Today']);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return wrapper;
}

// The study screen waits for isFetchedAfterMount. Opened within 30s of Today
// loading, nothing refetched, so it waited forever on a black screen.
it('refetches on mount when asked to, even inside staleTime', async () => {
  const fetcher = jest.fn(async () => ['fresh']);
  const { result } = await renderHook(() => useCachedQuery(['cards', 'u1'], fetcher, true, { refetchOnMount: 'always' }), { wrapper: primed() });
  await waitFor(() => expect(result.current.isFetchedAfterMount).toBe(true));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.current.data).toEqual(['fresh']);
});

it('keeps the cheap default elsewhere: no refetch inside staleTime', async () => {
  const fetcher = jest.fn(async () => ['fresh']);
  const { result } = await renderHook(() => useCachedQuery(['cards', 'u1'], fetcher), { wrapper: primed() });
  expect(result.current.data).toEqual(['from Today']);
  expect(fetcher).not.toHaveBeenCalled();
});
