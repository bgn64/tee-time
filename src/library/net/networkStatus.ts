/**
 * Network status helpers.
 *
 * Provides connectivity signals for the data layer — notably the scoring
 * outbox, which flushes queued writes when the device comes back online.
 * Backed by expo-network (no extra native config required).
 */
import * as Network from 'expo-network';

function deriveOnline(state: Network.NetworkState): boolean {
  // `isInternetReachable` is `null` until determined; treat null as online so
  // we still attempt writes optimistically and let the request retry on failure.
  return !!state.isConnected && state.isInternetReachable !== false;
}

/** React hook: is the device online (connected + internet reachable)? */
export function useIsOnline(): boolean {
  const state = Network.useNetworkState();
  return deriveOnline(state);
}

/**
 * Subscribe to offline → online transitions (used by the scoring outbox to
 * flush pending writes on reconnect). Returns an unsubscribe function.
 */
export function subscribeToReconnect(onReconnect: () => void): () => void {
  let wasOnline = true;
  const subscription = Network.addNetworkStateListener((state) => {
    const online = deriveOnline(state);
    if (online && !wasOnline) {
      onReconnect();
    }
    wasOnline = online;
  });
  return () => subscription.remove();
}

/** One-shot current online check. */
export async function getIsOnline(): Promise<boolean> {
  return deriveOnline(await Network.getNetworkStateAsync());
}
