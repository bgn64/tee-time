/**
 * ScorerSummaryRow — the shared `[avatar] [name + tee chip] [hero
 * score + thru]` row used by:
 *
 *   - SummaryTabContent (one per scorer/team)
 *   - ScoreEntryAccordion (Holes editing surface, above the score
 *     chips and per-hole stat tracking)
 *
 * The two surfaces want pixel-identical visuals so a scorer's row
 * looks the same when they're glancing at totals (Summary) and when
 * they're entering a score (Holes editing). Pulling the row into a
 * shared component is the cleanest way to keep them in lockstep —
 * earlier the editing surface used `ScorerRow` which had its own
 * 2-line layout that drifted from Summary's 1-line look.
 *
 * Pure presentational; the parent resolves the scorer's tee and
 * computes the running/final scoreText + tone.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { teeSwatch } from '@/components/scoring/TeePickerSheet';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Tee } from '@/types/golf';

export type ScoreTone = 'over' | 'under' | 'even';

type Props = {
  members: readonly AvatarMember[];
  name: string;
  /** Scorer's tee (when known). When undefined the chip is omitted. */
  tee: Tee | null;
  /** Hero score text (e.g. "−3", "E", "+5"). */
  scoreText: string;
  tone: ScoreTone;
  /** Sub-label under the hero score (e.g. "THRU 11", "FINAL"). */
  scoreSub?: string;
  /**
   * When set, the tee chip becomes a Pressable with a "▾" caret and
   * (if `tee` is null) renders a dashed "+ Tee" placeholder so the
   * picker stays reachable. Editing surfaces (Holes tab) wire this;
   * read-only surfaces (Summary, feed) leave it undefined.
   */
  onPressTee?: () => void;
};

export function ScorerSummaryRow({
  members,
  name,
  tee,
  scoreText,
  tone,
  scoreSub,
  onPressTee,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const teeColor = tee ? teeSwatch(tee) : undefined;
  const teeLabel = tee
    ? tee.totalYardage
      ? `${tee.name} · ${tee.totalYardage.toLocaleString()}`
      : tee.name
    : null;

  let teeChip: React.ReactNode = null;
  if (tee && teeColor && teeLabel) {
    const inner = (
      <>
        <View style={[styles.teeDot, { backgroundColor: teeColor }]} />
        <Text style={styles.teeLabel} numberOfLines={1}>
          {teeLabel}
        </Text>
        {onPressTee ? <Text style={styles.teeChev}>▾</Text> : null}
      </>
    );
    teeChip = onPressTee ? (
      <Pressable
        onPress={onPressTee}
        style={styles.teeChip}
        accessibilityRole="button"
        accessibilityLabel={`Change tee from ${tee.name}`}>
        {inner}
      </Pressable>
    ) : (
      <View style={styles.teeChip}>{inner}</View>
    );
  } else if (onPressTee) {
    // Editing surface with no tee picked yet → show a dashed
    // placeholder so the user can reach the picker mid-round.
    teeChip = (
      <Pressable
        onPress={onPressTee}
        style={styles.teeChipEmpty}
        accessibilityRole="button"
        accessibilityLabel="Pick a tee">
        <Text style={styles.teePlaceholder}>+ Tee</Text>
        <Text style={styles.teeChev}>▾</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <TeamAvatarCluster members={members} size="lg" />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {teeChip}
      </View>
      <View style={styles.scoreCol}>
        <Text
          style={[
            styles.scoreText,
            tone === 'over' ? styles.scoreOver : null,
            tone === 'even' ? styles.scoreEven : null,
          ]}>
          {scoreText}
        </Text>
        {scoreSub ? <Text style={styles.thruText}>{scoreSub}</Text> : null}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    teeChip: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    teeChipEmpty: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignSelf: 'flex-start',
    },
    teeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    teeLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.textTitle,
    },
    teePlaceholder: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    teeChev: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.textMuted,
      marginLeft: 1,
    },
    scoreCol: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    scoreText: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.primaryDark,
      lineHeight: 30,
    },
    scoreEven: {
      color: colors.textBody,
    },
    scoreOver: {
      color: colors.textTitle,
    },
    thruText: {
      marginTop: 3,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
  });
}
