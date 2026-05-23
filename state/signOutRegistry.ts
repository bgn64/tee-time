/**
 * Sign-out purge registry.
 *
 * Centralized handler bus invoked when Supabase fires `SIGNED_OUT`.
 * Each domain context registers a `purge()` that:
 *   1. Clears its in-memory state to seed defaults.
 *   2. Synchronously removes the AsyncStorage keys it owns.
 *
 * Why centralize: under the prior pattern, sign-out cleanup happened
 * indirectly via React effects observing `accountUserId` transitioning
 * non-null → null. That worked, but had two failure modes:
 *
 *   1. **Crash window.** Between the auth event and the React commit
 *      that re-renders with the cleared in-memory state, AsyncStorage
 *      still held the previous user's data. A crash mid-sign-out
 *      would leak that data into the next sign-in.
 *
 *   2. **Persistence-effect ordering.** The persistence effects that
 *      mirror in-memory state to AsyncStorage fired AFTER the in-
 *      memory reset committed. Any short-circuit in the dep array or
 *      a stale closure could skip the write entirely.
 *
 * The registry sidesteps both: handlers run synchronously off the auth
 * event itself (before any React reconciliation), and they call
 * AsyncStorage.removeItem directly rather than relying on a
 * persistence effect to mirror the cleared state.
 *
 * Handlers are best-effort — a thrown handler is logged but doesn't
 * block other handlers. Registration returns an unregister function
 * for use in useEffect cleanup.
 */

export type SignOutPurgeHandler = () => Promise<void> | void;

const handlers = new Set<SignOutPurgeHandler>();

/**
 * Register a sign-out purge handler. Returns an unregister function;
 * the caller is responsible for invoking it on unmount (in a
 * useEffect cleanup) so handlers don't accumulate across re-mounts.
 */
export function registerSignOutPurge(handler: SignOutPurgeHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Run every registered purge handler in parallel. Resolves once all
 * handlers have settled (success or thrown). Individual failures are
 * logged but don't abort sibling handlers.
 *
 * Triggered from AccountContext's `onAuthStateChange` callback when
 * Supabase fires `SIGNED_OUT`. Callers can also invoke directly
 * during impersonation flows.
 */
export async function runSignOutPurge(): Promise<void> {
  const all = Array.from(handlers);
  const results = await Promise.allSettled(all.map((h) => Promise.resolve().then(() => h())));
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[signOutPurge] handler failed:', r.reason);
    }
  }
}

/**
 * Test-only escape hatch. Lets test suites assert against a clean
 * registry between cases instead of accumulating handlers across
 * runs.
 */
export function __resetSignOutRegistryForTesting(): void {
  handlers.clear();
}

/**
 * Test-only read accessor. Useful for assertions like "exactly N
 * handlers were registered by the provider tree."
 */
export function __getRegisteredCountForTesting(): number {
  return handlers.size;
}
