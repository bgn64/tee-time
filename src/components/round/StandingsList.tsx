import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NumericText } from '@/components/aurora';
import { TeamAvatarCluster } from '@/components/scoring/TeamAvatarCluster';
import {
  formatScore,
  holesInRange,
  playerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type StandingsRow = {
  id: string;
  scorer: ReturnType<typeof useRoundScorers>[number];
  rel: number;
  thru: number;
  birdies: number;
  index: number;
};

export function StandingsList({ round }: { round: Round }) {
  const { userId } = useRequiredAccount();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scorers = useRoundScorers(round);
  const myScorerId = scorerIdForUser(round, userId);

  const standings = useMemo<StandingsRow[]>(() => {
    const holes = holesInRange(round.course.holes, round.holeRange);

    return scorers
      .map((scorer, index) => {
        const { rel, thru } = playerProgress(round, scorer.id);
        const birdies = holes.filter((hole) =>
          round.scores.some(
            (score) =>
              score.scorerId === scorer.id &&
              score.holeNumber === hole.number &&
              score.strokes < hole.par
          )
        ).length;

        return {
          id: scorer.id,
          scorer,
          rel,
          thru,
          birdies,
          index,
        };
      })
      .sort((a, b) => a.rel - b.rel || a.index - b.index);
  }, [round, scorers]);

  return (
    <View style={styles.list}>
      {standings.map((row, index) => {
        const { scorer, rel, thru, birdies } = row;
        const firstMember = scorer.members[0];
        const handle = firstMember?.handle
          ? `@${firstMember.handle}`
          : firstMember?.name ?? scorer.name;
        const scoreTone =
          rel < 0
            ? styles.scoreUnder
            : rel > 0
              ? styles.scoreOver
              : styles.scoreEven;

        return (
          <View
            key={row.id}
            style={[
              styles.row,
              index === standings.length - 1 ? styles.lastRow : null,
            ]}>
            <TeamAvatarCluster
              members={scorer.members}
              size="md"
              ringColor={colors.cardBg}
            />
            <View style={styles.body}>
              <View style={styles.handleLine}>
                <Text style={styles.handle} numberOfLines={1}>
                  {handle}
                </Text>
                {scorer.id === myScorerId ? (
                  <View style={styles.youPill}>
                    <Text style={styles.youText}>YOU</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.subline} numberOfLines={1}>
                {formatSubline(rel, birdies)}
              </Text>
            </View>
            <View style={styles.scoreCol}>
              <NumericText style={[styles.scoreText, scoreTone]}>
                {formatScore(rel)}
              </NumericText>
              <Text style={styles.thruText}>thru {thru}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatSubline(rel: number, birdies: number): string {
  const phrase = rel === 0 ? 'even par' : formatScore(rel);
  if (birdies === 0) return phrase;
  return `${phrase} · ${birdies} ${birdies === 1 ? 'birdie' : 'birdies'}`;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.glassStroke,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    handleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      minWidth: 0,
    },
    handle: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    youPill: {
      flexShrink: 0,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: 'rgba(190, 255, 102, 0.15)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.lime,
    },
    youText: {
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.6,
      color: colors.lime,
    },
    subline: {
      marginTop: 4,
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    scoreCol: {
      marginLeft: 'auto',
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    scoreText: {
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 27,
    },
    scoreUnder: {
      color: colors.lime,
    },
    scoreOver: {
      color: '#ffc08a',
    },
    scoreEven: {
      color: colors.textTitle,
    },
    thruText: {
      marginTop: 2,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
      color: colors.textMuted,
    },
  });
}
