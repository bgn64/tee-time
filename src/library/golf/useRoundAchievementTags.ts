/**
 * Achievement tags — local data layer for a single round.
 *
 * Read path: `useRoundAchievementTags(roundId)` watches the local
 * `scorecard_achievement_tags` table via PowerSync `useQuery`,
 * parses each row's `tags` JSON column, and returns a memoised
 * tuple lookup `getTags(scorerId, holeNumber)`.
 *
 * Write path: `toggleTag(scorerId, holeNumber, tagKey)` performs a
 * read-modify-write on the row (creating it with the single key
 * if absent, removing the key if already present). The PowerSync
 * connector uploads asynchronously; RLS server-side ensures the
 * write goes against the owner's row only. Used by the scoring
 * surface (write) and feed surfaces (read only).
 *
 * No coupling to RoundContext — this hook works for any round id
 * (in-flight on the scoring tab, completed on a previous-round
 * route, or a friend's round in the feed). Writes only succeed when
 * the signed-in user is the round owner (server RLS); read access
 * follows whichever sync stream the row landed via.
 */

import { useQuery } from '@powersync/react';
import { useCallback, useMemo, useRef } from 'react';

import { type TagKey, type TagRow, tagsForHole } from '@/library/golf/achievementTags';
import { newAchievementTagId } from '@/library/golf/ids';
import {
  SCORECARD_ACHIEVEMENT_TAGS_TABLE,
  type ScorecardAchievementTagRecord,
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import { useAccount } from '@/library/social/AccountContext';

export type UseRoundAchievementTagsResult = {
  rows: readonly TagRow[];
  getTags: (scorerId: string, holeNumber: number) => readonly TagKey[];
  /**
   * Toggle one tag for a (scorer, hole) tuple. No-op if there's no
   * round id, no signed-in user, or a previous toggle for the same
   * tuple is still in flight.
   */
  toggleTag: (
    scorerId: string,
    holeNumber: number,
    tagKey: TagKey
  ) => Promise<void>;
};

function parseTagsValue(raw: unknown): TagKey[] {
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((k): k is TagKey => typeof k === 'string');
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    return raw.filter((k): k is TagKey => typeof k === 'string');
  }
  return [];
}

export function useRoundAchievementTags(
  roundId: string | null
): UseRoundAchievementTagsResult {
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  // Map keyed by `${scorerId}::${holeNumber}` so concurrent toggles
  // on different cells don't block each other.
  const inFlight = useRef<Set<string>>(new Set());

  const { data } = useQuery<ScorecardAchievementTagRecord & { id: string }>(
    roundId
      ? `SELECT * FROM ${SCORECARD_ACHIEVEMENT_TAGS_TABLE} WHERE scorecard_id = ?`
      : `SELECT * FROM ${SCORECARD_ACHIEVEMENT_TAGS_TABLE} WHERE 1 = 0`,
    roundId ? [roundId] : []
  );

  const rows = useMemo<TagRow[]>(() => {
    const out: TagRow[] = [];
    for (const row of data) {
      if (!row.scorer_id || row.hole_number == null) continue;
      out.push({
        scorer_id: row.scorer_id,
        hole_number: row.hole_number,
        tags: parseTagsValue(row.tags),
      });
    }
    return out;
  }, [data]);

  // Keep the raw rows around with their ids for the write path.
  const idByTuple = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of data) {
      if (!row.scorer_id || row.hole_number == null) continue;
      m.set(`${row.scorer_id}::${row.hole_number}`, row.id);
    }
    return m;
  }, [data]);

  const getTags = useCallback(
    (scorerId: string, holeNumber: number) =>
      tagsForHole(rows, scorerId, holeNumber),
    [rows]
  );

  const toggleTag = useCallback<UseRoundAchievementTagsResult['toggleTag']>(
    async (scorerId, holeNumber, tagKey) => {
      if (!roundId || !signedInUserId) return;
      const guardKey = `${scorerId}::${holeNumber}::${tagKey}`;
      if (inFlight.current.has(guardKey)) return;
      inFlight.current.add(guardKey);
      try {
        const tupleKey = `${scorerId}::${holeNumber}`;
        const rowId = idByTuple.get(tupleKey);
        const current = getTags(scorerId, holeNumber);
        const has = current.includes(tagKey);
        const next: TagKey[] = has
          ? current.filter((k) => k !== tagKey)
          : [...current, tagKey];
        const now = new Date().toISOString();
        const json = JSON.stringify(next);
        if (rowId) {
          await system.powersync.execute(
            `UPDATE ${SCORECARD_ACHIEVEMENT_TAGS_TABLE}
               SET tags = ?, updated_at = ?
               WHERE id = ?`,
            [json, now, rowId]
          );
        } else {
          // Use the dedicated achievement-tag id generator. The
          // server-side trigger fills in owner_user_id from the
          // parent scorecard row.
          const id = newAchievementTagId();
          await system.powersync.execute(
            `INSERT INTO ${SCORECARD_ACHIEVEMENT_TAGS_TABLE}
               (id, scorecard_id, owner_user_id, scorer_id, hole_number, tags, updated_at)
             VALUES (?, ?, NULL, ?, ?, ?, ?)`,
            [id, roundId, scorerId, holeNumber, json, now]
          );
        }
      } finally {
        inFlight.current.delete(guardKey);
      }
    },
    [roundId, signedInUserId, idByTuple, getTags, system]
  );

  return { rows, getTags, toggleTag };
}
