/**
 * ScoreEntryAccordion — per-scorer entry block for the scoring
 * Holes tab. (Name is historical; there is no longer an accordion.)
 * Everything renders inline:
 *
 *   [ScorerSummaryRow with per-hole status + per-hole hero score]
 *   [ScoreChipRow stepper]
 *   [EditableHoleStats]   compact "Stats" chip row — one tappable
 *                         chip per stat that's enabled for this round
 *                         AND applies to this hole's par. Only renders
 *                         when the scorer is in the round's
 *                         `trackedScorerIds`.
 *   [Whose shots]         scramble only.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EditableHoleStats } from './EditableHoleStats';
import { ScoreChipRow } from './ScoreChipRow';
import { ScorerSummaryRow, type ScoreTone } from './ScorerSummaryRow';
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
   * Per-scorer running ROUND score + "YOU" marker for the live Hole
   * lens; forwarded to ScorerSummaryRow. Omitted on the edit screen.
   */
  runningScore?: { rel: number; thru: number };
  isYou?: boolean;

  // Score-chip props (current hole context)
  holeNumber: number;
  par: number;
  strokes: number | null;
  onChange?: (strokes: number) => void;

  /**
   * Stats that apply to this scorer + hole (filtered upstream by
   * the round's enabled set + hole par). Rendered as the compact
   * `EditableHoleStats` chip row, in registry order. Empty array
   * hides the entire stat section.
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
  runningScore,
  isYou,
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
        subtitleOverride={strokes == null ? 'to play' : null}
        runningScore={runningScore}
        isYou={isYou}
      />
      {onChange ? (
        <ScoreChipRow
          par={par}
          strokes={strokes}
          onChange={onChange}
        />
      ) : null}
      {showStatSection ? (
        <View style={styles.statSection}>
          {hasStats && onChangeStat ? (
            <EditableHoleStats
              stats={applicableStats}
              values={values}
              onChangeStat={onChangeStat}
            />
          ) : null}
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
      borderTopColor: colors.glassStroke,
    },
    statSection: {
      gap: 10,
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
