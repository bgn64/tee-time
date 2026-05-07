/**
 * Scoring screen — root of the Score tab once a round is active (Model B
 * "locked round"). Each scoring entity is rendered as an always-expanded card
 * with labeled score chips. Stroke rounds: one card per player; Scramble
 * rounds: one card per team with a single chip row (one ball per team).
 * Chip size scales by entity count (60 / 44 / 42 px) for touch ergonomics.
 *
 * Header chrome: left = "SCORE" (no back button), right = ⋯ overflow menu.
 * Hardware back is intercepted on Android so the locked round can't be exited
 * via gesture; round-level exits go through the ⋯ sheet.
 */

import { useFocusEffect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConfirmAbandonSheet } from '@/components/ConfirmAbandonSheet';
import { RoundActionsSheet } from '@/components/RoundActionsSheet';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

const SCORE_OPTIONS = [-2, -1, 0, 1, 2];

function formatScore(relative: number): string {
  if (relative === 0) return 'E';
  if (relative > 0) return `+${relative}`;
  return `${relative}`;
}

function scoreLabel(relative: number): string {
  switch (relative) {
    case -2: return 'Eagle';
    case -1: return 'Birdie';
    case 0: return 'Par';
    case 1: return 'Bogey';
    case 2: return 'Dbl';
    default: return 'Other';
  }
}

// Total relative-to-par for any scorer (player in stroke, team in scramble).
// Both rounds shape scores the same way once the scorer id resolves.
function getScorerTotalRelative(round: Round, scorerId: string): string {
  let total = 0;
  let holesScored = 0;
  for (const score of round.scores) {
    if (score.scorerId !== scorerId) continue;
    const hole = round.course.holes.find((h) => h.number === score.holeNumber);
    if (!hole) continue;
    total += score.strokes - hole.par;
    holesScored++;
  }
  if (holesScored === 0) return '';
  if (total === 0) return `E thru ${holesScored}`;
  const prefix = total > 0 ? '+' : '';
  return `${prefix}${total} thru ${holesScored}`;
}

