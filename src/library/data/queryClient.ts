import { QueryClient } from '@tanstack/react-query';

/**
 * App-wide React Query client.
 *
 * Replaces PowerSync's reactive local-SQLite queries with a fetch + cache
 * model: data is fetched from Supabase REST/RPC, cached, and refreshed on
 * demand (pull-to-refresh) or screen focus. Defaults are conservative and
 * can be overridden per hook as each feature slice migrates.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
