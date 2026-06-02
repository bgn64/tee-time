/**
 * ScoreEntryAccordion — per-scorer entry block for the scoring
 * Holes tab. The name is historical: there is no longer an accordion.
 * Everything is shown inline so the user sees the score chips AND the
 * stat-tracking section without an extra tap.
 *
 * Layout (top → bottom):
 *   [ScorerSummaryRow]         ← shared with Summary tab for parity
 *   [ScoreChipRow]             ← −2 / −1 / E / +1 / +2 / custom
 *   [Stat tracking section]    ← AchievementTagRow or filter chips,
 *                                with a small inline gear toggle in
 *                                the top-right corner.
 *   [Whose shots (scramble)]   ← ShotPicker, when whose_shots enabled
 *
 * Per Phase-5 design, the gear toggle swaps the stat tracking section
 * between two modes:
 *   - "edit" (default): per-hole tag entry — shows enabled tags only,
 *     tap to mark "Did well" / "Hurt me".
 *   - "filter": per-scorer enabled-set editor — shows every available
 *     tag with on/off toggle (dashed-border off, solid-border on).
 *
 * State: gear toggle is local per scorer per session. We don't
 * persist it across navigation — re-entering the Holes tab lands you
 * back in edit mode.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AchievementTagRow } from './AchievementTagRow';
import { GearToggleButton } from './GearToggleButton';
import { ScoreChipRow } from './ScoreChipRow';
import { ScorerSummaryRow, type ScoreTone } from './ScorerSummaryRow';
import { ShotPicker } from '@/components/scoring/ShotPicker';
import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import {
  ACHIEVEMENT_TAGS,
  defaultEnabledTagsFor,
  type TagKey,
} from '@/library/golf/achievementTags';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { ScoringRule, Tee } from '@/types/golf';

type Props = {
  // Identity / summary props
  members: readonly AvatarMember[];
  name: string;
  /** Hero score text (e.g. "−3", "E", "+5") for the right-edge column. */
  scoreText: string;
  scoreTone: ScoreTone;
  /** Sub-label under the hero score (e.g. "THRU 11", "FINAL"). */
  scoreSub?: string;
  tee?: Tee;
  onPressTee?: () => void;

  // Score-chip props (current hole context)
  holeNumber: number;
  par: number;
  strokes: number | null;
  onChange?: (strokes: number) => void;

  // Achievement-tag props
  scorerId: string;
  scoringRule: ScoringRule;
  /** Tags currently tapped for this (scorer, hole) tuple. */
  tappedTags: readonly TagKey[];
  /**
   * Tags enabled for this scorer in this round. Phase 4 always uses
   * `defaultEnabledTagsFor(scoringRule)`; Phase 5 wires per-scorer
   * overrides here. If null/undefined we fall back to defaults.
   */
  enabledTags?: readonly TagKey[] | null;
  onToggleTag: (tagKey: TagKey) => void;
  /**
   * Phase 5: per-scorer tracked-stats override writer. When set, the
   * stat section shows a small gear button in its top-right corner.
   * Tapping it swaps the body to a filter panel listing every
   * available tag. Calls back with the new enabled set.
   */
  onChangeEnabledTags?: (next: readonly TagKey[]) => void;

  /**
   * Phase 6: scramble shot attribution. When `scoringRule` is
   * 'scramble' and these props are wired, the section also renders
   * a "Whose shots" subsection with `ShotPicker`. The stroke count
   * comes from the current `strokes` prop; team members come from
   * this list.
   */
  teamMembers?: readonly AvatarMember[];
  contributorIds?: readonly string[];
  onChangeContributors?: (next: readonly string[]) => void;
};

