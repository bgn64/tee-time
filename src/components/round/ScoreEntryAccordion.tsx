/**
 * ScoreEntryAccordion — per-scorer entry block for the scoring
 * Holes tab. (Name is historical; there is no longer an accordion.)
 * Everything renders inline:
 *
 *   [ScorerSummaryRow with per-hole context + per-hole hero score]
 *   [ScoreChipRow  +  Stats labelled-pill]   ← same row, chips left,
 *                                              stats button right.
 *   [AchievementTagRow (edit | filter)]
 *   [Whose shots (scramble + whose_shots enabled)]
 *
 * Tapping the Stats pill swaps the AchievementTagRow body between:
 *   - "edit" (default): per-hole yes/no/unset cycling pills for
 *     every enabled stat (DID WELL + HURT ME headers always show).
 *   - "filter": per-scorer enabled-set editor — every available tag
 *     with on/off toggles (dashed-border = off, solid = on).
 *
 * State: filter mode is local per scorer per session. We don't
 * persist it across navigation — re-entering the Holes tab lands
 * back in edit mode.
 */

import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AchievementTagRow } from './AchievementTagRow';
import { ScoreChipRow } from './ScoreChipRow';
import {
  ScorerSummaryRow,
  type HoleContext,
  type ScoreTone,
} from './ScorerSummaryRow';
import { ShotPicker } from '@/components/scoring/ShotPicker';
import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import {
  ACHIEVEMENT_TAGS,
  defaultEnabledTagsFor,
  type TagKey,
  type TagValue,
  type TagValueMap,
} from '@/library/golf/achievementTags';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { ScoringRule, Tee } from '@/types/golf';

type Props = {
  // Identity / summary props
  members: readonly AvatarMember[];
  name: string;
  /** Hero score text (e.g. "−2", "E", "+1") for the right-edge column. */
  scoreText: string;
  scoreTone: ScoreTone;
  /** Sub-label under the hero score (e.g. "3 STROKES"). */
  scoreSub?: string;
  tee?: Tee;
  onPressTee?: () => void;
  /**
   * Per-hole context (yardage · par · hcp) for the meta line under
   * the name. Wired by `ScoringHolesBody` from the focused hole's
   * row + the scorer's tee, so the editing surface looks identical
   * to the viewing surface (`HolesTabContent`).
   */
  holeContext?: HoleContext;

  // Score-chip props (current hole context)
  holeNumber: number;
  par: number;
  strokes: number | null;
  onChange?: (strokes: number) => void;

  // Achievement-tag props
  scorerId: string;
  scoringRule: ScoringRule;
  /** Per-tag values for this (scorer, hole) tuple. */
  values: TagValueMap;
  /**
   * Tags enabled for this scorer in this round. Pre-fixed by
   * `defaultEnabledTagsFor(scoringRule)` unless an override exists.
   * If null/undefined we fall back to defaults.
   */
  enabledTags?: readonly TagKey[] | null;
  onSetValue: (tagKey: TagKey, value: TagValue | undefined) => void;
  /**
   * Per-scorer tracked-stats override writer. When set, the chip row
   * surfaces a "Stats" labelled pill; tapping it swaps the body to a
   * filter panel listing every available tag.
   */
  onChangeEnabledTags?: (next: readonly TagKey[]) => void;

  /**
   * Scramble shot attribution. When `scoringRule` is 'scramble' and
   * these props are wired, the section also renders a "Whose shots"
   * subsection with `ShotPicker`.
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
  holeContext,
  holeNumber,
  par,
  strokes,
  onChange,
  scorerId: _scorerId,
  scoringRule,
  values,
  enabledTags,
  onSetValue,
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

  // The stat-tracking section is hidden entirely only when nothing is
  // enabled AND there's no override writer wired. With a writer wired,
  // the Stats button stays visible so the user can re-enable a tag.
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
        holeContext={holeContext}
      />
      {onChange ? (
        <View style={styles.chipsRow}>
          <ScoreChipRow
            scorerName={name}
            holeNumber={holeNumber}
            par={par}
            strokes={strokes}
            onChange={onChange}
          />
          <View style={styles.chipsSpacer} />
          {onChangeEnabledTags ? (
            <Pressable
              onPress={() => setFilterMode((v) => !v)}
              style={[
                styles.statsBtn,
                filterMode ? styles.statsBtnActive : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                filterMode ? 'Close stats settings' : 'Edit tracked stats'
              }
              accessibilityState={{ selected: filterMode }}>
              <Ionicons
                name="funnel-outline"
                size={13}
                color={filterMode ? '#fff' : colors.textTitle}
              />
              <Text
                style={[
                  styles.statsBtnLabel,
                  filterMode ? styles.statsBtnLabelActive : null,
                ]}>
                Stats
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {showStatSection ? (
        <View style={styles.statSection}>
          {filterMode && onChangeEnabledTags ? (
            <AchievementTagRow
              mode="filter"
              values={{}}
              enabledTags={effectiveEnabled}
              isScramble={scoringRule === 'scramble'}
              onToggleEnabled={handleFilterToggle}
            />
          ) : hasEnabled ? (
            <>
              <AchievementTagRow
                mode="edit"
                values={values}
                enabledTags={effectiveEnabled}
                isScramble={scoringRule === 'scramble'}
                onSetValue={onSetValue}
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
              No stats tracked for this round. Tap Stats to enable some.
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
    chipsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chipsSpacer: {
      flex: 1,
    },
    statsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
    },
    statsBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    statsBtnLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.2,
      color: colors.textTitle,
    },
    statsBtnLabelActive: {
      color: '#fff',
    },
    statSection: {
      gap: 6,
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
