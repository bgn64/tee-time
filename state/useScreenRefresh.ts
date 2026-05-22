/**
 * `useScreenRefresh` — shared composition primitive for pull-to-refresh
 * surfaces.
 *
 * Most screens want to refresh more than one cloud source on a single
 * gesture. Rather than re-implementing the `[refreshing, setRefreshing]`
 * + Promise.all + toast-on-failure pattern in every screen, this hook
 * composes a list of `() => Promise<{ ok, error? }>` calls into a
 * single `{ refreshing, onRefresh }` pair tailored for
 * `RefreshControl` (and the shared `<RefreshButton />` desktop-web
 * affordance).
 *
 * Semantics:
 *   · `onRefresh()` calls every supplied refresh fn in parallel.
 *     Idempotent if called while already refreshing — concurrent
 *     invocations short-circuit on `refreshing === true`.
 *   · If any call returns `{ ok: false }`, a single combined toast is
 *     shown ("Couldn't refresh. Check your connection and try again.").
 *     We never stack multiple toasts per refresh — the user gets at
 *     most one failure message regardless of how many sources failed.
 *   · `refreshing` flips false in a `finally` so a thrown promise
 *     can't leave the spinner stuck.
 *
 * Compose order doesn't matter for correctness (calls run in parallel),
 * but callers should put the most-visible-impact refresh first for
 * stable spinner UX if any future implementation changes to serial.
 *
 * Example:
 *   const { refreshing, onRefresh } = useScreenRefresh([
 *     refreshScorecards,
 *     () => refreshProfiles(round.mentionedUserIds ?? []),
 *   ]);
 *   <RefreshControl refreshing={refreshing} onRefresh={onRefresh} ... />
 */

import { useCallback, useRef, useState } from 'react';

import { useToast } from '@/state/ToastContext';

type RefreshOutcome = { ok: boolean; error?: string };

export type ScreenRefreshFn = () => Promise<RefreshOutcome>;

export type UseScreenRefreshResult = {
  refreshing: boolean;
  onRefresh: () => Promise<void>;
};

const DEFAULT_FAILURE_TOAST =
  "Couldn't refresh. Check your connection and try again.";

export type UseScreenRefreshOptions = {
  /**
   * Override the combined failure toast text. Useful when the screen
   * wants a domain-specific message ("Couldn't refresh your roster") —
   * but most callers should accept the default so messaging stays
   * consistent.
   */
  failureToast?: string;
};

export function useScreenRefresh(
  refreshFns: ScreenRefreshFn[],
  opts: UseScreenRefreshOptions = {}
): UseScreenRefreshResult {
  const { show: toastShow } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  // Stabilize the hot inputs in refs so `onRefresh` identity stays
  // stable across renders. Callers will typically construct
  // `refreshFns` inline (a fresh array literal every render) and a
  // domain-specific `failureToast` string — without this indirection
  // RefreshControl would re-bind its prop on every parent render.
  const refreshFnsRef = useRef(refreshFns);
  refreshFnsRef.current = refreshFns;
  const failureToastRef = useRef(opts.failureToast);
  failureToastRef.current = opts.failureToast;

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    const fns = refreshFnsRef.current;
    if (fns.length === 0) return;
    setRefreshing(true);
    try {
      const results = await Promise.all(fns.map((fn) => fn()));
      const anyFailed = results.some((r) => !r.ok);
      if (anyFailed) {
        toastShow(failureToastRef.current ?? DEFAULT_FAILURE_TOAST, {
          autoHideMs: 4000,
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, toastShow]);

  return { refreshing, onRefresh };
}
