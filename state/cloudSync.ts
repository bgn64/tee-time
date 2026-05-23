/**
 * Shared per-account cloud-sync plumbing factored out of the four
 * domain contexts (Account, Player, GolfRound, Friends).
 *
 * These hooks consolidate two patterns that were each re-implemented
 * across the contexts in subtly-different shapes. Each hook is small
 * enough to be inlined back if a context's needs diverge, but
 * centralizing them here means a future tweak (e.g., adding telemetry
 * to every refresh path) lands once instead of N times.
 *
 * What's covered:
 *   · `useOneShotSyncOnSignIn` — sentinel-gated initial pull that
 *     runs exactly once per signed-in user and re-arms on sign-out.
 *   · `useRefreshGeneration` — race-safe latest-response-wins token
 *     pair for refresh functions that can be invoked concurrently.
 *
 * What's NOT covered (deliberate scope cap):
 *   · Sign-out cleanup. That moved to `state/signOutRegistry.ts` —
 *     hooked directly off the Supabase `SIGNED_OUT` auth event so
 *     handlers fire synchronously (closing the crash window between
 *     auth event and React commit). An earlier draft of this module
 *     had `useSignOutReset` based on observing `accountUserId`
 *     transitioning non-null → null; it was superseded by the
 *     registry, which is strictly better (synchronous + can purge
 *     AsyncStorage directly rather than waiting for persistence
 *     effects to mirror).
 *   · The optimistic-write + writeQueue.enqueue-on-failure pattern
 *     in cloudUpsertPlayer / cloudUpsertCourse / cloudUpsertRound.
 *     Its rollback-snapshot handling has enough domain-specific
 *     shape to warrant a separate extraction PR.
 */

import { useCallback, useEffect, useRef } from 'react';

// =============================================================================
// useOneShotSyncOnSignIn
// =============================================================================

export type OneShotSyncOptions = {
  /** Stable primitive — extract via `account?.userId ?? null`. */
  accountUserId: string | null;
  /**
   * Both the consuming context AND `AccountContext` must have hydrated
   * before we attempt to talk to the cloud. Without this gate we'd
   * race the initial AsyncStorage hydration and clobber persisted
   * state with an empty cloud response.
   */
  ready: boolean;
  /**
   * Called once per signed-in user with the captured user id. Should
   * perform the cloud pull + local merge and resolve when done.
   * Re-invocations for the same user id are suppressed by the
   * internal sentinel.
   */
  sync: (userId: string) => Promise<void>;
};

/**
 * Run `sync` exactly once per signed-in user. The internal sentinel
 * re-arms on sign-out so the next sign-in (same or different account)
 * fires again. The effect is also a no-op while `ready` is false to
 * avoid racing initial AsyncStorage hydration.
 *
 * Replaces the `cloudSyncedAccountRef` / `cloudCoursesSyncedAccountRef` /
 * `cloudRoundsSyncedAccountRef` pattern in `PlayerContext` and
 * `GolfRoundContext`.
 *
 * Note: callers should make `sync` referentially stable (wrap in
 * `useCallback`) or accept that an identity change will re-trigger the
 * effect. The sentinel prevents duplicate runs for the same user
 * regardless, but a churning `sync` identity would still re-fire the
 * effect's setup/teardown.
 */
export function useOneShotSyncOnSignIn(opts: OneShotSyncOptions): void {
  const syncedAccountRef = useRef<string | null>(null);

  // Keep `sync` accessible without listing it as an effect dep — the
  // sync function commonly closes over per-render state (e.g., a
  // generation counter, snapshot helpers) and would otherwise trigger
  // re-runs on every render of the consuming context.
  const syncRef = useRef(opts.sync);
  syncRef.current = opts.sync;

  const { accountUserId, ready } = opts;

  useEffect(() => {
    if (!ready) return;
    if (!accountUserId) {
      syncedAccountRef.current = null;
      return;
    }
    if (syncedAccountRef.current === accountUserId) return;

    let cancelled = false;
    const ownerUserId = accountUserId;
    void syncRef.current(ownerUserId).then(() => {
      if (cancelled) return;
      syncedAccountRef.current = ownerUserId;
    });
    return () => {
      cancelled = true;
    };
  }, [accountUserId, ready]);
}

// =============================================================================
// useRefreshGeneration
// =============================================================================

export type RefreshGeneration = {
  /**
   * Allocate a fresh generation token and return it. The caller
   * should capture this in a local before any awaits, and pass it to
   * `isStale` after each await to discard responses that were
   * superseded by a newer refresh.
   */
  begin: () => number;
  /** Returns true if a newer refresh has started since `token` was issued. */
  isStale: (token: number) => boolean;
  /** The current generation value (read-only — debugging / tests). */
  current: () => number;
};

/**
 * Latest-response-wins primitive for race-safe refresh functions.
 *
 * Replaces the per-context `refreshGenRef` + manual increment + manual
 * compare pattern used in `AccountContext.refreshFromSession`,
 * `PlayerContext.refreshRoster`, `GolfRoundContext.refreshScorecards`,
 * and the two refresh fns in `SocialContext`.
 *
 * Usage:
 *   const gen = useRefreshGeneration();
 *   const refresh = useCallback(async () => {
 *     const myToken = gen.begin();
 *     const { data, error } = await supabase.from('foo').select('*');
 *     if (gen.isStale(myToken)) return { ok: true };
 *     // ...write state...
 *   }, [gen]);
 */
export function useRefreshGeneration(): RefreshGeneration {
  const counterRef = useRef(0);

  const begin = useCallback(() => {
    counterRef.current += 1;
    return counterRef.current;
  }, []);

  const isStale = useCallback((token: number) => counterRef.current !== token, []);

  const current = useCallback(() => counterRef.current, []);

  // Stable result identity — callers can list it in dep arrays
  // without churn.
  const resultRef = useRef<RefreshGeneration>({ begin, isStale, current });
  return resultRef.current;
}
