/**
 * HoleContextSummary — the `.ph-summary` row from the mockup: a
 * scorer's avatar + name on the left, hole-context metadata in the
 * middle, and the scorer's score (with USGA mark) on the right.
 *
 * Reads per-tee data via `getHoleStats(tee, holeNumber, fallback)`
 * so legacy rounds without per-tee snapshots fall back to the
 * scalar `Hole.par` / `Hole.handicapIndex`. Scorers without a tee
 * pick a synthetic default (first tee on the course, or the
 * fallback `Hole` row when no tees exist at all) — matches the
 * grouping rule in `HorizontalScorecard`.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScoreMark } from '@/components/scoring/ScoreMark';
import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { assignTeeColors } from '@/library/golf/teeColor';
import { getHoleStats } from '@/library/golf/teeGrouping';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole, Tee } from '@/types/golf';

type Props = {
  members: readonly AvatarMember[];
  name: string;
  /** Scorer's tee (if known). When undefined the hole context uses the fallback Hole row only. */
  tee: Tee | null;
  /** All tees in the round — needed for stable colour assignment. */
  allTees: readonly Tee[];
  hole: Hole;
  /** Scorer's strokes for this hole; null/undefined renders the "—" placeholder. */
  strokes: number | null | undefined;
};

export function HoleContextSummary({
  members,
  name,
  tee,
  allTees,
  hole,
  strokes,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Resolve the tee colour via the same assignment helper the
  // scorecard uses, so the dot here matches the scorecard's tee row.
  const teeColor = useMemo(() => {
    if (!tee) return null;
    const map = assignTeeColors(allTees);
    const token = map.get(tee.id);
    if (!token) return null;
    return colors[token];
  }, [tee, allTees, colors]);

  const stats = useMemo(
    () => (tee ? getHoleStats(tee, hole.number, hole) : null),
    [tee, hole]
  );

  const yardage = stats?.yardage;
  const par = stats?.par ?? hole.par;
  const hcp = stats?.handicapIndex ?? hole.handicapIndex;

  const relText = useMemo(() => {
    if (strokes == null) return '\u00a0';
    const rel = strokes - par;
    if (rel === 0) return 'E';
    if (rel > 0) return `+${rel}`;
    return `−${Math.abs(rel)}`;
  }, [strokes, par]);

  return (
    <View style={styles.row}>
      <TeamAvatarCluster members={members} size="lg" />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.meta}>
          {teeColor ? (
            <View style={[styles.teeDot, { backgroundColor: teeColor }]} />
          ) : null}
          {tee && yardage != null ? (
            <Text style={styles.metaText}>
              {tee.name} · {yardage.toLocaleString()} yds
            </Text>
          ) : tee ? (
            <Text style={styles.metaText}>{tee.name}</Text>
          ) : null}
          {tee ? <Text style={styles.metaSep}>·</Text> : null}
          <Text style={styles.metaText}>Par {par}</Text>
          {hcp != null ? <Text style={styles.metaSep}>·</Text> : null}
          {hcp != null ? (
            <Text style={styles.metaText}>Hcp {hcp}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.scoreCol}>
        <ScoreMark strokes={strokes ?? null} par={par} size="md" />
        <Text style={styles.relText}>{relText}</Text>
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
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 15,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.1,
    },
    meta: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    metaText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    metaSep: {
      fontSize: 11.5,
      color: colors.border,
    },
    teeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      flexShrink: 0,
    },
    scoreCol: {
      alignItems: 'center',
      flexShrink: 0,
    },
    relText: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
  });
}
