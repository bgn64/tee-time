import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NumericText, ScorePip } from '@/components/aurora';
import { formatScore, holesInRange, playerProgress } from '@/library/golf/scoring';
import { getHoleStats } from '@/library/golf/teeGrouping';
import type { RoundScorer } from '@/library/golf/useRoundScorers';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole, Round, Tee } from '@/types/golf';

type RoundScorecardGridProps = {
  round: Round;
  scorers: RoundScorer[];
  currentHoleNumber?: number;
  performanceColor?: string;
};

export function RoundScorecardGrid({
  round,
  scorers,
  currentHoleNumber,
  performanceColor,
}: RoundScorecardGridProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const holes = holesInRange(round.course.holes, round.holeRange);
  const front = holes.filter((h) => h.number <= 9);
  const back = holes.filter((h) => h.number >= 10);
  const hasBack = back.length > 0;

  // Per-hole Yds + Hcp follow the round's primary tee (scorers[0]) — the
  // same tee the header/holehero report — so the scorecard reflects the
  // tee being played, not the course default. Rows are hidden when no
  // in-range hole has the data (e.g. a tee-less or unenriched round).
  const tee = scorers[0]?.tee;
  const showYards = holes.some((h) => {
    const y = statForTee(tee, h).yardage;
    return y != null && y > 0;
  });
  const showHcp = holes.some((h) => statForTee(tee, h).handicapIndex != null);

  return (
    <View style={styles.scorecardBody}>
      <NineGrid label="Out" holes={front} round={round} scorers={scorers} tee={tee} showYards={showYards} showHcp={showHcp} currentHoleNumber={currentHoleNumber} />
      {hasBack ? <View style={styles.scoreDivider} /> : null}
      {hasBack ? <NineGrid label="In" holes={back} round={round} scorers={scorers} tee={tee} showYards={showYards} showHcp={showHcp} currentHoleNumber={currentHoleNumber} /> : null}
      <View style={styles.totalBar}>
        <Text style={styles.totalMuted}>
          Out <Text style={styles.totalStrong}>{nineTotal(round, front, scorers[0]?.id)}</Text>
          {hasBack ? ' · In ' : ''}
          {hasBack ? <Text style={styles.totalStrong}>{nineTotal(round, back, scorers[0]?.id)}</Text> : null}
        </Text>
        {scorers[0] ? (
          <NumericText
            style={[
              styles.totalToPar,
              performanceColor ? { color: performanceColor } : null,
            ]}>
            {formatScore(playerProgress(round, scorers[0].id).rel)} · thru {playerProgress(round, scorers[0].id).thru}
          </NumericText>
        ) : null}
      </View>
    </View>
  );
}

function NineGrid({
  label,
  holes,
  round,
  scorers,
  tee,
  showYards,
  showHcp,
  currentHoleNumber,
}: {
  label: string;
  holes: Hole[];
  round: Round;
  scorers: RoundScorer[];
  tee: Tee | undefined;
  showYards: boolean;
  showHcp: boolean;
  currentHoleNumber?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const padded = [...holes, ...Array.from({ length: Math.max(0, 9 - holes.length) }, (_, i) => ({ number: -i - 1, par: 0 } as Hole))];

  return (
    <View style={styles.nine}>
      <ScoreRow label="Hole" cells={padded.map((h) => (h.number > 0 ? String(h.number) : ''))} muted />
      <ScoreRow label="Par" cells={padded.map((h) => (h.par ? String(h.par) : ''))} />
      {showYards ? (
        <ScoreRow label="Yds" cells={padded.map((h) => (h.number > 0 ? formatYards(statForTee(tee, h).yardage) : ''))} muted />
      ) : null}
      {showHcp ? (
        <ScoreRow label="Hcp" cells={padded.map((h) => (h.number > 0 ? hcpText(statForTee(tee, h).handicapIndex) : ''))} muted />
      ) : null}
      {scorers.map((scorer) => (
        <View key={scorer.id} style={styles.scoreRow}>
          <Text style={styles.rowLabel} numberOfLines={1}>{scorers.length === 1 ? label : shortName(scorer.name)}</Text>
          {padded.map((hole) => {
            if (hole.number < 0) return <View key={hole.number} style={styles.scoreCell} />;
            const score = round.scores.find((s) => s.scorerId === scorer.id && s.holeNumber === hole.number);
            const isCurrentHole = currentHoleNumber === hole.number;
            return (
              <View key={hole.number} style={isCurrentHole ? [styles.scoreCell, styles.currentScoreCell] : styles.scoreCell}>
                {score ? <ScorePip strokes={score.strokes} par={hole.par} size={24} /> : <Text style={styles.dash}>—</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ScoreRow({ label, cells, muted }: { label: string; cells: string[]; muted?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      {cells.map((cell, i) => (
        <View key={`${label}-${i}`} style={styles.scoreCell}>
          <NumericText style={[styles.cellText, muted ? styles.cellMuted : null]}>{cell}</NumericText>
        </View>
      ))}
    </View>
  );
}

function nineTotal(round: Round, holes: Hole[], scorerId: string | undefined): string {
  if (!scorerId || holes.length === 0) return '—';
  let total = 0;
  let entered = 0;
  for (const hole of holes) {
    const score = round.scores.find((s) => s.scorerId === scorerId && s.holeNumber === hole.number);
    if (score) {
      total += score.strokes;
      entered += 1;
    }
  }
  return entered === holes.length ? String(total) : entered ? `${total}` : '—';
}

function shortName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/**
 * Per-hole (par · handicapIndex · yardage) for a tee, preferring the
 * tee's per-hole row and falling back to the course-level `Hole`
 * scalars. When no tee is selected, reads the scalar `Hole` values.
 */
function statForTee(tee: Tee | undefined, hole: Hole) {
  if (tee) return getHoleStats(tee, hole.number, hole);
  return {
    holeNumber: hole.number,
    par: hole.par,
    handicapIndex: hole.handicapIndex,
    yardage: hole.yardage,
  };
}

function formatYards(yardage: number | undefined): string {
  return yardage != null && yardage > 0 ? Math.round(yardage).toLocaleString('en-US') : '';
}

function hcpText(handicapIndex: number | undefined): string {
  return handicapIndex != null ? String(handicapIndex) : '';
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scorecardBody: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
    },
    nine: {
      gap: 4,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 28,
    },
    rowLabel: {
      width: 42,
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    scoreCell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    currentScoreCell: {
      borderWidth: 1,
      borderColor: colors.lime,
      borderRadius: 7,
    },
    cellText: {
      color: colors.textBody,
      fontSize: 12,
      fontWeight: '800',
    },
    cellMuted: {
      color: colors.textMuted,
      fontSize: 10.5,
    },
    dash: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.glassStroke,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      fontWeight: '900',
    },
    scoreDivider: {
      height: 1,
      backgroundColor: colors.glassStroke,
      marginVertical: 8,
    },
    totalBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
      gap: 12,
    },
    totalMuted: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    totalStrong: {
      color: colors.textTitle,
      fontWeight: '900',
    },
    totalToPar: {
      color: colors.lime,
      fontSize: 12,
      fontWeight: '900',
    },
  });
}

export default RoundScorecardGrid;
