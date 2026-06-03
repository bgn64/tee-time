/**
 * Achievement tags — the per-(scorer, hole) opt-in metrics that
 * power the Holes-tab detail accordion and the Summary-tab
 * aggregate tiles.
 *
 * The canonical set + their groupings + defaults are encoded here
 * (not in the database) so a new tag can be shipped purely as a
 * client release without a schema migration. The `default` flag
 * controls which tags appear in the scoring UI for every scorer
 * unless they opt out via the gear toggle (Phase 5).
 *
 * Storage shape: a `scorecard_achievement_tags` row keyed by
 * `(scorecard_id, scorer_id, hole_number)` carries a `tags: TagKey[]`
 * jsonb array. Absence of a row for a (scorer, hole) tuple means
 * "untapped" — never "skipped" or "no data". Tap → row exists with
 * the key in the array; un-tap → key removed from the array; empty
 * array → row stays with no keys (still distinct from "row absent",
 * which is the "untapped from new" state).
 */

import type { ScoringRule } from '@/types/golf';

export type TagKey =
  | 'fairway'
  | 'gir'
  | 'two_putt'
  | 'sand_save'
  | 'up_and_down'
  | 'ob'
  | 'sand_trap'
  | 'penalty'
  | 'whose_shots';

export type TagGroup = 'did_well' | 'hurt_me' | 'scramble_only';

export type AchievementTag = {
  key: TagKey;
  group: TagGroup;
  /** Display label for the chip. */
  label: string;
  /** True when this tag is on by default for new rounds. */
  default: boolean;
  /** True when the tag only applies to scramble rounds. */
  scrambleOnly?: boolean;
};

/**
 * The full set of tags the app knows how to render and aggregate.
 * Adding a new tag here is enough for it to appear in the Phase 5
 * gear filter; the migration doesn't need to change.
 *
 * Default-on set (Q5 / mockup §6):
 *   - Fairway in Regulation
 *   - Green in Regulation
 *   - Out of Bounds
 *   - Sand Trap
 *   - Whose shots (scramble only)
 */
export const ACHIEVEMENT_TAGS: readonly AchievementTag[] = [
  // Did well
  { key: 'fairway',     group: 'did_well', label: 'Fairway',     default: true },
  { key: 'gir',         group: 'did_well', label: 'GIR',         default: true },
  { key: 'two_putt',    group: 'did_well', label: '\u2264 2 putts', default: false },
  { key: 'sand_save',   group: 'did_well', label: 'Sand save',   default: false },
  { key: 'up_and_down', group: 'did_well', label: 'Up & down',   default: false },

  // Hurt me
  { key: 'ob',          group: 'hurt_me',  label: 'OB',          default: true },
  { key: 'sand_trap',   group: 'hurt_me',  label: 'Sand trap',   default: true },
  { key: 'penalty',     group: 'hurt_me',  label: 'Penalty',     default: false },

  // Scramble only
  { key: 'whose_shots', group: 'scramble_only', label: 'Whose shots', default: true, scrambleOnly: true },
];

const ACHIEVEMENT_TAGS_BY_KEY: ReadonlyMap<TagKey, AchievementTag> = new Map(
  ACHIEVEMENT_TAGS.map((t) => [t.key, t])
);

export function getTag(key: TagKey): AchievementTag | undefined {
  return ACHIEVEMENT_TAGS_BY_KEY.get(key);
}

/**
 * The default-enabled set for a fresh round, scoped to the round's
 * scoring rule. `whose_shots` only shows up in scramble.
 */
export function defaultEnabledTagsFor(
  scoringRule: ScoringRule
): readonly TagKey[] {
  const out: TagKey[] = [];
  for (const t of ACHIEVEMENT_TAGS) {
    if (!t.default) continue;
    if (t.scrambleOnly && scoringRule !== 'scramble') continue;
    out.push(t.key);
  }
  return out;
}

/**
 * The set of tags that should appear in the per-scorer Detail
 * accordion for a given round + scorer. Phase 4 just returns the
 * `defaultEnabledTagsFor(scoringRule)` set; Phase 5 layers a
 * per-(scorer, round) override on top via
 * `effectiveEnabledTags(defaults, overrideRow)`.
 *
 * Override storage convention (per Q5 decision):
 *   - No override row exists       → use defaults
 *   - Override row with empty list → scorer turned every tag off
 *   - Override row with a list     → use that list verbatim
 */
export function effectiveEnabledTags(
  scoringRule: ScoringRule,
  override?: { enabledTags?: readonly TagKey[] } | null
): readonly TagKey[] {
  if (!override) return defaultEnabledTagsFor(scoringRule);
  // Explicit empty list = "scorer turned every tag off"; respect it.
  return override.enabledTags ?? defaultEnabledTagsFor(scoringRule);
}

/**
 * Per-(scorer, hole) tag values. The new 3-state model:
 *   - 'yes'   : the outcome happened (Fairway hit, OB hit, etc.)
 *   - 'no'    : the outcome explicitly did NOT happen
 *   - absent  : not yet entered — UI renders the pill as "unset"
 *
 * Storage shape evolved from a simple `tags: TagKey[]` array to a
 * `{ [TagKey]: 'yes' | 'no' }` object. The reader auto-detects both
 * shapes so existing rounds (where tapping = "this happened") keep
 * rendering — every legacy entry is normalised to 'yes' which matches
 * the original semantics (did_well + tap = positive event; hurt_me +
 * tap = negative event happened). The writer always produces the new
 * object shape.
 */
export type TagValue = 'yes' | 'no';
export type TagValueMap = { [K in TagKey]?: TagValue };

export type TagRow = {
  scorer_id: string;
  hole_number: number;
  values: TagValueMap;
};

/**
 * Look up the values map for a (scorer, hole) tuple. Returns an empty
 * object when no row matches.
 */
export function valuesForHole(
  rows: readonly TagRow[],
  scorerId: string,
  holeNumber: number
): TagValueMap {
  for (const row of rows) {
    if (row.scorer_id === scorerId && row.hole_number === holeNumber) {
      return row.values;
    }
  }
  return {};
}

/**
 * Map a (group, value) pair to the outcome tone. "good" means the
 * cell should render in the positive palette (green), "bad" in the
 * negative palette (red). The tone is what the user cares about —
 * whether the value is good or bad for their round — not what they
 * literally tapped. Did-well groups behave the obvious way; hurt-me
 * groups flip ('yes' = bad thing happened, 'no' = bad thing didn't).
 */
export function valueTone(
  group: TagGroup,
  value: TagValue
): 'good' | 'bad' {
  if (group === 'hurt_me') {
    return value === 'yes' ? 'bad' : 'good';
  }
  // did_well + scramble_only
  return value === 'yes' ? 'good' : 'bad';
}

/**
 * Cycle a pill's value: unset → yes → no → unset. Used by the
 * single-toggle stat pill on the Holes editing surface.
 */
export function cycleTagValue(current: TagValue | undefined): TagValue | undefined {
  if (current === undefined) return 'yes';
  if (current === 'yes') return 'no';
  return undefined;
}
