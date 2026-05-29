/**
 * Edit a completed round — `(tabs)/(rounds)/[id]/edit`. State ③ of
 * the four-state round-detail model.
 *
 * Same composition as the live-scoring screen (state ②): pinned
 * top bar (here: "EDITING" label + "Done"), then
 * `<RoundDetailView isEditing />` with the same per-scorer + per-hole
 * editing affordances. Differences from scoring:
 *
 *   - Round is fetched by id (owner-scoped — RLS + the query's
 *     `owner_user_id = ?` clause prevent anyone but the owner from
 *     reaching this screen).
 *   - No Finish / Abandon — round is already completed; edits write
 *     through PowerSync in realtime; Done just navigates back.
 *   - No range pill — hole range is locked at completion.
 *   - Writes go through `setScoreForRound` / `setParticipantTeesForRound`
 *     rather than the current-round variants, since the edit target
 *     is an arbitrary completed scorecard rather than `currentRound`.
 *
 * Local-only state: `currentHoleNumber` (starts at hole 1; updates
 * via HoleNavBar arrows or scorecard cell taps).
 */

import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useQuery } from '@powersync/react';

import { RoundDetailView } from '@/components/round/RoundDetailView';
import { TeePickerSheet } from '@/components/scoring/TeePickerSheet';
import {
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE
} from '@/library/powersync/AppSchema';
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

export default function EditRoundScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useRequiredAccount();
  const { setScoreForRound, setParticipantTeesForRound } = useRound();
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

  // Current-hole state lives here (not RoundContext, which is
  // scoped to the user's live round). Starts at hole 1 each time
  // the screen mounts; the user navigates via the HoleNavBar
  // arrows or by tapping a row in the scorecard grid.
  const [currentHoleNumber, setCurrentHoleNumber] = React.useState<number>(1);

  // Tee picker state — same pattern scoring.tsx uses. Owns the
  // teeEditTarget id (which is a scorerId — participantKey in
  // stroke, team id in scramble) plus the TeePickerSheet mount.
  const [teeEditTarget, setTeeEditTarget] = React.useState<string | null>(null);

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
        <Stack.Screen options={{ title: 'Edit Round' }} />
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

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  const handleChangeScore = (
    scorerId: string,
    holeNumber: number,
    strokes: number
  ) => {
    void setScoreForRound(round.id, scorerId, holeNumber, strokes);
  };

  // Mirrors scoring.tsx's tee-picker write behavior: scramble fans
  // the new tee out across every team member in a single batched
  // UPDATE; stroke writes the single participant directly.
  const handlePickTee = (teeId: string | undefined) => {
    if (!teeEditTarget) return;
    if (isScramble) {
      const team = round.teams?.find((t) => t.id === teeEditTarget);
      const updates = (team?.playerIds ?? []).map((pid) => ({
        participantKey: pid,
        teeId,
      }));
      void setParticipantTeesForRound(round.id, updates);
    } else {
      void setParticipantTeesForRound(round.id, [
        { participantKey: teeEditTarget, teeId },
      ]);
    }
    setTeeEditTarget(null);
  };

  return (
    <>
      <Stack.Screen options={{ title: round.course.name }} />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarLabel}>EDITING</Text>
          <Pressable
            onPress={() => router.back()}
            style={styles.doneBtn}
            accessibilityLabel="Done editing">
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <RoundDetailView
            round={round}
            isEditing
            currentHoleNumber={currentHoleNumber}
            onChangeCurrentHole={setCurrentHoleNumber}
            onChangeScore={handleChangeScore}
            onPressTeeForScorer={(scorerId) => setTeeEditTarget(scorerId)}
            profileRoutePrefix="/(tabs)/(rounds)/profile"
          />
        </ScrollView>

        <TeePickerSheet
          visible={teeEditTarget != null}
          scorerName={(() => {
            if (!teeEditTarget) return '';
            if (isScramble) {
              const team = round.teams?.find((t) => t.id === teeEditTarget);
              return team?.name ?? '';
            }
            return '';
          })()}
          tees={round.course.tees ?? []}
          selectedTeeId={(() => {
            if (!teeEditTarget) return undefined;
            if (isScramble) {
              const team = round.teams?.find((t) => t.id === teeEditTarget);
              const firstMember = team?.playerIds[0];
              if (!firstMember) return undefined;
              const p = round.participants.find(
                (q) => q.participantKey === firstMember
              );
              return p?.teeId;
            }
            const p = round.participants.find(
              (q) => q.participantKey === teeEditTarget
            );
            return p?.teeId;
          })()}
          onCancel={() => setTeeEditTarget(null)}
          onPick={handlePickTee}
        />
      </View>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 4,
    },
    topBarLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
    },
    doneBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
    },
    doneBtnText: {
      color: colors.textTitle,
      fontWeight: '800',
      fontSize: 12,
      letterSpacing: 0.4,
    },
    content: {
      padding: 14,
      paddingBottom: 40,
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
      backgroundColor: colors.background,
    },
    fallbackText: {
      color: colors.textBody,
      fontSize: 14,
      fontWeight: '600',
    },
    fallbackIcon: { fontSize: 36 },
    fallbackTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
    },
    fallbackBody: {
      fontSize: 13,
      color: colors.textBody,
      textAlign: 'center',
      maxWidth: 260,
    },
    backCta: {
      marginTop: 14,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
    },
    backCtaText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
      letterSpacing: 0.4,
    },
  });
}
