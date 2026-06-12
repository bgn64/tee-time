/**
 * Live scoring screen — the Rounds tab's scoring surface, reached
 * from the hub's "Continue" action whenever a round is in flight.
 *
 * State ② of the four-state round-detail model (in-progress +
 * editing). Composes:
 *
 *   - Native stack header with the destructive "Abandon round" tucked
 *     into a ⋯ overflow (headerRight). Back arrow reaches the hub
 *     naturally because format.tsx's Start handler calls
 *     navigation.reset to make the stack [hub, scoring] regardless of
 *     entry path.
 *   - <ScoringRoundView> — the shared edge-to-edge editing surface:
 *     CourseBanner + per-hole swipeable editing pager + footer
 *     (Scorecard sheet button · Finish primary · Like/Comments). The
 *     SUMMARY section and the Front/Back range pill were removed in the
 *     redesign.
 *   - Modals: ConfirmAbandonSheet, TeePickerSheet.
 *
 * This screen owns the RoundContext write-handler wiring
 * (setCustomHoleScore, setParticipantTees, etc), the modal stack, and
 * the Finish completion-gap check; ScoringRoundView handles the chrome.
 *
 * Round-ending exits flow only through Finish (footer primary) or
 * Abandon (⋯ overflow). Hardware back is intercepted on Android, and
 * stack-level `gestureEnabled: false` handles iOS swipe-back; both
 * prevent accidental round-loss. The header back arrow simply pops to
 * the hub — the round stays in flight and "Continue" brings the user
 * right back.
 */

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';

import { ConfirmAbandonSheet } from '@/components/scoring/ConfirmAbandonSheet';
import { TeePickerSheet } from '@/components/scoring/TeePickerSheet';
import { HeaderOverflowMenu } from '@/components/round/HeaderOverflowMenu';
import { ScoringRoundView } from '@/components/round/ScoringRoundView';
import { useRound } from '@/library/golf/RoundContext';
import {
  computeRoundCompletionGaps,
  formatCompletionWarning,
} from '@/library/golf/roundCompletion';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useTheme } from '@/library/theme/ThemeContext';
import { confirmAsync } from '@/library/utils/alert';

