/**
 * Edit a completed round — `(tabs)/(score)/previous/[id]/edit`.
 * State ③ of the four-state round-detail model.
 *
 * Same shared editing surface as the live-scoring screen (state ②) —
 * `<ScoringRoundView />` (CourseBanner + per-hole swipeable editing
 * pager + footer) — with the chrome differences for an already-finished
 * round:
 *
 *   - No live strip; the meta line reads "Completed · <time>".
 *   - Native header title is "Edit round"; a top-right "Done" header
 *     button returns to the detail view (edits autosave). No footer
 *     primary and no destructive Delete affordance here for now.
 *   - Round is fetched by id (owner-scoped — RLS + the query's
 *     `owner_user_id = ?` clause prevent anyone but the owner from
 *     reaching this screen).
 *   - Writes go through `setScoreForRound` / `setParticipantTeesForRound`
 *     rather than the current-round variants, since the edit target is
 *     an arbitrary completed scorecard rather than `currentRound`.
 *
 * Local-only state: `currentHoleNumber` (starts at hole 1; the pager
 * reports swipes back through `onChangeCurrentHole`).
 */

import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScoringRoundView } from '@/components/round/ScoringRoundView';
import { PhoneFrame } from '@/components/aurora';
import { TeePickerSheet } from '@/components/scoring/TeePickerSheet';
import { useRoundDetail } from '@/library/golf/useRoundDetail';
import { useRound } from '@/library/golf/RoundContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function EditRoundScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { setScoreForRound, setParticipantTeesForRound } = useRound();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { round, isLoading } = useRoundDetail(id ?? null);

  // Current-hole state lives here (not RoundContext, which is scoped to
  // the user's live round). Starts at hole 1 each mount; the pager
  // reports swipes via onChangeCurrentHole.
  const [currentHoleNumber, setCurrentHoleNumber] = React.useState<number>(1);

  // Tee picker state — same pattern scoring.tsx uses.
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
        <Stack.Screen options={{ title: 'Edit round' }} />
        <View style={styles.fallback}>
          <Text style={styles.fallbackIcon}>⛳</Text>
          <Text style={styles.fallbackTitle}>Round not available</Text>
          <Text style={styles.fallbackBody}>
            This round may have been deleted or is no longer accessible.
          </Text>
          <Pressable
            style={styles.backCta}
            onPress={() => router.replace('/(tabs)/(score)/previous' as never)}>
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

  // Mirrors scoring.tsx's tee-picker write behavior: scramble fans the
  // new tee out across every team member in a single batched UPDATE;
  // stroke writes the single participant directly.
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
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Edit round',
          // "Done" lives in the header (top-right) rather than the
          // footer: a completed round autosaves edits, so Done is just
          // "finished editing → go back" and reads more naturally as a
          // header action than as a footer primary in the Finish slot.
          // No destructive Delete affordance here for now.
          headerRight: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Done editing"
              style={styles.headerDone}>
              <Text style={styles.headerDoneText}>Done</Text>
            </Pressable>
          ),
        }}
      />

      <PhoneFrame>
        <ScoringRoundView
          round={round}
          profileRoutePrefix="/(tabs)/(score)/profile"
          currentHoleNumber={currentHoleNumber}
          onChangeCurrentHole={setCurrentHoleNumber}
          onChangeScore={handleChangeScore}
          onPressTeeForScorer={(scorerId) => setTeeEditTarget(scorerId)}
        />
      </PhoneFrame>

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
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
      backgroundColor: 'transparent',
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
      backgroundColor: colors.lime,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
    },
    backCtaText: {
      color: colors.onNeon,
      fontWeight: '800',
      fontSize: 13,
      letterSpacing: 0.4,
    },
    headerDone: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: 2,
    },
    headerDoneText: {
      color: colors.lime,
      fontSize: 15,
      fontWeight: '800',
    },
  });
}
