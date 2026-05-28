/**
 * Live scoring screen — root of the Score tab once a round is active.
 *
 * Trimmed port of the destination `scoring.tsx`:
 *   - HoleNavBar at top (prev/next + par/yardage for the scorer's tee)
 *   - One ScoreEntryRow per participant (avatar · name · running ·
 *     quick-pick chips · custom score)
 *   - ReadOnlyScorecard below (tap any cell to jump)
 *   - Inline "Finish" button at top-right (we don't have the
 *     destination's global header slots, so we render Finish ourselves)
 *   - Range dropdown for front 9 / back 9 / all 18 mid-round flip
 *   - Tap a player's tee swatch in the scorecard's Final box to swap
 *     tees mid-round via TeePickerSheet
 *   - Danger "Abandon round" button below the grid
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
import { HoleNavBar } from '@/components/scoring/HoleNavBar';
import { RangeDropdown, rangeLabel } from '@/components/scoring/RangeDropdown';
import { ReadOnlyScorecard } from '@/components/scoring/ReadOnlyScorecard';
import { ScoreEntryRow } from '@/components/scoring/ScoreEntryRow';
import type { AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { TeePickerSheet } from '@/components/scoring/TeePickerSheet';
import { yardageForHole } from '@/library/golf/courseHelpers';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useRound } from '@/library/golf/RoundContext';
import {
  formatScore,
  holesInRange,
  playerProgress,
} from '@/library/golf/scoring';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import { confirmAsync } from '@/library/utils/alert';

export default function ScoringScreen() {
  const { colors } = useTheme();
  const {
    currentRound,
    roundHydrated,
    currentHoleHydrated,
    userId,
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

  // Resolve display name / avatar color for every participant in
  // the round. Called unconditionally (before the early-return
  // branches below) so the hook order is stable. Returns an empty
  // map when there's no round yet — that's fine; the consumer code
  // is also gated on currentRound.
  const participantKeys = useMemo(
    () => currentRound?.playerIds ?? [],
    [currentRound]
  );
  const resolver = useParticipantResolver(participantKeys);

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
    // In scramble, each team is one scorer (one score row per hole),
    // so the "every scorer × every hole" gate uses team ids. In
    // stroke each participant is a scorer.
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
    // Navigation is handled by the defensive bounce effect below
    // once `currentRound` flips to null — using a single nav site
    // avoids the dismissAll-after-dismissAll race that fires
    // POP_TO_TOP on web (where the stack may only contain scoring
    // after a page reload).
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
  // and PowerSync's local cache has been read. Covers three paths:
  //
  //   · User taps Finish or Abandon → currentRound flips to null →
  //     this effect navigates them out.
  //   · Another device deletes / completes the round → same trigger.
  //   · User reloads the page while parked on /scoring with no
  //     active round (or lands on the URL fresh) → same trigger.
  //
  // We use `router.replace('/(tabs)/(score)')` instead of
  // `router.dismissAll()` because the Stack may have no entries
  // beneath scoring (e.g. immediately after a web reload), and
  // `dismissAll` fires POP_TO_TOP in that case. Replace works
  // regardless of stack history.
  //
  // `hasBouncedRef` guards against re-firing on every render after
  // the round disappears — the navigation only needs to happen once.
  // It resets when a new round arrives so a future
  // round-then-abandon cycle still triggers.
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

  const currentHole = currentRound.course.holes.find(
    (h) => h.number === currentRound.currentHoleNumber
  );
  if (!currentHole) return null;

  const maxHole = currentRound.course.holes.length;
  const inRangeHoles = holesInRange(currentRound.course.holes, currentRound.holeRange);

  // Resolve display name + avatar color for each scorer via the
  // participant resolver (PowerSync watches over profiles +
  // custom_players, with a direct-fetch fallback for unfriended
  // ex-friends). Falls back to a placeholder when the row isn't
  // resolvable (e.g., offline + ex-friend + historic round).
  //
  // In scramble: one Scorer per team. The team's `id` is the
  // opaque scorerId used for score writes (one DB row per team per
  // hole), and `members` is every team member resolved through the
  // resolver so the row's avatar cluster renders both initials.
  //
  // In stroke: one Scorer per participant. `members` is a singleton.
  const isScramble =
    currentRound.scoringRule === 'scramble' &&
    (currentRound.teams?.length ?? 0) > 0;
  const scorers = isScramble
    ? currentRound.teams!.map((team) => {
        const members: AvatarMember[] = team.playerIds.map((pid) => {
          const r = resolver.get(pid);
          return {
            id: pid,
            name: r?.displayName || 'Player',
            color: r?.avatarColor || colors.primary,
          };
        });
        return {
          id: team.id,
          name: team.name,
          color: team.color,
          members,
        };
      })
    : currentRound.playerIds.map((pid) => {
        const resolved = resolver.get(pid);
        const name = resolved?.displayName || 'Player';
        const color = resolved?.avatarColor || colors.primary;
        return {
          id: pid,
          name,
          color,
          members: [{ id: pid, name, color }],
        };
      });
  const isSingleScorer = scorers.length === 1;

  const currentIdxInRange = inRangeHoles.findIndex(
    (h) => h.number === currentHole.number
  );
  const nextInRangeHoleNumber =
    currentIdxInRange >= 0 && currentIdxInRange < inRangeHoles.length - 1
      ? inRangeHoles[currentIdxInRange + 1].number
      : null;

  // "Self"-tee yardage for the HoleNavBar — find the signed-in user's
  // participant entry and read their teeId. Falls back to the first
  // participant's tee when the user isn't a participant (the edge
  // case where they scored a round for friends without playing
  // themselves — the player picker still allows this). Previously
  // used `playerIds[0]` which assumed self was always first; that
  // held by coincidence for stroke but broke in scramble where
  // `playerIds` is `teams.flatMap(t => t.playerIds)`.
  const selfKey = userId ? userParticipantKey(userId) : undefined;
  const selfTeeId =
    (selfKey
      ? currentRound.participants.find((p) => p.participantKey === selfKey)?.teeId
      : undefined) ?? currentRound.participants[0]?.teeId;
  const headerYardage = yardageForHole(
    currentRound.course,
    currentHole.number,
    selfTeeId
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarLabel}>SCORE</Text>
        <Pressable
          onPress={() => {
            handleFinish();
          }}
          style={styles.finishBtn}>
          <Text style={styles.finishBtnText}>Finish</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleBlock}>
          <View style={styles.pillRow}>
            <View style={styles.formatPill}>
              <Text style={styles.formatPillText}>
                {isScramble ? 'SCRAMBLE' : 'STROKE'}
              </Text>
            </View>
            {currentRound.course.holes.length >= 18 && (
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
                  {rangeLabel(currentRound.holeRange)}
                </Text>
                <Text
                  style={[
                    styles.rangePillChev,
                    rangeMenuOpen && styles.rangePillChevActive,
                  ]}>
                  {rangeMenuOpen ? '▴' : '▾'}
                </Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {currentRound.course.name}
          </Text>
        </View>

        <HoleNavBar
          holeNumber={currentHole.number}
          par={currentHole.par}
          yardage={headerYardage}
          maxHole={maxHole}
          onChange={setCurrentHole}
        />

        <View style={styles.entryCard}>
          {scorers.map((s, i) => {
            const score = currentRound.scores.find(
              (sc) => sc.scorerId === s.id && sc.holeNumber === currentHole.number
            );
            const progress = playerProgress(currentRound, s.id);
            const runningValue =
              progress.thru === 0 ? 'E' : formatScore(progress.rel);
            const tone: 'over' | 'under' | 'even' =
              progress.thru === 0
                ? 'even'
                : progress.rel > 0
                ? 'over'
                : progress.rel < 0
                ? 'under'
                : 'even';
            return (
              <View key={s.id} style={i > 0 ? styles.entryRowSep : undefined}>
                <ScoreEntryRow
                  members={s.members}
                  name={s.name}
                  runningText={`${runningValue} · thru ${progress.thru}`}
                  runningTone={tone}
                  holeNumber={currentHole.number}
                  par={currentHole.par}
                  strokes={score ? score.strokes : null}
                  onChange={(strokes) => {
                    setCustomHoleScore(s.id, currentHole.number, strokes);
                    if (isSingleScorer && nextInRangeHoleNumber !== null) {
                      setCurrentHole(nextInRangeHoleNumber);
                    }
                  }}
                />
              </View>
            );
          })}
        </View>

        <Text style={styles.gridHint}>Tap any hole to jump</Text>
        <ReadOnlyScorecard
          round={currentRound}
          currentHoleNumber={currentHole.number}
          onHolePress={setCurrentHole}
          onEditTee={setTeeEditTarget}
          onPressParticipant={(userId) =>
            router.push(`/(tabs)/(score)/profile/${userId}` as never)
          }
        />

        <Pressable
          style={styles.abandonBtn}
          onPress={() => setAbandonConfirmVisible(true)}>
          <Text style={styles.abandonBtnText}>Abandon round</Text>
        </Pressable>
      </ScrollView>

      <ConfirmAbandonSheet
        visible={abandonConfirmVisible}
        onCancel={() => setAbandonConfirmVisible(false)}
        onConfirm={() => {
          setAbandonConfirmVisible(false);
          // Same pattern as handleFinish: trigger the round deletion
          // and let the defensive bounce effect handle navigation
          // once `currentRound` becomes null. Single nav site → no
          // POP_TO_TOP race.
          setTimeout(() => {
            void abandonCurrentRound();
          }, 0);
        }}
      />

      <RangeDropdown
        visible={rangeMenuOpen}
        current={currentRound.holeRange}
        onCancel={() => setRangeMenuOpen(false)}
        onPick={(next) => {
          setRangeMenuOpen(false);
          setHoleRange(next);
        }}
      />

      <TeePickerSheet
        visible={teeEditTarget != null}
        scorerName={(() => {
          if (!teeEditTarget) return '';
          const s = scorers.find((x) => x.id === teeEditTarget);
          return s?.name ?? '';
        })()}
        tees={currentRound.course.tees ?? []}
        selectedTeeId={(() => {
          if (!teeEditTarget) return undefined;
          if (isScramble) {
            // Team id → look up any member's teeId (they all share).
            const team = currentRound.teams?.find((t) => t.id === teeEditTarget);
            const firstMember = team?.playerIds[0];
            if (!firstMember) return undefined;
            const p = currentRound.participants.find(
              (q) => q.participantKey === firstMember
            );
            return p?.teeId;
          }
          const p = currentRound.participants.find(
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
              const team = currentRound.teams?.find(
                (t) => t.id === teeEditTarget
              );
              const updates = (team?.playerIds ?? []).map((pid) => ({
                participantKey: pid,
                teeId,
              }));
              void setParticipantTees(updates);
            } else {
              setParticipantTee(teeEditTarget, teeId);
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
    content: {
      padding: 14,
      paddingBottom: 32,
    },
    titleBlock: {
      marginBottom: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    pillRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      marginBottom: 4,
    },
    formatPill: {
      backgroundColor: colors.chipBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    formatPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: colors.primaryDark,
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
    entryCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 12,
    },
    entryRowSep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 3,
      paddingTop: 3,
    },
    gridHint: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
      marginBottom: 6,
      marginLeft: 4,
    },
    abandonBtn: {
      marginTop: 18,
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
