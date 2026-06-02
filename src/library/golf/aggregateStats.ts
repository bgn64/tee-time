/**
 * Aggregate stat derivation — pure functions that fold the
 * per-(scorer, hole) tag rows into round-level counts for the
 * Summary tab tiles.
 *
 * For the four default tags (Fairway / GIR / OB / Sand Trap) we
 * produce both a numerator (count of holes where the tag is set)
 * and, where it makes sense, a denominator:
 *
 *   - **Fairway** : x of (non-par-3 in-range holes that have a tag row).
 *     Par-3s never count toward "fairway in regulation" by definition
 *     (no fairway shot). Holes the scorer hasn't recorded any tags
 *     on don't count toward the denominator either — we don't want
 *     to penalise scorers who entered tags for only a subset.
 *   - **GIR**     : x of (in-range holes that have a tag row).
 *   - **OB**      : count of in-range holes with the `ob` tag.
 *   - **Sand**    : count of in-range holes with the `sand_trap` tag.
 *
 * Returned shape mirrors what `SummaryAggregateTiles` consumes —
 * `{ value, denom? }` per metric, computed only from the scorer's
 * tag rows + the round's holesInRange. No PowerSync queries here.
 */

import { type TagKey, type TagRow } from './achievementTags';
import type { Hole } from '@/types/golf';

export type AggregateTile = {
  label: string;
  /** Numerator value (always present). */
  value: number;
  /**
   * Optional denominator for the "x/y" format. Omitted for raw
   * counts (OB, Sand) that don't have a natural denominator.
   */
  denom?: number;
};

export type ScorerAggregates = {
  fairways: AggregateTile;
  gir: AggregateTile;
  ob: AggregateTile;
  sand: AggregateTile;
};

/**
 * Compute the four default aggregates for a single scorer, scoped
 * to the given in-range holes.
 */
export function computeScorerAggregates(
  rows: readonly TagRow[],
  scorerId: string,
  holesInRange: readonly Hole[]
): ScorerAggregates {
  const allowedHoles = new Set(holesInRange.map((h) => h.number));
  const parByHole = new Map<number, number>();
  for (const h of holesInRange) parByHole.set(h.number, h.par);

  // Build a per-scorer-hole tag-set view restricted to in-range holes.
  const scorerRows = rows.filter(
    (r) => r.scorer_id === scorerId && allowedHoles.has(r.hole_number)
  );

  // Denominator for FIR / GIR: only holes the scorer recorded tags
  // on (i.e. they were paying attention to that hole). FIR also
  // excludes par-3s.
  let girDenom = 0;
  let fairwayDenom = 0;
  let girNum = 0;
  let fairwayNum = 0;
  let obCount = 0;
  let sandCount = 0;

  for (const row of scorerRows) {
    girDenom += 1;
    const par = parByHole.get(row.hole_number);
    const isPar3 = par === 3;
    if (!isPar3) fairwayDenom += 1;

    const tagSet = new Set<TagKey>(row.tags);
    if (tagSet.has('gir')) girNum += 1;
    if (tagSet.has('fairway') && !isPar3) fairwayNum += 1;
    if (tagSet.has('ob')) obCount += 1;
    if (tagSet.has('sand_trap')) sandCount += 1;
  }

  return {
    fairways: { label: 'Fairways', value: fairwayNum, denom: fairwayDenom },
    gir: { label: 'GIR', value: girNum, denom: girDenom },
    ob: { label: 'OB', value: obCount },
    sand: { label: 'Sand', value: sandCount },
  };
}

/**
 * Filter aggregates by the scorer's enabled-tags set. Returns ONLY
 * the tiles whose underlying tag is enabled, in canonical order
 * (Fairways → GIR → OB → Sand). Disabled stats are dropped entirely
 * — the caller should hide the whole tile strip when the returned
 * array is empty so a scorer who's opted every stat off doesn't see
 * a row of "0/0" placeholders.
 */
export function filterAggregatesByEnabled(
  aggregates: ScorerAggregates,
  enabled: readonly TagKey[]
): AggregateTile[] {
  const enabledSet = new Set(enabled);
  const out: AggregateTile[] = [];
  if (enabledSet.has('fairway')) out.push(aggregates.fairways);
  if (enabledSet.has('gir')) out.push(aggregates.gir);
  if (enabledSet.has('ob')) out.push(aggregates.ob);
  if (enabledSet.has('sand_trap')) out.push(aggregates.sand);
  return out;
}
