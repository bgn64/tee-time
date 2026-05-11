/**
 * AsyncStorage helpers and key namespace for the prototype's persistence layer.
 *
 * Each context (Theme / Player / GolfRound) hydrates from these keys on mount
 * and writes back on every state change. Keys are granular (one per piece of
 * state) so partial reads/writes are simple and storage is easy to inspect
 * during development.
 *
 * Transient state (HeaderContext slots, GolfRoundContext.pendingSelectedCourseId)
 * is intentionally excluded.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  PLAYERS: 'tee-time:players',
  RECENT_PLAYER_IDS: 'tee-time:recent-player-ids',
  DEFAULT_PLAYER_ID: 'tee-time:default-player-id',
  COURSES: 'tee-time:courses',
  COMPLETED_ROUNDS: 'tee-time:completed-rounds',
  CURRENT_ROUND: 'tee-time:current-round',
  THEME_NAME: 'tee-time:theme-name',
  ACCOUNT: 'tee-time:account',
  POST_ROUND_PROMPT_DISMISS_COUNT: 'tee-time:post-round-prompt-dismiss-count',
  SOCIAL: 'tee-time:social',
  AUTO_ACCEPT_OUTGOING: 'tee-time:dev:auto-accept-outgoing',
  AUTO_CLAIM_PENDING: 'tee-time:dev:auto-claim-pending',
  ONBOARDING_PRIMERS: 'tee-time:onboarding-primers',
} as const;

/**
 * Read a JSON value from storage. Returns `fallback` if the key is unset or
 * the stored value can't be parsed.
 */
export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[persistence] failed to load ${key}:`, e);
    return fallback;
  }
}

/**
 * Write a JSON value to storage. Failures are logged but never thrown — the
 * data is still in memory and will be re-persisted on the next mutation.
 */
export async function saveJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[persistence] failed to save ${key}:`, e);
  }
}

/**
 * Wipe every key the app owns. Used by the dev-only Reset button on the
 * About screen. After clearing, the app should reload to re-hydrate from
 * empty storage (which falls back to seed data).
 */
export async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (e) {
    console.warn('[persistence] failed to clear storage:', e);
  }
}
