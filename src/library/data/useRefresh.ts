/**
 * useRefresh — the pull-to-refresh handler shared by the content screens.
 *
 * Returns an async callback that refetches every currently-active React Query
 * (queries that still have a mounted observer) — i.e. exactly the data the
 * screen in front of the user is showing. The promise resolves once those
 * refetches settle, so `PullToRefreshScrollView` can hold its spinner until the
 * fresh data has landed.
 *
 * `type: 'active'` deliberately scopes the refetch to mounted queries rather
 * than the whole cache, so a pull doesn't re-pull data for screens that aren't
 * on screen.
 */
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useRefresh(): () => Promise<void> {
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    await queryClient.refetchQueries({ type: 'active' });
  }, [queryClient]);
}
