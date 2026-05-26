/**
 * Per-device, per-account "current hole" persistence.
 *
 * The destination app stores `currentHoleNumber` inside the Round
 * itself, but we deliberately keep it local: the user's two devices
 * can score the same round from different holes without one
 * navigation event yanking the other device away.
 *
 * Keys are namespaced as `golf:currentHole:{userId}:{scorecardId}` so
 * sign-out / sign-in on the same device leaves a sane state, and so
 * `clearForUser` can sweep every key the user owns without touching
 * other accounts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'golf:currentHole:';

function key(userId: string, scorecardId: string): string {
  return `${PREFIX}${userId}:${scorecardId}`;
}

function userPrefix(userId: string): string {
  return `${PREFIX}${userId}:`;
}

export async function readCurrentHole(
  userId: string,
  scorecardId: string
): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, scorecardId));
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

export async function writeCurrentHole(
  userId: string,
  scorecardId: string,
  holeNumber: number
): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId, scorecardId), String(holeNumber));
  } catch {
    // Best-effort; we never want a storage hiccup to break scoring.
  }
}

export async function clearCurrentHoleForScorecard(
  userId: string,
  scorecardId: string
): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId, scorecardId));
  } catch {
    // ignore
  }
}

/** Sweep every per-scorecard hole key for one user. Used on sign-out. */
export async function clearCurrentHoleForUser(userId: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prefix = userPrefix(userId);
    const ours = allKeys.filter((k) => k.startsWith(prefix));
    if (ours.length > 0) {
      await AsyncStorage.multiRemove(ours);
    }
  } catch {
    // ignore
  }
}
