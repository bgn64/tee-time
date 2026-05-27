/**
 * In-memory profile cache — scoped to search-result transients.
 *
 * Profiles that match a sync stream (own profile, friends,
 * requesters) live in PowerSync's local SQLite as the source of
 * truth; they are NOT cached here. This module exists only for
 * profiles the user discovers via handle search — those rows aren't
 * part of any sync stream (search needs a global prefix index) and
 * we don't want to round-trip back to Supabase every time the user
 * taps the same result.
 *
 * Used by:
 *   · Search results          — warmed by `searchProfiles` so opening
 *                                a tapped result renders instantly.
 *   · `useProfile(userId)`    — third-tier fallback (PowerSync watch
 *                                first, then this cache, then a direct
 *                                Supabase fetch).
 *
 * The cache is process-scoped (not persisted) and treated as
 * best-effort — a miss just triggers a fresh fetch.
 */

import type { ProfileSummary } from '@/types/social';

type CloudProfileRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
};

type SupabaseLike = {
  from: (table: string) => any;
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
 *
 * Used by `useProfile` as the third-tier fallback when the profile
 * isn't in PowerSync's local SQLite AND isn't in the search cache.
 */
export async function fetchProfile(
  client: SupabaseLike,
  userId: string
): Promise<ProfileSummary | null> {
  const cached = cache.get(userId);
  if (cached) return cached;

  const existing = inflight.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await client
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

