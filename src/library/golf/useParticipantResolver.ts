/**
 * useParticipantResolver — resolves display info for a list of
 * scorecard participants.
 *
 * Lookup tiers:
 *
 *   Tier 1 (PowerSync local SQLite):
 *     · `user:{uid}` → `profiles WHERE id = uid`. Hits for own
 *       profile, friends, and pending-FR counterparties (the rows
 *       synced by the own_profile / friend_profiles /
 *       requester_profiles streams).
 *     · `custom:{cid}` → `custom_players WHERE id = cid`. Hits for
 *       ALL of the user's rows, including soft-deleted ones — the
 *       resolver intentionally does NOT filter `deleted_at`, so
 *       historic scorecards keep rendering deleted players.
 *
 *   Tier 2 (direct Supabase fetch):
 *     For `user:{uid}` keys whose profile isn't in local SQLite —
 *     typically an unfriended ex-friend who participated in a
 *     historic round. The `profiles_select_all` RLS policy lets us
 *     read any profile when online. The fetched rows are cached in
 *     hook-local state for the lifetime of the screen.
 *
 *   Tier 3 (legacy seed fallback):
 *     For unprefixed ids on pre-Phase-7 scorecards (e.g.
 *     `'player-you'`). Resolves via `findSeedPlayer` so in-flight
 *     rounds from the seeded era keep rendering "You" / "Alice" /
 *     etc.
 *
 * Returns a map keyed by participantKey so consumers can do
 * `resolver.get(participantKey)` with O(1) lookups.
 *
 * `fallback: true` indicates we couldn't resolve the row anywhere
 * (offline + ex-friend, or deleted custom player whose row hasn't
 * synced yet on first launch). UI can render the placeholder
 * "Player" / "Removed player" labels without crashing.
 */

import React from 'react';
import { useQuery } from '@powersync/react';

