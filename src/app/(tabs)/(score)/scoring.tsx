/**
 * Live scoring screen — the Rounds tab's scoring surface, reached
 * from the hub's "Continue" action whenever a round is in flight.
 *
 * State ② of the four-state round-detail model (in-progress +
 * editing). Composes:
 *
 *   - Native stack header with the destructive "Abandon round" in a ⋯
 *     overflow (headerRight); the same action is also offered as an
 *     inline link under the Finish button (mockup parity). Back arrow
 *     reaches the hub naturally because players.tsx's Start handler
 *     calls navigation.reset to make the stack [hub, scoring]
 *     regardless of entry path.
 *   - <ScoringRoundView> — the shared edge-to-edge editing surface:
 *     compact course info bar + per-hole editor + Finish primary +
 *     inline Abandon link.
 *     The SUMMARY section, scorecard button, and social action bar were
 *     removed in the redesign.
 *   - Modals: ConfirmAbandonSheet.
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
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';

import { ConfirmAbandonSheet } from '@/components/scoring/ConfirmAbandonSheet';
import { NeonButton, PhoneFrame } from '@/components/aurora';
import { HeaderOverflowMenu } from '@/components/round/HeaderOverflowMenu';
import type { ScoringLens } from '@/components/round/LensSwitcher';
import { ScoringCardLens } from '@/components/round/ScoringCardLens';
import { ScoringChatLens } from '@/components/round/ScoringChatLens';
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
    completeCurrentRound,
    abandonCurrentRound,
  } = useRound();

  const [abandonConfirmVisible, setAbandonConfirmVisible] = useState(false);
  const [lens, setLens] = useState<ScoringLens>('hole');
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
  // Mount-grace window: players.tsx's "Start round" handler navigates to
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
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!currentRound) return null;

  const round = currentRound;
  const currentHole = round.course.holes.find(
    (h) => h.number === round.currentHoleNumber
  );
  // A round should never begin without hole data (guarded in startRound +
  // players.tsx). But if an edge/legacy round has an empty scorecard, never
  // render a blank screen: the picker redirects back here because a round is
  // "in flight", which would trap the user. Surface a recoverable state so
  // they can abandon it and start over.
  if (!currentHole) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scoring' }} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>This round has no scorecard</Text>
          <Text style={styles.emptyBody}>
            {`We couldn't load hole data for ${round.course.name || 'this course'}, so it can't be scored. Abandon it to start a new round.`}
          </Text>
          <NeonButton label="Abandon round" onPress={() => setAbandonConfirmVisible(true)} />
        </View>
        <ConfirmAbandonSheet
          visible={abandonConfirmVisible}
          onCancel={() => setAbandonConfirmVisible(false)}
          onConfirm={() => {
            setAbandonConfirmVisible(false);
            setTimeout(() => {
              void abandonCurrentRound();
            }, 0);
          }}
        />
      </View>
    );
  }

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
          title: 'Scoring',
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

      <PhoneFrame>
        <ScoringRoundView
          round={round}
          profileRoutePrefix="/(tabs)/(score)/profile"
          currentHoleNumber={currentHole.number}
          onChangeCurrentHole={(n) => void setCurrentHole(n)}
          onChangeScore={handleChangeScore}
          primaryLabel="Finish round ›"
          onPrimary={() => void handleFinish()}
          secondaryLabel="Abandon round"
          onSecondary={() => setAbandonConfirmVisible(true)}
          lens={lens}
          onChangeLens={setLens}
          cardLens={
            <ScoringCardLens round={round} currentHoleNumber={currentHole.number} />
          }
          chatLens={<ScoringChatLens round={round} />}
        />
      </PhoneFrame>

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
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 14,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '900',
      color: colors.textTitle,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 6,
    },
  });
}
