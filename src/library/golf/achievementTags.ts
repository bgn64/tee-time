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
 * Pluck the tags array for a specific (scorer, hole) tuple from a
 * row list. Returns an empty array when no row matches — UI maps
 * absent rows to "untapped".
 */
export type TagRow = {
  scorer_id: string;
  hole_number: number;
  tags: readonly TagKey[];
};

export function tagsForHole(
  rows: readonly TagRow[],
  scorerId: string,
  holeNumber: number
): readonly TagKey[] {
  for (const row of rows) {
    if (row.scorer_id === scorerId && row.hole_number === holeNumber) {
      return row.tags;
    }
  }
  return [];
}
