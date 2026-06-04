/**
 * Built-in stat registry — single source of truth for per-hole
 * detail stats the app knows how to render and aggregate.
 *
 * The registry is intentionally TypeScript-only for now. Storage
 * (`scorecard_hole_details.details`) is open — any stat_key string
 * may be written. The registry defines:
 *
 *   - Which built-in stats exist for v1 (GIR, FIR, Putts, OB).
 *   - Per-stat metadata: type (binary | integer), par applicability,
 *     tone (drives tile + pill color), default-enabled flag, and
 *     for integer stats the quick-pick values for the chip row.
 *
 * Future work: a `stat_definitions` table can layer user-defined
 * custom stats on top without any storage migration — the
 * generic engine here handles arbitrary stat_keys as long as they
 * conform to the two primitive types.
 *
 * What's intentionally NOT in the registry:
 *
 *   - Aggregation formula. Binary stats always aggregate as
 *     `count(true) / count(true | false)`; integer stats always
 *     aggregate as `sum`. One rule per type, declared in the
 *     aggregate helpers — not per stat.
 *
 *   - "Complex" stats whose value isn't a scalar (e.g., scramble
 *     shot attribution which stores an ordered list of player
 *     refs). Those keep their own dedicated tables + hooks.
 */

import type { Hole } from '@/types/golf';

export type StatKey = string;

export type StatTone = 'good' | 'bad' | 'neutral';

type BaseStatDefinition = {
  key: StatKey;
  /** Display label, e.g. "GIR". */
  label: string;
  /**
   * Pars this stat applies to. Omit (or empty array) = applies to
   * every hole. Example: `[4, 5]` for FIR — no fairway shot on a
   * par-3.
   */
  appliesToPar?: readonly number[];
  /** True = stat is part of the default-enabled set offered at round creation. */
  defaultEnabled: boolean;
};

export type BinaryStatDefinition = BaseStatDefinition & {
  type: 'binary';
  /**
   * Tone applied to the "yes" outcome. "No" is implicit:
   *   yesTone='good' → selected Yes = positive, selected No = muted
   *   yesTone='bad'  → selected Yes = negative, selected No = positive
   *   yesTone='neutral' → both Yes and No render muted (factual)
   */
  yesTone: StatTone;
};

export type IntegerStatDefinition = BaseStatDefinition & {
  type: 'integer';
  /**
   * Quick-pick values surfaced as chips in the per-hole input
   * row. The custom-value sheet ("x" button) handles values
   * outside this set.
   */
  quickPicks: readonly number[];
  /**
   * Tone applied to the aggregate tile (the sum). Per-hole
   * integer chips are always neutrally styled — value-by-value
   * tone (e.g. "1 putt = good, 4 putts = bad") is deferred.
   *   'good'    : tile colored positively when sum > 0
   *   'bad'     : tile colored negatively when sum > 0
   *   'neutral' : tile uncolored; the number speaks for itself
   */
  aggregateTone: StatTone;
};

export type StatDefinition = BinaryStatDefinition | IntegerStatDefinition;

export type StatValue = boolean | number;

/**
 * The map shape stored under `scorecard_hole_details.details`.
 * Absence of a key = unset for that stat on that (scorer, hole)
 * tuple. The DB column is open; this type describes the in-memory
 * representation after parsing the JSONB blob.
 */
export type StatValueMap = { [K in StatKey]?: StatValue };

/**
 * v1 built-in stat set. Order matters: it's the canonical order
 * used by the round-creation picker and the Summary tile strip.
 * Insertions or reorderings here propagate to every consumer.
 */
export const BUILT_IN_STATS: readonly StatDefinition[] = [
  {
    key: 'gir',
    label: 'GIR',
    type: 'binary',
    yesTone: 'good',
    defaultEnabled: true,
  },
  {
    key: 'fir',
    label: 'FIR',
    type: 'binary',
    yesTone: 'good',
    appliesToPar: [4, 5],
    defaultEnabled: true,
  },
  {
    key: 'putts',
    label: 'Putts',
    type: 'integer',
    quickPicks: [1, 2, 3],
    aggregateTone: 'neutral',
    defaultEnabled: true,
  },
  {
    key: 'ob',
    label: 'OB',
    type: 'integer',
    quickPicks: [0, 1, 2],
    aggregateTone: 'bad',
    defaultEnabled: true,
  },
];

const BUILT_IN_STATS_BY_KEY: ReadonlyMap<StatKey, StatDefinition> = new Map(
  BUILT_IN_STATS.map((s) => [s.key, s])
);

export function getStat(key: StatKey): StatDefinition | undefined {
  return BUILT_IN_STATS_BY_KEY.get(key);
}

/**
 * The default-enabled set offered at round creation — the keys of
 * every built-in stat marked `defaultEnabled: true`, in canonical
 * registry order.
 */
export function defaultEnabledStatKeys(): readonly StatKey[] {
  return BUILT_IN_STATS.filter((s) => s.defaultEnabled).map((s) => s.key);
}

/**
 * Does this stat apply to the given hole? True when the stat has
 * no `appliesToPar` restriction or the hole's par is in the list.
 */
export function appliesToHole(
  stat: StatDefinition,
  hole: Pick<Hole, 'par'>
): boolean {
  if (!stat.appliesToPar || stat.appliesToPar.length === 0) return true;
  return stat.appliesToPar.includes(hole.par);
}

/**
 * Has this stat been entered for the given value map? An entry is
 * considered "complete" when the key is present with a non-null
 * value of the right primitive shape.
 */
export function isStatEntered(
  stat: StatDefinition,
  values: StatValueMap
): boolean {
  const raw = values[stat.key];
  if (raw === undefined || raw === null) return false;
  if (stat.type === 'binary') return typeof raw === 'boolean';
  return typeof raw === 'number' && Number.isFinite(raw);
}

/**
 * Sequence of stats applicable to a hole, in registry order,
 * filtered by both the round's enabled set and the hole's par.
 */
export function applicableStatsForHole(
  enabledKeys: readonly StatKey[],
  hole: Pick<Hole, 'par'>
): StatDefinition[] {
  const enabled = new Set(enabledKeys);
  const out: StatDefinition[] = [];
  for (const stat of BUILT_IN_STATS) {
    if (!enabled.has(stat.key)) continue;
    if (!appliesToHole(stat, hole)) continue;
    out.push(stat);
  }
  return out;
}
