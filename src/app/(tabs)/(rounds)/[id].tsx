/**
 * Round detail screen — `(tabs)/(rounds)/[id]`.
 *
 * Read-only view of one of the user's completed scorecards, plus a
 * Delete button. The list is owner-scoped, so any id reachable from
 * the list belongs to the signed-in user; the detail's targeted
 * query also includes `owner_user_id = ?` for deep-link defense and
 * to render a "Round not available" empty state cleanly when a
 * stale link or a mid-navigation delete lands here.
 *
 * Edit-mode score corrections (the destination app's feature) are
 * intentionally out of scope. If the user needs to fix a score they
 * can delete the round and re-score it. Adding edit mode later
 * reuses the existing live-scoring components and is well-scoped.
 */

import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useQuery } from '@powersync/react';

import { ReadOnlyScorecard } from '@/components/scoring/ReadOnlyScorecard';
import {
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE
} from '@/library/powersync/AppSchema';
import {
  formatDay,
  formatScore,
  holeRangeLabel,
  scoreForRoundsList
} from '@/library/golf/scoring';
import {
  projectScorecardRow,
  type ScorecardRowShape
} from '@/library/golf/projectScorecard';
import { useRound } from '@/library/golf/RoundContext';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { RoundScore } from '@/types/golf';

type ScoreRow = {
  scorecard_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  strokes: number | null;
};

const SELECT_ONE_SCORECARD_SQL = `
  SELECT * FROM ${SCORECARDS_TABLE}
  WHERE id = ? AND owner_user_id = ?
  LIMIT 1
`;

const SELECT_SCORES_FOR_SCORECARD_SQL = `
  SELECT scorecard_id, scorer_id, hole_number, strokes
  FROM ${SCORECARD_SCORES_TABLE}
  WHERE scorecard_id = ? AND owner_user_id = ?
`;

const NO_ROWS_SQL = `SELECT * FROM ${SCORECARDS_TABLE} WHERE 1 = 0`;

export default function RoundDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useRequiredAccount();
  const { deleteRound } = useRound();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { data: scorecardRows, isLoading: scorecardLoading } =
    useQuery<ScorecardRowShape>(
      id ? SELECT_ONE_SCORECARD_SQL : NO_ROWS_SQL,
      id ? [id, account.userId] : []
    );

  const { data: scoreRows, isLoading: scoresLoading } = useQuery<ScoreRow>(
    id ? SELECT_SCORES_FOR_SCORECARD_SQL : NO_ROWS_SQL,
    id ? [id, account.userId] : []
  );

  const scores = React.useMemo<RoundScore[]>(() => {
    return scoreRows
      .filter((r) => !!r.scorecard_id)
      .map((r) => ({
        scorerId: r.scorer_id ?? '',
        holeNumber: Number(r.hole_number ?? 0),
        strokes: Number(r.strokes ?? 0)
      }));
  }, [scoreRows]);

  const round = React.useMemo(() => {
    const row = scorecardRows[0];
    if (!row) return null;
    return projectScorecardRow(row, scores);
  }, [scorecardRows, scores]);

  const isLoading = scorecardLoading || scoresLoading;
  const [isDeleting, setIsDeleting] = React.useState(false);

  const onPressDelete = React.useCallback(() => {
    if (!id) return;
    const proceed = async () => {
      setIsDeleting(true);
      try {
        await deleteRound(id);
        // replace, not back — avoids stale-detail flash if the local
        // query takes a tick to re-emit, and avoids a "back to a
        // deleted round" entry in the history.
        router.replace('/(tabs)/(rounds)' as never);
      } catch (e) {
        setIsDeleting(false);
        console.warn('[RoundDetail] delete failed', e);
        if (Platform.OS === 'web') {
          window.alert('Failed to delete this round. Please try again.');
        } else {
          Alert.alert('Could not delete', 'Please try again.');
        }
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this round? This cannot be undone.')) {
        void proceed();
      }
      return;
    }
    Alert.alert(
      'Delete this round?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void proceed() }
      ]
    );
  }, [id, deleteRound, router]);

  if (!id) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Missing round id.</Text>
      </View>
    );
  }

  if (isLoading && !round) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!round) {
    return (
      <>
        <Stack.Screen options={{ title: 'Round' }} />
        <View style={styles.fallback}>
          <Text style={styles.fallbackIcon}>⛳</Text>
          <Text style={styles.fallbackTitle}>Round not available</Text>
          <Text style={styles.fallbackBody}>
            This round may have been deleted or is no longer accessible.
          </Text>
          <Pressable
            style={styles.backCta}
            onPress={() => router.replace('/(tabs)/(rounds)' as never)}>
            <Text style={styles.backCtaText}>Back to Rounds</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const date = new Date(round.completedAt ?? round.startedAt);
  const totalRel = scoreForRoundsList(round, account.userId);

  return (
    <>
      <Stack.Screen options={{ title: round.course.name }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.courseName} numberOfLines={2}>
            {round.course.name}
          </Text>
          {round.course.location ? (
            <Text style={styles.location} numberOfLines={1}>
              {round.course.location}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.date}>{formatDay(date)}, {date.getFullYear()}</Text>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {round.scoringRule === 'scramble' ? 'SCRAMBLE' : 'STROKE'}
              </Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {holeRangeLabel(round.course.holes, round.holeRange).toUpperCase()}
              </Text>
            </View>
            <Text
              style={[
                styles.totalScore,
                totalRel > 0 && styles.scoreOver,
                totalRel < 0 && styles.scoreUnder
              ]}>
              {formatScore(totalRel)}
            </Text>
          </View>
        </View>

        <View style={styles.scorecardSection}>
          <ReadOnlyScorecard
            round={round}
            onPressParticipant={(userId) =>
              router.push(`/(tabs)/(rounds)/profile/${userId}` as never)
            }
          />
        </View>

        <Pressable
          style={[styles.deleteBtn, isDeleting && styles.deleteBtnDisabled]}
          onPress={onPressDelete}
          disabled={isDeleting}>
          <Text style={styles.deleteBtnText}>
            {isDeleting ? 'Deleting…' : 'Delete this round'}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      padding: 16,
      paddingBottom: 40
    },

    head: {
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12
    },
    courseName: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.textTitle,
      lineHeight: 23
    },
    location: {
      fontSize: 12.5,
      color: colors.textMuted,
      marginTop: 2,
      fontWeight: '500'
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      flexWrap: 'wrap'
    },
    date: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted
    },
    tag: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border
    },
    tagText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textTitle
    },
    totalScore: {
      marginLeft: 'auto',
      fontSize: 24,
      fontWeight: '800',
      color: colors.textTitle
    },
    scoreOver: {
      color: colors.accent
    },
    scoreUnder: {
      color: colors.primary
    },

    scorecardSection: {
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 16
    },

    deleteBtn: {
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center'
    },
    deleteBtnDisabled: {
      opacity: 0.6
    },
    deleteBtnText: {
      color: colors.accent,
      fontWeight: '800',
      fontSize: 13
    },

    fallback: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 10
    },
    fallbackIcon: {
      fontSize: 40,
      opacity: 0.5
    },
    fallbackTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center'
    },
    fallbackBody: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 270,
      lineHeight: 19
    },
    fallbackText: {
      color: colors.textBody,
      fontSize: 14
    },
    backCta: {
      marginTop: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary
    },
    backCtaText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13
    }
  });
}