export default function ScoringScreen() {
  const { colors } = useTheme();
  const {
    currentRound,
    setHoleScore,
    goToNextHole,
    goToPreviousHole,
    completeCurrentRound,
    abandonCurrentRound,
  } = useGolfRound();
  const { getPlayer } = usePlayers();

  const [actionsOpen, setActionsOpen] = useState(false);
  const [abandonConfirmVisible, setAbandonConfirmVisible] = useState(false);

  // Header chrome: SCORE label, ⋯ overflow trigger. Re-applied on focus.
  useScreenHeader({
    left: { kind: 'text', text: 'SCORE' },
    right: { kind: 'menu', onPress: () => setActionsOpen(true) },
  });

  // Block Android hardware back while the locked round is on screen — round
  // exits must go through the ⋯ sheet.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  // Chip size scales by the number of cards on screen (one per scoring entity).
  const isScramble =
    currentRound?.scoringRule === 'scramble' && (currentRound.teams?.length ?? 0) > 0;
  const entityCount = isScramble
    ? currentRound!.teams!.length
    : currentRound?.playerIds.length ?? 0;
  const chipSize = entityCount === 1 ? 60 : entityCount === 2 ? 44 : 42;

  const styles = useMemo(() => makeStyles(colors, chipSize), [colors, chipSize]);

  const handleScore = useCallback(
    (scorerId: string, relative: number) => {
      if (!currentRound) return;
      setHoleScore(scorerId, currentRound.currentHoleNumber, relative);
    },
    [currentRound, setHoleScore]
  );

  if (!currentRound) {
    // Defensive: bounce back to tab root if the round disappeared.
    router.replace('/(tabs)/(score)');
    return null;
  }

  const currentHole = currentRound.course.holes.find(
    (h) => h.number === currentRound.currentHoleNumber
  );
  if (!currentHole) return null;

  const isLastHole = currentHole.number === currentRound.course.holes.length;

  // Scorer ids that need a recorded score to advance the hole.
  const requiredScorerIds = isScramble
    ? currentRound.teams!.map((t) => t.id)
    : currentRound.playerIds;

  const allScoredThisHole = requiredScorerIds.every((sid) =>
    currentRound.scores.some(
      (s) => s.scorerId === sid && s.holeNumber === currentHole.number
    )
  );

  function handleNext() {
    if (!allScoredThisHole) return;
    if (isLastHole) {
      completeCurrentRound();
      router.replace('/(tabs)/(score)');
    } else {
      goToNextHole();
    }
  }

  function handleFinishFromMenu() {
    completeCurrentRound();
    router.replace('/(tabs)/(score)');
  }

  function handleAbandonFromMenu() {
    setAbandonConfirmVisible(true);
  }

  function handleAbandonConfirmed() {
    setAbandonConfirmVisible(false);
    // Defer navigation a tick so the modal's fade-out animation isn't
    // clipped by the screen transition.
    setTimeout(() => {
      abandonCurrentRound();
      router.replace('/(tabs)/(score)');
    }, 0);
  }

  function handleViewScorecard() {
    router.push('/(tabs)/(score)/scorecard');
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.dotsRow}>
          {currentRound.course.holes.map((hole) => {
            const allScored = requiredScorerIds.every((sid) =>
              currentRound.scores.some(
                (s) => s.scorerId === sid && s.holeNumber === hole.number
              )
            );
            const isCurrent = hole.number === currentRound.currentHoleNumber;
            return (
              <View
                key={hole.number}
                style={[
                  styles.dot,
                  allScored && styles.dotScored,
                  isCurrent && styles.dotCurrent,
                ]}
              />
            );
          })}
        </View>

        <View style={styles.holeHead}>
          <View style={styles.holeBadge}>
            <Text style={styles.holeBadgeText}>{currentHole.number}</Text>
          </View>
          <View>
            <Text style={styles.holeTitle}>
              Hole {currentHole.number}
              {isLastHole ? ' — Final' : ''}
            </Text>
            <Text style={styles.holeMeta}>
              Par {currentHole.par}
              {currentHole.yardage ? ` · ${currentHole.yardage} yards` : ''}
            </Text>
          </View>
        </View>

        {isScramble
          ? currentRound.teams!.map((team) => {
              const score = currentRound.scores.find(
                (s) => s.scorerId === team.id && s.holeNumber === currentHole.number
              );
              const relativeScore = score ? score.strokes - currentHole.par : null;
              const totalStr = getScorerTotalRelative(currentRound, team.id);
              return (
                <View
                  key={team.id}
                  style={[styles.teamCard, { borderLeftColor: team.color }]}>
                  <View style={styles.teamHeader}>
                    <View style={styles.avatarStack}>
                      {team.playerIds.map((pid) => {
                        const p = getPlayer(pid);
                        if (!p) return null;
                        return (
                          <View
                            key={pid}
                            style={[
                              styles.stackAvatar,
                              { backgroundColor: p.color || colors.primary },
                            ]}>
                            <Text style={styles.stackAvatarText}>{p.name[0]}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={[styles.teamLabel, { color: team.color }]}>
                      {team.name.toUpperCase()}
                    </Text>
                    {totalStr ? (
                      <View style={styles.totalBadge}>
                        <Text style={styles.totalBadgeText}>{totalStr}</Text>
                      </View>
                    ) : (
                      <View style={[styles.totalBadge, styles.totalBadgeEmpty]}>
                        <Text style={styles.totalBadgeEmptyText}>—</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.chipsContainer}>
                    {SCORE_OPTIONS.map((rel) => {
                      const isSelected = relativeScore === rel;
                      return (
                        <Pressable
                          key={rel}
                          onPress={() => handleScore(team.id, rel)}
                          style={styles.chipWrapper}>
                          <View style={[styles.chip, isSelected && styles.chipSelected]}>
                            <Text
                              style={[
                                styles.chipText,
                                isSelected && styles.chipTextSelected,
                              ]}>
                              {formatScore(rel)}
                            </Text>
                          </View>
                          <Text style={styles.chipLabel}>{scoreLabel(rel)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })
          : currentRound.playerIds.map((id) => {
              const player = getPlayer(id);
              if (!player) return null;
              const score = currentRound.scores.find(
                (s) => s.scorerId === player.id && s.holeNumber === currentHole.number
              );
              const relativeScore = score ? score.strokes - currentHole.par : null;
              const totalStr = getScorerTotalRelative(currentRound, player.id);

              return (
                <View key={player.id} style={styles.playerCard}>
                  <View style={styles.playerHeader}>
                    <View
                      style={[
                        styles.playerAvatar,
                        { backgroundColor: player.color || colors.primary },
                      ]}>
                      <Text style={styles.playerAvatarText}>{player.name[0]}</Text>
                    </View>
                    <Text style={styles.playerName}>{player.name}</Text>
                    {totalStr ? (
                      <View style={styles.totalBadge}>
                        <Text style={styles.totalBadgeText}>{totalStr}</Text>
                      </View>
                    ) : (
                      <View style={[styles.totalBadge, styles.totalBadgeEmpty]}>
                        <Text style={styles.totalBadgeEmptyText}>—</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.chipsContainer}>
                    {SCORE_OPTIONS.map((rel) => {
                      const isSelected = relativeScore === rel;
                      return (
                        <Pressable
                          key={rel}
                          onPress={() => handleScore(player.id, rel)}
                          style={styles.chipWrapper}>
                          <View style={[styles.chip, isSelected && styles.chipSelected]}>
                            <Text
                              style={[
                                styles.chipText,
                                isSelected && styles.chipTextSelected,
                              ]}>
                              {formatScore(rel)}
                            </Text>
                          </View>
                          <Text style={styles.chipLabel}>{scoreLabel(rel)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
      </ScrollView>

      <View style={styles.navRow}>
        <Pressable
          style={[styles.navBtn, currentHole.number === 1 && styles.navBtnDisabled]}
          onPress={goToPreviousHole}
          disabled={currentHole.number === 1}>
          <Text
            style={[styles.navBtnText, currentHole.number === 1 && styles.navBtnTextDisabled]}>
            ← Back
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.navBtn,
            styles.navBtnNext,
            isLastHole && styles.navBtnFinish,
            !allScoredThisHole && styles.navBtnDisabled,
          ]}
          onPress={handleNext}
          disabled={!allScoredThisHole}>
          <Text style={styles.navBtnNextText}>
            {isLastHole ? '🏁 Finish Round' : 'Next →'}
          </Text>
        </Pressable>
      </View>

      <RoundActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onViewScorecard={handleViewScorecard}
        onFinishRound={handleFinishFromMenu}
        onAbandonRound={handleAbandonFromMenu}
      />

      <ConfirmAbandonSheet
        visible={abandonConfirmVisible}
        onCancel={() => setAbandonConfirmVisible(false)}
        onConfirm={handleAbandonConfirmed}
      />
    </View>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  chipSize: number
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 100,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 2,
      marginBottom: 12,
    },
    dot: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    dotScored: { backgroundColor: colors.primary },
    dotCurrent: { backgroundColor: colors.accent },
    holeHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginBottom: 14,
    },
    holeBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    holeBadgeText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '800',
    },
    holeTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textTitle,
    },
    holeMeta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    playerCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
      padding: 12,
    },
    teamCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      marginBottom: 12,
      padding: 12,
    },
    teamHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    avatarStack: {
      flexDirection: 'row',
    },
    stackAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -8,
      borderWidth: 2,
      borderColor: colors.cardBg,
    },
    stackAvatarText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '800',
    },
    teamLabel: {
      flex: 1,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      marginLeft: 4,
    },
    playerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    playerAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerAvatarText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
    playerName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    totalBadge: {
      backgroundColor: colors.chipBg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    totalBadgeEmpty: {
      backgroundColor: colors.border,
    },
    totalBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    totalBadgeEmptyText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    chipsContainer: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 10,
    },
    chipWrapper: {
      flex: 1,
      alignItems: 'stretch',
    },
    chip: {
      height: chipSize,
      borderRadius: chipSize > 50 ? 14 : 10,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipSelected: {
      backgroundColor: colors.accent,
    },
    chipText: {
      fontSize: chipSize > 50 ? 18 : 14,
      fontWeight: '800',
      color: colors.chipText,
    },
    chipTextSelected: {
      color: colors.chipSelectedText,
    },
    chipLabel: {
      fontSize: 9,
      color: colors.textMuted,
      marginTop: 4,
      textAlign: 'center',
      fontWeight: '600',
    },
    navRow: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.background,
      padding: 14,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    navBtn: {
      flex: 1,
      alignItems: 'center',
      borderRadius: 16,
      backgroundColor: colors.chipBg,
      paddingVertical: 12,
    },
    navBtnDisabled: { opacity: 0.4 },
    navBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    navBtnTextDisabled: { color: colors.textMuted },
    navBtnNext: {
      backgroundColor: colors.primary,
    },
    navBtnFinish: {
      backgroundColor: colors.accent,
      flex: 2,
    },
    navBtnNextText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#ffffff',
    },
  });
}
