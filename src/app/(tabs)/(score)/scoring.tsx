/**
 * Live scoring screen — root of the Score tab once a round is active.
 *
 * State ② of the four-state round-detail model (in-progress +
 * editing). Composes:
 *
 *   - Pinned top bar with SCORE label, optional range pill, Finish.
 *   - <RoundDetailView isEditing> for the band + HoleNavBar +
 *     ScorerStack + ReadOnlyScorecard + CommentsSection, with the
 *     Abandon button passed in via `footerActions`.
 *   - Modals: ConfirmAbandonSheet, RangeDropdown, TeePickerSheet.
 *
 * Why this screen isn't *just* <RoundDetailView>: it owns the
 * pinned top bar (so SCORE + Finish stay visible during long
 * scrolls), the modal stack, and the RoundContext write-handler
 * wiring (setCustomHoleScore, setHoleRange, setParticipantTees,
 * etc). The shared component handles the scrollable content.
 *
 * Hardware back is intercepted on Android — round exits only happen
 * through Finish or Abandon. Stack-level `gestureEnabled: false`
 * handles iOS swipe-back.
 */

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConfirmAbandonSheet } from '@/components/scoring/ConfirmAbandonSheet';
import { RangeDropdown, rangeLabel } from '@/components/scoring/RangeDropdown';
import { TeePickerSheet } from '@/components/scoring/TeePickerSheet';
import { RoundDetailView } from '@/components/round/RoundDetailView';
import { useRound } from '@/library/golf/RoundContext';
import { holesInRange } from '@/library/golf/scoring';
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
    setHoleRange,
    setParticipantTee,
    setParticipantTees,
    completeCurrentRound,
    abandonCurrentRound,
  } = useRound();

  const [abandonConfirmVisible, setAbandonConfirmVisible] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [teeEditTarget, setTeeEditTarget] = useState<string | null>(null);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Stash handlers in refs so background-back / focus listeners hold
  // the freshest closures (Android back fires after a render snapshot
  // already captured the prior value).
  const currentRoundRef = useRef(currentRound);
  useEffect(() => {
    currentRoundRef.current = currentRound;
  });

  const handleFinish = useCallback(async () => {
    const round = currentRoundRef.current;
    if (!round) return;
    const inRange = holesInRange(round.course.holes, round.holeRange);
    const isScramble =
      round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
    const requiredScorerIds = isScramble
      ? round.teams!.map((t) => t.id)
      : round.playerIds;
    const fullyScored = inRange.every((h) =>
      requiredScorerIds.every((sid) =>
        round.scores.some(
          (s) => s.scorerId === sid && s.holeNumber === h.number
        )
      )
    );
    if (!fullyScored) {
      const ok = await confirmAsync(
        'Finish with missing scores?',
        `Not every hole has a score yet (${inRange.length} total). You can finish anyway — completed rounds aren't editable later in this milestone.`
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
  // and PowerSync's local cache has been read. Covers Finish, Abandon,
  // remote completion, and direct-URL loads with no active round.
  // Replace (not dismissAll) to avoid POP_TO_TOP on a freshly-loaded
  // stack with no entries beneath.
  const hasBouncedRef = useRef(false);
  useEffect(() => {
    if (!roundHydrated) return;
    if (currentRound) {
      hasBouncedRef.current = false;
      return;
    }
    if (hasBouncedRef.current) return;
    hasBouncedRef.current = true;
    router.replace('/(tabs)/(score)' as never);
  }, [roundHydrated, currentRound]);

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

  const inRangeHoles = holesInRange(round.course.holes, round.holeRange);
  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const scorerCount = isScramble
    ? (round.teams?.length ?? 0)
    : round.playerIds.length;
  const isSingleScorer = scorerCount === 1;

  const currentIdxInRange = inRangeHoles.findIndex(
    (h) => h.number === currentHole.number
  );
  const nextInRangeHoleNumber =
    currentIdxInRange >= 0 && currentIdxInRange < inRangeHoles.length - 1
      ? inRangeHoles[currentIdxInRange + 1].number
      : null;

  // Score-change handler wired into ScorerStack. On every entry it
  // upserts the score, then auto-advances to the next in-range hole
  // when there's only one scorer (matches the prior solo-flow UX).
  const handleChangeScore = (
    scorerId: string,
    holeNumber: number,
    strokes: number
  ) => {
    void setCustomHoleScore(scorerId, holeNumber, strokes);
    if (isSingleScorer && nextInRangeHoleNumber !== null) {
      void setCurrentHole(nextInRangeHoleNumber);
    }
  };

  const abandonButton = (
    <Pressable
      style={styles.abandonBtn}
      onPress={() => setAbandonConfirmVisible(true)}>
      <Text style={styles.abandonBtnText}>Abandon round</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topBarLabel}>SCORE</Text>
          {round.course.holes.length >= 18 ? (
            <Pressable
              style={[
                styles.rangePill,
                rangeMenuOpen && styles.rangePillActive,
              ]}
              onPress={() => setRangeMenuOpen(true)}
              hitSlop={4}>
              <Text
                style={[
                  styles.rangePillText,
                  rangeMenuOpen && styles.rangePillTextActive,
                ]}>
                {rangeLabel(round.holeRange)}
              </Text>
              <Text
                style={[
                  styles.rangePillChev,
                  rangeMenuOpen && styles.rangePillChevActive,
                ]}>
                {rangeMenuOpen ? '▴' : '▾'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => handleFinish()} style={styles.finishBtn}>
          <Text style={styles.finishBtnText}>Finish</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <RoundDetailView
          round={round}
          isEditing
          currentHoleNumber={currentHole.number}
          onChangeCurrentHole={(n) => void setCurrentHole(n)}
          onChangeScore={handleChangeScore}
          onPressTeeForScorer={(scorerId) => setTeeEditTarget(scorerId)}
          profileRoutePrefix="/(tabs)/(score)/profile"
          footerActions={abandonButton}
        />
      </ScrollView>

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

      <RangeDropdown
        visible={rangeMenuOpen}
        current={round.holeRange}
        onCancel={() => setRangeMenuOpen(false)}
        onPick={(next) => {
          setRangeMenuOpen(false);
          void setHoleRange(next);
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
          // Stroke: scorerId IS the participantKey; the team-avatar
          // cluster carries the name, but for the picker title we
          // just look up the first member's resolver name. Keeping
          // simple — TeePickerSheet's scorerName is informational.
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
              // Fan out to every team member so the whole team
              // continues to share a tee. Single batched UPDATE so
              // the JSON snapshot lands atomically (looping
              // setParticipantTee would silently drop earlier
              // updates because each call uses the same render-time
              // participants snapshot).
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
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 4,
    },
    topBarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    topBarLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
    },
    finishBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
    },
    finishBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
      letterSpacing: 0.4,
    },
    rangePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.chipBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    rangePillActive: {
      backgroundColor: colors.primary,
    },
    rangePillText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.primaryDark,
    },
    rangePillTextActive: { color: '#fff' },
    rangePillChev: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: '800',
    },
    rangePillChevActive: { color: '#fff' },
    content: {
      padding: 14,
      paddingBottom: 40,
    },
    abandonBtn: {
      borderWidth: 1,
      borderColor: '#f5cccc',
      borderRadius: 11,
      paddingVertical: 11,
      alignItems: 'center',
    },
    abandonBtnText: {
      color: '#d54848',
      fontWeight: '800',
      fontSize: 12,
    },
  });
}