export default function ScoringScreen() {
  const { colors } = useTheme();
  const {
    currentRound,
    roundHydrated,
    currentHoleHydrated,
    setCustomHoleScore,
    setCurrentHole,
    setParticipantTee,
    setParticipantTees,
    completeCurrentRound,
    abandonCurrentRound,
  } = useRound();

  const [abandonConfirmVisible, setAbandonConfirmVisible] = useState(false);
  const [teeEditTarget, setTeeEditTarget] = useState<string | null>(null);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Per-hole-details rows + participant resolver are read here so
  // the Finish handler can synchronously compute missing-score AND
  // missing-stat warnings without spinning up another fetch.
  const { rows: detailsRows } = useRoundHoleDetails(currentRound?.id ?? null);
  const resolverKeys = useMemo<string[]>(
    () => currentRound?.playerIds ?? [],
    [currentRound]
  );
  const resolver = useParticipantResolver(resolverKeys);

  // Stash handlers in refs so background-back / focus listeners hold
  // the freshest closures (Android back fires after a render snapshot
  // already captured the prior value).
  const currentRoundRef = useRef(currentRound);
  useEffect(() => {
    currentRoundRef.current = currentRound;
  });
  const detailsRowsRef = useRef(detailsRows);
  useEffect(() => {
    detailsRowsRef.current = detailsRows;
  });
  const resolverRef = useRef(resolver);
  useEffect(() => {
    resolverRef.current = resolver;
  });

  const handleFinish = useCallback(async () => {
    const round = currentRoundRef.current;
    if (!round) return;
    const gaps = computeRoundCompletionGaps(
      round,
      detailsRowsRef.current,
      (pk) => resolverRef.current.get(pk)?.displayName
    );
    if (!gaps.isComplete) {
      const body = formatCompletionWarning(gaps);
      const ok = await confirmAsync(
        'Finish with missing data?',
        `${body}\n\nYou can finish anyway — completed rounds aren’t editable later in this milestone.`
      );
      if (!ok) return;
    }
    await completeCurrentRound();
  }, [completeCurrentRound]);

  // Block Android hardware back while the locked round is on screen.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  // Bounce back to the score-tab root when there is no active round
  // and the local cache has been read. Covers Finish, Abandon, remote
  // completion, and direct-URL loads with no active round. Replace (not
  // dismissAll) to avoid POP_TO_TOP on a freshly-loaded stack with no
  // entries beneath.
  //
  // Mount-grace window: format.tsx's "Start round" handler navigates to
  // scoring immediately after startRound's local write resolves. There's
  // a brief tick between that write landing and RoundProvider surfacing
  // the new currentRound. Without the grace window, scoring would mount,
  // see currentRound=null while roundHydrated=true (from a prior
  // session), and bounce back to the hub before the subscription caught
  // up. 120ms is well under perceptible latency.
  const [mountGraceExpired, setMountGraceExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMountGraceExpired(true), 120);
    return () => clearTimeout(t);
  }, []);

  const hasBouncedRef = useRef(false);
  useEffect(() => {
    if (!roundHydrated) return;
    if (currentRound) {
      hasBouncedRef.current = false;
      return;
    }
    if (!mountGraceExpired) return;
    if (hasBouncedRef.current) return;
    hasBouncedRef.current = true;
    router.replace('/(tabs)/(score)' as never);
  }, [roundHydrated, currentRound, mountGraceExpired]);

  if (!roundHydrated || !currentHoleHydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!currentRound) return null;

  const round = currentRound;
  const currentHole = round.course.holes.find(
    (h) => h.number === round.currentHoleNumber
  );
  if (!currentHole) return null;

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  // Score-change handler wired into the pager. Just upserts the score
  // for the given hole; no longer auto-advances after entry.
  const handleChangeScore = (
    scorerId: string,
    holeNumber: number,
    strokes: number
  ) => {
    void setCustomHoleScore(scorerId, holeNumber, strokes);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Round',
          headerRight: () => (
            <HeaderOverflowMenu
              items={[
                {
                  key: 'abandon',
                  label: 'Abandon round',
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => setAbandonConfirmVisible(true),
                },
              ]}
            />
          ),
        }}
      />

      <ScoringRoundView
        round={round}
        profileRoutePrefix="/(tabs)/(score)/profile"
        currentHoleNumber={currentHole.number}
        onChangeCurrentHole={(n) => void setCurrentHole(n)}
        onChangeScore={handleChangeScore}
        onPressTeeForScorer={(scorerId) => setTeeEditTarget(scorerId)}
        primaryLabel="Finish round"
        onPrimary={() => void handleFinish()}
      />

      <ConfirmAbandonSheet
        visible={abandonConfirmVisible}
        onCancel={() => setAbandonConfirmVisible(false)}
        onConfirm={() => {
          setAbandonConfirmVisible(false);
          // Same pattern as handleFinish: trigger the round deletion
          // and let the defensive bounce effect handle navigation
          // once `currentRound` becomes null.
          setTimeout(() => {
            void abandonCurrentRound();
          }, 0);
        }}
      />

      <TeePickerSheet
        visible={teeEditTarget != null}
        scorerName={(() => {
          if (!teeEditTarget) return '';
          if (isScramble) {
            const team = round.teams?.find((t) => t.id === teeEditTarget);
            return team?.name ?? '';
          }
          // Stroke: scorerId IS the participantKey; the picker title is
          // informational, so we leave it blank rather than resolving.
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
        onPick={(teeId) => {
          if (teeEditTarget) {
            if (isScramble) {
              // Fan out to every team member so the whole team continues
              // to share a tee. Single batched UPDATE so the JSON
              // snapshot lands atomically (looping setParticipantTee would
              // silently drop earlier updates because each call uses the
              // same render-time participants snapshot).
              const team = round.teams?.find((t) => t.id === teeEditTarget);
              const updates = (team?.playerIds ?? []).map((pid) => ({
                participantKey: pid,
                teeId,
              }));
              void setParticipantTees(updates);
            } else {
              void setParticipantTee(teeEditTarget, teeId);
            }
          }
          setTeeEditTarget(null);
        }}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