import { findSeedPlayer } from '@/data/players';
import {
  CUSTOM_PLAYERS_TABLE,
  PROFILES_TABLE,
  type CustomPlayerRecord,
  type ProfileRecord
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import {
  customParticipantKey,
  parseParticipantKey,
  userParticipantKey
} from './participantKey';

export type ResolvedParticipant = {
  participantKey: string;
  displayName: string;
  avatarColor: string;
  /** Present for `user:` participants — drives tap-to-profile from the scorecard. */
  userId?: string;
  handle?: string;
  /** True when no local OR remote row was found — UI shows a placeholder. */
  fallback: boolean;
};

type FetchedProfile = {
  userId: string;
  handle: string;
  displayName: string;
  avatarColor: string;
} | null;

const PLACEHOLDER_AVATAR_COLOR = '#888888';

function profileSql(userIds: readonly string[]): { sql: string; params: string[] } {
  if (userIds.length === 0) {
    return {
      sql: `SELECT id, handle, display_name, avatar_color FROM ${PROFILES_TABLE} WHERE 1 = 0`,
      params: []
    };
  }
  const placeholders = userIds.map(() => '?').join(', ');
  return {
    sql: `SELECT id, handle, display_name, avatar_color FROM ${PROFILES_TABLE} WHERE id IN (${placeholders})`,
    params: [...userIds]
  };
}

function customSql(customIds: readonly string[]): { sql: string; params: string[] } {
  if (customIds.length === 0) {
    return {
      sql: `SELECT id, nickname, avatar_color, deleted_at FROM ${CUSTOM_PLAYERS_TABLE} WHERE 1 = 0`,
      params: []
    };
  }
  const placeholders = customIds.map(() => '?').join(', ');
  return {
    sql: `SELECT id, nickname, avatar_color, deleted_at FROM ${CUSTOM_PLAYERS_TABLE} WHERE id IN (${placeholders})`,
    params: [...customIds]
  };
}

export function useParticipantResolver(
  participantKeys: readonly string[]
): Map<string, ResolvedParticipant> {
  const system = useSystem();

  const parsed = React.useMemo(
    () => participantKeys.map(parseParticipantKey),
    [participantKeys]
  );

  // Bucket by kind, dedup so each PowerSync IN-clause has a clean set.
  const userIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of parsed) if (p.kind === 'user') set.add(p.userId);
    // Sort so the SQL string is stable across renders with the same
    // members — avoids resubscribing the PowerSync watch.
    return Array.from(set).sort();
  }, [parsed]);

  const customIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of parsed) if (p.kind === 'custom') set.add(p.customPlayerId);
    return Array.from(set).sort();
  }, [parsed]);

  const profileQuery = React.useMemo(() => profileSql(userIds), [userIds]);
  const customQuery = React.useMemo(() => customSql(customIds), [customIds]);

  const { data: profileRows } = useQuery<ProfileRecord & { id: string }>(
    profileQuery.sql,
    profileQuery.params
  );
  const { data: customRows } = useQuery<CustomPlayerRecord & { id: string }>(
    customQuery.sql,
    customQuery.params
  );

  const profileById = React.useMemo(() => {
    const m = new Map<string, ProfileRecord & { id: string }>();
    for (const r of profileRows) m.set(r.id, r);
    return m;
  }, [profileRows]);

  const customById = React.useMemo(() => {
    const m = new Map<string, CustomPlayerRecord & { id: string }>();
    for (const r of customRows) m.set(r.id, r);
    return m;
  }, [customRows]);

  // Tier 2 — direct Supabase fetch for user ids not in local SQLite.
  const [fetched, setFetched] = React.useState<Map<string, FetchedProfile>>(
    new Map()
  );

  const missingUserIds = React.useMemo(() => {
    return userIds.filter((id) => !profileById.has(id) && !fetched.has(id));
  }, [userIds, profileById, fetched]);

  React.useEffect(() => {
    if (missingUserIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await system.supabaseConnector.client
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .in('user_id', missingUserIds);
      if (cancelled) return;
      // Mark every requested id one way or another so we don't loop
      // re-fetching on each render.
      const found = new Map<string, FetchedProfile>();
      if (!error && data) {
        for (const row of data as {
          user_id: string;
          handle: string;
          display_name: string;
          avatar_color: string;
        }[]) {
          found.set(row.user_id, {
            userId: row.user_id,
            handle: row.handle,
            displayName: row.display_name,
            avatarColor: row.avatar_color
          });
        }
      } else if (error) {
        console.warn('[participantResolver] profile fetch failed:', error);
      }
      setFetched((prev) => {
        const next = new Map(prev);
        for (const id of missingUserIds) {
          next.set(id, found.get(id) ?? null);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [missingUserIds, system]);

  return React.useMemo(() => {
    const out = new Map<string, ResolvedParticipant>();
    for (const p of parsed) {
      if (p.kind === 'user') {
        const key = userParticipantKey(p.userId);
        const local = profileById.get(p.userId);
        if (local) {
          out.set(key, {
            participantKey: key,
            displayName: local.display_name ?? '',
            avatarColor: local.avatar_color ?? PLACEHOLDER_AVATAR_COLOR,
            userId: p.userId,
            handle: local.handle ?? undefined,
            fallback: false
          });
          continue;
        }
        const remote = fetched.get(p.userId);
        if (remote) {
          out.set(key, {
            participantKey: key,
            displayName: remote.displayName,
            avatarColor: remote.avatarColor,
            userId: p.userId,
            handle: remote.handle,
            fallback: false
          });
          continue;
        }
        out.set(key, {
          participantKey: key,
          displayName: 'Player',
          avatarColor: PLACEHOLDER_AVATAR_COLOR,
          userId: p.userId,
          fallback: true
        });
      } else if (p.kind === 'custom') {
        const key = customParticipantKey(p.customPlayerId);
        const row = customById.get(p.customPlayerId);
        if (row) {
          out.set(key, {
            participantKey: key,
            displayName: row.nickname ?? '',
            avatarColor: row.avatar_color ?? PLACEHOLDER_AVATAR_COLOR,
            fallback: false
          });
          continue;
        }
        // Custom row not yet synced (e.g., very first launch before
        // initial sync completes). Falls back to a placeholder; the
        // resolver re-renders once the row lands.
        out.set(key, {
          participantKey: key,
          displayName: 'Removed player',
          avatarColor: PLACEHOLDER_AVATAR_COLOR,
          fallback: true
        });
      } else {
        // Legacy unprefixed seed id — pre-Phase-7 scorecards.
        const seed = findSeedPlayer(p.rawId);
        out.set(p.rawId, {
          participantKey: p.rawId,
          displayName: seed?.nickname ?? 'Player',
          avatarColor: seed?.color ?? PLACEHOLDER_AVATAR_COLOR,
          fallback: !seed
        });
      }
    }
    return out;
  }, [parsed, profileById, fetched, customById]);
}
