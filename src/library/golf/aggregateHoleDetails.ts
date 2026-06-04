/**
 * aggregateHoleDetails — pure functions that fold the
 * per-(scorer, hole) details rows into round-level numbers for
 * the Summary tab tiles.
 *
 * Aggregation rules are per-type, not per-stat:
 *
 *   - Binary:
 *       numerator   = count of holes where value is true
 *       denominator = count of holes where value is true OR false
 *       Unset holes don't contribute either way. The tile renders
 *       `N/M`; the rate is `N/M` when `M > 0`.
 *
 *   - Integer:
 *       sum             = sum of integer values across tagged holes
 *       taggedCount     = number of applicable holes with any value
 *       totalApplicable = number of applicable holes (whether tagged
 *                         or not) — drives the "thru K holes"
 *                         sub-line during partial rounds
 *
 * "Applicable" honors the stat's `appliesToPar` filter — fairway
 * never counts par-3 holes toward either numerator or denominator
 * because FIR's pill is never shown on those holes.
 */

import {
  appliesToHole,
  type BinaryStatDefinition,
  type IntegerStatDefinition,
} from './builtInStats';
import type { Hole } from '@/types/golf';
import type { HoleDetailsRow } from './useRoundHoleDetails';

export type BinaryAggregate = {
  num: number;
  denom: number;
  /**
   * Holes where this stat could be asked (post par-filter). Lets
   * the tile renderer distinguish "0/0 — no applicable holes"
   * (e.g., FIR on a par-3-only round) from "0/0 — user hasn't
   * tagged anything yet".
   */
  totalApplicable: number;
};

export type IntegerAggregate = {
  sum: number;
  taggedCount: number;
  totalApplicable: number;
};

/**
 * Holes from `holesInRange` that this stat applies to. Used as the
 * universe for both numerator/denominator scoping and for the
 * partial-round sub-line context on integer tiles.
 */
export function applicableHoles(
  stat: BinaryStatDefinition | IntegerStatDefinition,
  holesInRange: readonly Hole[]
): Hole[] {
  return holesInRange.filter((h) => appliesToHole(stat, h));
}

/**
 * Binary aggregation. Walks the scorer's rows once, filtering to
 * the stat's applicable holes (via the par-set on the stat
 * definition).
 */
export function aggregateBinary(
  rows: readonly HoleDetailsRow[],
  scorerId: string,
  stat: BinaryStatDefinition,
  holesInRange: readonly Hole[]
): BinaryAggregate {
  const applicable = applicableHoles(stat, holesInRange);
  const applicableSet = new Set(applicable.map((h) => h.number));
  let num = 0;
  let denom = 0;
  for (const r of rows) {
    if (r.scorer_id !== scorerId) continue;
    if (!applicableSet.has(r.hole_number)) continue;
    const v = r.values[stat.key];
    if (v === true) {
      num += 1;
      denom += 1;
    } else if (v === false) {
      denom += 1;
    }
  }
  return { num, denom, totalApplicable: applicable.length };
}

/**
 * Integer aggregation. `sum` is over the values present;
 * `taggedCount` counts applicable holes that have a numeric value
 * (regardless of whether it's zero); `totalApplicable` is the
 * universe of holes this stat could be asked about.
 *
 * Note on zero values: a hole with `value === 0` IS tagged and
 * contributes to `taggedCount` (and adds 0 to `sum`). This matters
 * for the "thru K holes" sub-line — entering `0 OB` on hole 5 is
 * an explicit fact, not a missing data point.
 */
export function aggregateInteger(
  rows: readonly HoleDetailsRow[],
  scorerId: string,
  stat: IntegerStatDefinition,
  holesInRange: readonly Hole[]
): IntegerAggregate {
  const applicable = applicableHoles(stat, holesInRange);
  const applicableSet = new Set(applicable.map((h) => h.number));
  let sum = 0;
  let taggedCount = 0;
  for (const r of rows) {
    if (r.scorer_id !== scorerId) continue;
    if (!applicableSet.has(r.hole_number)) continue;
    const v = r.values[stat.key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v;
      taggedCount += 1;
    }
  }
  return { sum, taggedCount, totalApplicable: applicable.length };
}
