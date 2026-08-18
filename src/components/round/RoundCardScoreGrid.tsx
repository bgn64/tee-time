import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NumericText, ScorePip } from '@/components/aurora';
import { holesInRange } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole, Round } from '@/types/golf';

export function RoundCardScoreGrid({
  round,
  scorerId,
}: {
  round: Round;
  scorerId: string | undefined;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const holes = holesInRange(round.course.holes, round.holeRange);
  const groups = [
    holes.filter((hole) => hole.number <= 9),
    holes.filter((hole) => hole.number >= 10),
  ].filter((group) => group.length > 0);
  const scores = useMemo(() => {
    const byHole = new Map<number, number>();
    if (!scorerId) return byHole;
    for (const score of round.scores) {
      if (score.scorerId === scorerId && !byHole.has(score.holeNumber)) {
        byHole.set(score.holeNumber, score.strokes);
      }
    }
    return byHole;
  }, [round.scores, scorerId]);

  return (
    <View style={styles.card}>
      {groups.map((group, index) => (
        <View
          key={group[0]?.number ?? index}
          style={[styles.nine, index > 0 ? styles.divided : null]}>
          <GridRow label="Hole">
            {padNine(group).map((hole) => (
              <NumericText key={`hole-${hole.number}`} style={styles.holeNumber}>
                {hole.number > 0 ? hole.number : ''}
              </NumericText>
            ))}
          </GridRow>
          <GridRow label="Score">
            {padNine(group).map((hole) => {
              const strokes = scores.get(hole.number);
              return (
                <View key={`score-${hole.number}`} style={styles.cell}>
                  {hole.number > 0 && strokes != null ? (
                    <ScorePip strokes={strokes} par={hole.par} size={22} />
                  ) : hole.number > 0 ? (
                    <Text style={styles.dash}>—</Text>
                  ) : null}
                </View>
              );
            })}
          </GridRow>
        </View>
      ))}
    </View>
  );
}

function GridRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function padNine(holes: Hole[]): Hole[] {
  return [
    ...holes,
    ...Array.from(
      { length: Math.max(0, 9 - holes.length) },
      (_, index) => ({ number: -index - 1, par: 0 }) as Hole
    ),
  ];
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginTop: 8,
      marginBottom: 2,
      paddingHorizontal: 9,
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      backgroundColor: colors.glassFill,
    },
    nine: {
      gap: 3,
    },
    divided: {
      marginTop: 7,
      paddingTop: 7,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 25,
    },
    label: {
      width: 34,
      color: colors.textMuted,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    cell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    holeNumber: {
      flex: 1,
      minWidth: 0,
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
      textAlign: 'center',
    },
    dash: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '900',
    },
  });
}
