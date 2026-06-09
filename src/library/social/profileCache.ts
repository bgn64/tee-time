/**
 * In-memory profile cache — scoped to search-result transients and
 * profile lookups that are not already present in React Query data.
 *
 * Used by:
 *   · Search results          — warmed by `searchProfiles` so opening
 *                                a tapped result renders instantly.
 *   · `useProfile(userId)`    — fallback after checking account state,
 *                                request-view data, and this cache.
 *
 * The cache is process-scoped (not persisted) and treated as
 * best-effort — a miss just triggers a fresh fetch.
 */

import { supabase } from '@/library/supabase/client';
import type { ProfileSummary } from '@/types/social';

type CloudProfileRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
};

const cache = new Map<string, ProfileSummary>();
const inflight = new Map<string, Promise<ProfileSummary | null>>();

function rowToSummary(row: CloudProfileRow): ProfileSummary {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarColor: row.avatar_color
  };
}

export function getCachedProfile(userId: string): ProfileSummary | undefined {
  return cache.get(userId);
}

export function warmProfileCache(profiles: ProfileSummary[]): void {
  for (const p of profiles) cache.set(p.userId, p);
}

export function clearProfileCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Fetch + cache a single profile by userId. Returns the cached value
 * if present; otherwise issues exactly one in-flight request per
 * userId (dedup) and stores the result.
 */
export async function fetchProfile(userId: string): Promise<ProfileSummary | null> {
  const cached = cache.get(userId);
  if (cached) return cached;

  const existing = inflight.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, handle, display_name, avatar_color')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[profileCache] fetchProfile failed:', error);
      return null;
    }
    if (!data) return null;
    const summary = rowToSummary(data as CloudProfileRow);
    cache.set(summary.userId, summary);
    return summary;
  })();

  inflight.set(userId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(userId);
  }
}

