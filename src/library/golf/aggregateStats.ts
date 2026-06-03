/**
 * Aggregate stat derivation — pure functions that fold the
 * per-(scorer, hole) tag rows into round-level counts for the
 * Summary tab tiles.
 *
 * Three-state semantics: each tracked tag for a hole is either 'yes',
 * 'no', or unset. Numerators count holes where the tag is 'yes';
 * denominators count holes where the tag has an explicit value
 * (yes OR no — unset doesn't contribute to the rate). This matches
 * the user's mental model — "I committed to tracking fairways, so my
 * FIR rate is computed against the holes I actually filled in".
 *
 * Tile breakdown:
 *   - Fairway : 'yes' count over (non-par-3) holes with a value.
 *   - GIR     : 'yes' count over holes with a value.
 *   - OB      : 'yes' count. No denominator — raw occurrence count.
 *   - Sand    : 'yes' count. No denominator — raw occurrence count.
 */

import {
  type TagRow,
  type TagKey,
} from './achievementTags';
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

  // Holes with at least one tracked-stat value entered, for the
  // scorer, within the active hole range.
  const scorerRows = rows.filter(
    (r) => r.scorer_id === scorerId && allowedHoles.has(r.hole_number)
  );

  let girDenom = 0;
  let fairwayDenom = 0;
  let girNum = 0;
  let fairwayNum = 0;
  let obCount = 0;
  let sandCount = 0;

  for (const row of scorerRows) {
    const par = parByHole.get(row.hole_number);
    const isPar3 = par === 3;

    // Fairway: denominator excludes par-3s (no fairway shot exists).
    const fwVal = row.values.fairway;
    if (fwVal === 'yes' || fwVal === 'no') {
      if (!isPar3) {
        fairwayDenom += 1;
        if (fwVal === 'yes') fairwayNum += 1;
      }
    }

    const girVal = row.values.gir;
    if (girVal === 'yes' || girVal === 'no') {
      girDenom += 1;
      if (girVal === 'yes') girNum += 1;
    }

    if (row.values.ob === 'yes') obCount += 1;
    if (row.values.sand_trap === 'yes') sandCount += 1;
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