export function ScoreEntryAccordion({
  members,
  name,
  scoreText,
  scoreTone,
  scoreSub,
  tee,
  onPressTee,
  holeNumber,
  par,
  strokes,
  onChange,
  scorerId: _scorerId,
  scoringRule,
  tappedTags,
  enabledTags,
  onToggleTag,
  onChangeEnabledTags,
  teamMembers,
  contributorIds,
  onChangeContributors,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [filterMode, setFilterMode] = useState(false);

  const effectiveEnabled = useMemo(
    () => enabledTags ?? defaultEnabledTagsFor(scoringRule),
    [enabledTags, scoringRule]
  );

  // Available tags for the filter panel: every defined tag, filtered
  // by scoring rule (whose_shots only appears for scramble).
  const availableTags = useMemo<readonly TagKey[]>(() => {
    return ACHIEVEMENT_TAGS.filter(
      (t) => !t.scrambleOnly || scoringRule === 'scramble'
    ).map((t) => t.key);
  }, [scoringRule]);

  function handleFilterToggle(tagKey: TagKey) {
    if (!onChangeEnabledTags) return;
    const set = new Set(effectiveEnabled);
    if (set.has(tagKey)) set.delete(tagKey);
    else set.add(tagKey);
    // Preserve the canonical order from ACHIEVEMENT_TAGS so the
    // saved list reads predictably.
    const next = availableTags.filter((k) => set.has(k));
    onChangeEnabledTags(next);
  }

  const hasEnabled = effectiveEnabled.length > 0;
  const showShotPicker =
    scoringRule === 'scramble' &&
    teamMembers !== undefined &&
    onChangeContributors !== undefined &&
    effectiveEnabled.includes('whose_shots') &&
    strokes != null &&
    strokes > 0;

  // The stat-tracking section is hidden entirely (along with the
  // gear) only when the scorer has nothing enabled AND there's no
  // override writer wired (i.e. no way to add anything back). With
  // a writer wired, we still want the gear visible so the user can
  // re-enable a tag.
  const showStatSection = hasEnabled || onChangeEnabledTags !== undefined;

  return (
    <View style={styles.block}>
      <ScorerSummaryRow
        members={members}
        name={name}
        tee={tee ?? null}
        scoreText={scoreText}
        tone={scoreTone}
        scoreSub={scoreSub}
        onPressTee={onPressTee}
      />
      {onChange ? (
        <View style={styles.chipsWrap}>
          <ScoreChipRow
            scorerName={name}
            holeNumber={holeNumber}
            par={par}
            strokes={strokes}
            onChange={onChange}
          />
        </View>
      ) : null}
      {showStatSection ? (
        <View style={styles.statSection}>
          {onChangeEnabledTags ? (
            <View style={styles.gearRow}>
              <GearToggleButton
                active={filterMode}
                onToggle={() => setFilterMode((v) => !v)}
              />
            </View>
          ) : null}
          {filterMode && onChangeEnabledTags ? (
            <AchievementTagRow
              mode="filter"
              tags={effectiveEnabled}
              enabledTags={availableTags}
              isScramble={scoringRule === 'scramble'}
              onToggle={handleFilterToggle}
            />
          ) : hasEnabled ? (
            <>
              <AchievementTagRow
                mode="edit"
                tags={tappedTags}
                enabledTags={effectiveEnabled}
                isScramble={scoringRule === 'scramble'}
                onToggle={onToggleTag}
              />
              {showShotPicker ? (
                <View style={styles.shotsGroup}>
                  <Text style={styles.shotsLabel}>WHOSE SHOTS</Text>
                  <ShotPicker
                    strokeCount={strokes!}
                    contributorIds={contributorIds ?? []}
                    members={teamMembers!}
                    onChange={onChangeContributors!}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyHint}>
              No stats tracked for this round. Tap the gear to enable some.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    block: {
      paddingTop: 14,
      paddingBottom: 14,
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    chipsWrap: {
      paddingLeft: 4,
    },
    statSection: {
      gap: 6,
    },
    gearRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    shotsGroup: {
      marginTop: 10,
      gap: 6,
    },
    shotsLabel: {
      fontSize: 9.5,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    emptyHint: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
  });
}
