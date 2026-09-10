/**
 * ScoringStatsLens — read-only round-level stat aggregates during an active
 * round. Uses the same summary builder as Round Detail so partial and completed
 * rounds share aggregation, applicability, missing-value, and tone semantics.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatTile } from '@/components/aurora';
import { enabledStatDefinitions } from '@/library/golf/builtInStats';
import { buildRoundStatSummaries } from '@/library/golf/roundStatSummaries';
import {
  holesInRange,
  playerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import type { HoleDetailsRow } from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

export function ScoringStatsLens({
  round,
  rows,
  userId,
}: {
  round: Round;
  rows: readonly HoleDetailsRow[];
  userId: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scorers = useRoundScorers(round);
  const scorerId = scorerIdForUser(round, userId);
  const scorer = scorers.find((candidate) => candidate.id === scorerId);
  const summaries = useMemo(
    () => buildRoundStatSummaries(round, scorerId, rows),
    [round, scorerId, rows]
  );
  const definitions = useMemo(
    () => enabledStatDefinitions(round.enabledStatKeys, round.customStatDefinitions),
    [round.enabledStatKeys, round.customStatDefinitions]
  );
  const enteredHoleCount = useMemo(() => {
    const enteredHoles = new Set<number>();
    const activeHoleNumbers = new Set(
      holesInRange(round.course.holes, round.holeRange).map((hole) => hole.number)
    );
    for (const row of rows) {
      if (
        row.scorer_id !== scorerId ||
        !activeHoleNumbers.has(row.hole_number)
      ) {
        continue;
      }
      if (
        definitions.some((definition) => {
          const value = row.values[definition.key];
          return (
            typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value))
          );
        })
      ) {
        enteredHoles.add(row.hole_number);
      }
    }
    return enteredHoles.size;
  }, [definitions, round.course.holes, round.holeRange, rows, scorerId]);
  const progress = scorerId ? playerProgress(round, scorerId) : { rel: 0, thru: 0 };
  const subject =
    round.scoringRule === 'scramble'
      ? scorer?.name
      : scorer?.members[0]?.handle
        ? `@${scorer.members[0].handle}`
        : scorer?.name;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Your stats</Text>
          {subject ? <Text style={styles.subject}>{subject}</Text> : null}
        </View>
        <Text style={styles.progress}>
          {progress.thru > 0 ? `Thru ${progress.thru}` : 'Not started'}
        </Text>
      </View>

      <View style={styles.grid}>
        {summaries.map((summary) => (
          <StatTile
            key={summary.key}
            value={summary.value}
            label={summary.label}
            tone={summary.tone}
            custom={summary.custom}
            style={styles.tile}
          />
        ))}
      </View>

      <View style={styles.note}>
        <View
          style={[
            styles.noteDot,
            enteredHoleCount === 0 ? styles.noteDotEmpty : null,
          ]}
        />
        <Text style={styles.noteText}>
          {enteredHoleCount > 0
            ? `${enteredHoleCount} ${enteredHoleCount === 1 ? 'hole' : 'holes'} with stat entries.`
            : 'No stat values recorded yet.'}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      gap: 14,
    },
    heading: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 16,
      marginHorizontal: 4,
      marginTop: 4,
    },
    headingCopy: {
      minWidth: 0,
      flex: 1,
    },
    title: {
      color: colors.textTitle,
      fontSize: 20,
      fontWeight: '900',
      lineHeight: 22,
    },
    subject: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    progress: {
      flexShrink: 0,
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    tile: {
      flexBasis: '48%',
      minWidth: 140,
      minHeight: 88,
    },
    note: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 14,
      backgroundColor: colors.glassFill,
    },
    noteDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.cyan,
      shadowColor: colors.cyan,
      shadowOpacity: 0.4,
      shadowRadius: 8,
    },
    noteDotEmpty: {
      backgroundColor: colors.textMuted,
      shadowOpacity: 0,
    },
    noteText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 16,
    },
  });
}