/**
 * ScoreEntryAccordion — per-scorer entry block for the scoring
 * Holes tab. (Name is historical; there is no longer an accordion.)
 * Everything renders inline:
 *
 *   [ScorerSummaryRow with per-hole context + per-hole hero score]
 *   [ScoreChipRow]
 *   [HoleDetailRow × N]   one per stat that's enabled for this
 *                         round AND applies to this hole's par.
 *                         Only renders when the scorer is in the
 *                         round's `trackedScorerIds`.
 *   [Whose shots]         scramble only.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HoleDetailRow } from './HoleDetailRow';
import { ScoreChipRow } from './ScoreChipRow';
import {
  ScorerSummaryRow,
  type HoleContext,
  type ScoreTone,
} from './ScorerSummaryRow';
import { ShotPicker } from '@/components/scoring/ShotPicker';
import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import type {
  StatDefinition,
  StatKey,
  StatValue,
  StatValueMap,
} from '@/library/golf/builtInStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Tee } from '@/types/golf';

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

  /**
   * Stats that apply to this scorer + hole (filtered upstream by
   * the round's enabled set + hole par). Renders one `HoleDetailRow`
   * per entry, in registry order. Empty array hides the entire
   * stat section.
   */
  applicableStats: readonly StatDefinition[];
  /** Per-stat values for this (scorer, hole) tuple. */
  values: StatValueMap;
  onChangeStat?: (statKey: StatKey, value: StatValue | null) => void;

  /**
   * Scramble shot attribution. When all three props are wired and
   * the hole has a non-zero stroke count, the section also renders
   * a "Whose shots" subsection with `ShotPicker`.
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
  applicableStats,
  values,
  onChangeStat,
  teamMembers,
  contributorIds,
  onChangeContributors,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const showShotPicker =
    teamMembers !== undefined &&
    onChangeContributors !== undefined &&
    strokes != null &&
    strokes > 0;

  const hasStats = applicableStats.length > 0;
  const showStatSection = hasStats || showShotPicker;

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
        <ScoreChipRow
          scorerName={name}
          holeNumber={holeNumber}
          par={par}
          strokes={strokes}
          onChange={onChange}
        />
      ) : null}
      {showStatSection ? (
        <View style={styles.statSection}>
          {hasStats
            ? applicableStats.map((stat) => (
                <HoleDetailRow
                  key={stat.key}
                  stat={stat}
                  value={values[stat.key] ?? null}
                  onChange={(next) =>
                    onChangeStat?.(stat.key, next)
                  }
                />
              ))
            : null}
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
    statSection: {
      gap: 8,
    },
    shotsGroup: {
      marginTop: 4,
      gap: 6,
    },
    shotsLabel: {
      fontSize: 9.5,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
  });
}
