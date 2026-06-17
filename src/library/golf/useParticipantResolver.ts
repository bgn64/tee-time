/**
 * useParticipantResolver — resolves display info for a list of
 * scorecard participants.
 *
 * Lookup tiers:
 *
 *   Tier 1 (Supabase REST via React Query):
 *     · `user:{uid}` → `profiles WHERE user_id IN (...)`. RLS
 *       determines which profiles are visible. The REST table is keyed
 *       by `user_id`.
 *     · `custom:{cid}` → `custom_players WHERE id IN (...)`. Fetches
 *       matching rows, including soft-deleted ones — the resolver
 *       intentionally does NOT filter `deleted_at`, so historic
 *       scorecards keep rendering deleted players.
 *
 *   Tier 2a (round participant snapshot):
 *     For `custom:{cid}` keys whose REST row is unavailable — the
 *     friend-feed case, where the owner's custom_players rows may not
 *     be visible to me. The `participants` JSON on the
 *     scorecard carries a `localDisplayName` + `localDisplayColor`
 *     snapshot captured at startRound time. Passed in via the
 *     `participantSnapshots` arg.
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
 * (offline + ex-friend, or custom player whose row is unavailable).
 * UI can render the placeholder
 * "Player" / "Removed player" labels without crashing.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { findSeedPlayer } from '@/data/players';
import { supabase } from '@/library/supabase/client';
import type { Round } from '@/types/golf';
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
  /** True when no REST row or snapshot was found — UI shows a placeholder. */
  fallback: boolean;
};

type ProfileRow = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_color: string | null;
};

type CustomPlayerRow = {
  id: string;
  nickname: string | null;
  avatar_color: string | null;
  deleted_at: string | null;
};

const PLACEHOLDER_AVATAR_COLOR = '#888888';

export function useParticipantResolver(
  participantKeys: readonly string[],
  /**
   * Optional snapshot map keyed by participantKey. Populated by
   * callers that have a `Round` in hand (with its `participants`
   * array). Used as a Tier 2a fallback for `custom:` participants
   * whose REST row is unavailable (the friend-feed case).
   */
  participantSnapshots?: ReadonlyMap<string, { displayName?: string; avatarColor?: string }>
): Map<string, ResolvedParticipant> {
  const parsed = React.useMemo(
    () => participantKeys.map(parseParticipantKey),
    [participantKeys]
  );

  // Bucket by kind and dedup so each REST IN-clause has a clean set.
  const userIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of parsed) if (p.kind === 'user') set.add(p.userId);
    // Sort so React Query keys are stable across renders with the same members.
    return Array.from(set).sort();
  }, [parsed]);

  const customIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of parsed) if (p.kind === 'custom') set.add(p.customPlayerId);
    return Array.from(set).sort();
  }, [parsed]);

  const { data: profileRows = [] } = useQuery<ProfileRow[]>({
    queryKey: ['profiles', ...userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .in('user_id', userIds);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    }
  });

  const { data: customRows = [] } = useQuery<CustomPlayerRow[]>({
    queryKey: ['custom_players', ...customIds],
    enabled: customIds.length > 0,
    queryFn: async () => {
      if (customIds.length === 0) return [];
      const { data, error } = await supabase
        .from('custom_players')
        .select('id, nickname, avatar_color, deleted_at')
        .in('id', customIds);
      if (error) throw error;
      return (data ?? []) as CustomPlayerRow[];
    }
  });

  const profileById = React.useMemo(() => {
    const m = new Map<string, ProfileRow>();
    for (const r of profileRows) m.set(r.user_id, r);
    return m;
  }, [profileRows]);

  const customById = React.useMemo(() => {
    const m = new Map<string, CustomPlayerRow>();
    for (const r of customRows) m.set(r.id, r);
    return m;
  }, [customRows]);

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
        // Tier 2a — snapshot from the round's participants JSON.
        // Covers the friend-feed case (the owner's custom_players
        // rows may not be visible, so the live row is unavailable but the
        // round-time snapshot is).
        const snap = participantSnapshots?.get(key);
        if (snap && (snap.displayName || snap.avatarColor)) {
          out.set(key, {
            participantKey: key,
            displayName: snap.displayName ?? '',
            avatarColor: snap.avatarColor || PLACEHOLDER_AVATAR_COLOR,
            fallback: false
          });
          continue;
        }
        // Custom row not returned by REST. Falls back to a placeholder;
        // the resolver re-renders if a later query returns the row.
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
  }, [parsed, profileById, customById, participantSnapshots]);
}

/**
 * Builds the Tier-2a snapshot map the resolver consults for `custom:`
 * participants whose live `custom_players` row isn't visible — the
 * friend-feed case, where the owner's `custom_players` rows don't sync
 * via RLS. Reads each round's `participants` JSON snapshot
 * (`localDisplayName` / `localDisplayColor`) captured at startRound
 * time. Last write wins across rounds: the snapshot is just a
 * name + color for a participantKey, so any one is representative.
 */
export function collectParticipantSnapshots(
  rounds: readonly Round[]
): Map<string, { displayName?: string; avatarColor?: string }> {
  const m = new Map<string, { displayName?: string; avatarColor?: string }>();
  for (const r of rounds) {
    for (const p of r.participants ?? []) {
      if (!p.localDisplayName && !p.localDisplayColor) continue;
      m.set(p.participantKey, {
        displayName: p.localDisplayName,
        avatarColor: p.localDisplayColor
      });
    }
  }
  return m;
}

/**
 * Resolver variant for callers that have a `Round` in hand. Threads
 * the round's own custom-player snapshots into the resolver so a
 * friend viewing the round (whose `custom_players` rows don't sync)
 * sees the owner's nickname for each custom player instead of the
 * "Removed player" placeholder.
 */
export function useRoundParticipantResolver(
  round: Round
): Map<string, ResolvedParticipant> {
  const snapshots = React.useMemo(
    () => collectParticipantSnapshots([round]),
    [round]
  );
  return useParticipantResolver(round.playerIds ?? [], snapshots);
}
