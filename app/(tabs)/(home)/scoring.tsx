/**
 * Scoring screen with adaptive layout for 1-4 players.
 * - 1 player: expanded card, 64px chips
 * - 2 players: both expanded, 44px chips
 * - 3-4 players: accordion (one expanded at a time), 46px chips
 */

import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useTheme } from '@/state/ThemeContext';
import { Player, Round } from '@/types/golf';

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

function getPlayerTotalRelative(round: Round, playerId: string): string {
  let total = 0;
  let holesScored = 0;
  for (const score of round.scores) {
    if (score.playerId !== playerId) continue;
    const hole = round.course.holes.find((h) => h.number === score.holeNumber);
    if (!hole) continue;
    total += score.strokes - hole.par;
    holesScored++;
  }
  if (holesScored === 0) return '';
  const prefix = total > 0 ? '+' : total === 0 ? '' : '';
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
  } = useGolfRound();

  const playerCount = currentRound?.players.length ?? 0;
  const useAccordion = playerCount >= 3;
  const chipSize = playerCount === 1 ? 64 : playerCount === 2 ? 44 : 46;

  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(
    currentRound?.players[0]?.id ?? null
  );

  const styles = useMemo(
    () => makeStyles(colors, chipSize, useAccordion),
    [colors, chipSize, useAccordion]
  );

  const handleScore = useCallback(
    (playerId: string, relative: number) => {
      if (!currentRound) return;
      setHoleScore(playerId, currentRound.currentHoleNumber, relative);

      // Auto-advance accordion to next unscored player
      if (useAccordion) {
        const currentIdx = currentRound.players.findIndex((p) => p.id === playerId);
        const nextUnscored = currentRound.players.find((p, i) => {
          if (i <= currentIdx) return false;
          const hasScore = currentRound.scores.some(
            (s) => s.playerId === p.id && s.holeNumber === currentRound.currentHoleNumber
          );
          return !hasScore;
        });
        if (nextUnscored) {
          setExpandedPlayerId(nextUnscored.id);
        }
      }
    },
    [currentRound, setHoleScore, useAccordion]
  );

  if (!currentRound) {
    router.replace('./');
    return null;
  }

  const currentHole = currentRound.course.holes.find(
    (h) => h.number === currentRound.currentHoleNumber
  );
  if (!currentHole) return null;

  const isLastHole = currentHole.number === currentRound.course.holes.length;

  function handleNext() {
    if (isLastHole) {
      completeCurrentRound();
      router.replace('./');
    } else {
      goToNextHole();
      // Reset accordion to first unscored on new hole
      if (useAccordion) {
        setExpandedPlayerId(currentRound!.players[0]?.id ?? null);
      }
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {currentRound.course.holes.map((hole) => {
            const allScored = currentRound.players.every((p) =>
              currentRound.scores.some(
                (s) => s.playerId === p.id && s.holeNumber === hole.number
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

        {/* Centered hole info */}
        <View style={styles.holeInfo}>
          <View style={styles.holeBadge}>
            <Text style={styles.holeBadgeText}>{currentHole.number}</Text>
          </View>
          <Text style={styles.holeTitle}>Hole {currentHole.number}</Text>
          <Text style={styles.holeMeta}>
            Par {currentHole.par}
            {currentHole.yardage ? ` · ${currentHole.yardage} yards` : ''}
          </Text>
        </View>

        {/* Player cards */}
        {currentRound.players.map((player) => {
          const score = currentRound.scores.find(
            (s) => s.playerId === player.id && s.holeNumber === currentHole.number
          );
          const relativeScore = score ? score.strokes - currentHole.par : null;
          const totalStr = getPlayerTotalRelative(currentRound, player.id);
          const isExpanded = !useAccordion || expandedPlayerId === player.id;

          return (
            <View key={player.id} style={[styles.playerCard, isExpanded && styles.playerCardExpanded]}>
              <Pressable
                style={styles.playerHeader}
                onPress={() => useAccordion && setExpandedPlayerId(player.id)}>
                <View
                  style={[styles.playerAvatar, { backgroundColor: player.color || colors.primary }]}>
                  <Text style={styles.playerAvatarText}>{player.name[0]}</Text>
                </View>
                <Text style={styles.playerName}>{player.name}</Text>
                {score && (
                  <View style={styles.scoredBadge}>
                    <Text style={styles.scoredBadgeText}>{score.strokes} ✓</Text>
                  </View>
                )}
                {totalStr ? (
                  <View style={styles.totalBadge}>
                    <Text style={styles.totalBadgeText}>{totalStr}</Text>
                  </View>
                ) : null}
                {useAccordion && (
                  <Text style={styles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
                )}
              </Pressable>

              {isExpanded && (
                <View style={styles.chipsContainer}>
                  {SCORE_OPTIONS.map((rel) => {
                    const isSelected = relativeScore === rel;
                    return (
                      <Pressable
                        key={rel}
                        onPress={() => handleScore(player.id, rel)}
                        style={styles.chipWrapper}>
                        <View style={[styles.chip, isSelected && styles.chipSelected]}>
                          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                            {formatScore(rel)}
                          </Text>
                        </View>
                        <Text style={styles.chipLabel}>{scoreLabel(rel)}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => handleScore(player.id, 3)}
                    style={styles.chipWrapper}>
                    <View
                      style={[
                        styles.chip,
                        relativeScore !== null &&
                          !SCORE_OPTIONS.includes(relativeScore) &&
                          styles.chipSelected,
                      ]}>
                      <Text
                        style={[
                          styles.chipText,
                          relativeScore !== null &&
                            !SCORE_OPTIONS.includes(relativeScore) &&
                            styles.chipTextSelected,
                        ]}>
                        ...
                      </Text>
                    </View>
                    <Text style={styles.chipLabel}>Other</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Navigation row */}
      <View style={styles.navRow}>
        <Pressable
          style={[styles.navBtn, currentHole.number === 1 && styles.navBtnDisabled]}
          onPress={goToPreviousHole}
          disabled={currentHole.number === 1}>
          <Text style={[styles.navBtnText, currentHole.number === 1 && styles.navBtnTextDisabled]}>
            ← Back
          </Text>
        </Pressable>
        <Pressable
          style={[styles.navBtn, styles.navBtnNext, isLastHole && styles.navBtnFinish]}
          onPress={handleNext}>
          <Text style={styles.navBtnNextText}>
            {isLastHole ? 'Finish Round' : 'Next →'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  chipSize: number,
  useAccordion: boolean
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingTop: 56,
      paddingBottom: 100,
    },
    dotsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 5,
      marginBottom: 20,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotScored: {
      backgroundColor: colors.primary,
    },
    dotCurrent: {
      backgroundColor: colors.accent,
      width: 20,
      height: 8,
      borderRadius: 4,
    },
    holeInfo: {
      alignItems: 'center',
      marginBottom: 24,
    },
    holeBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    holeBadgeText: {
      color: '#ffffff',
      fontSize: 26,
      fontWeight: '800',
    },
    holeTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
    },
    holeMeta: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 3,
    },
    playerCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: useAccordion ? 8 : 12,
      padding: useAccordion ? 10 : 14,
    },
    playerCardExpanded: {
      borderColor: colors.accent,
      borderWidth: 1.5,
    },
    playerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    playerAvatar: {
      width: useAccordion ? 30 : 34,
      height: useAccordion ? 30 : 34,
      borderRadius: useAccordion ? 15 : 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerAvatarText: {
      color: '#ffffff',
      fontSize: useAccordion ? 13 : 14,
      fontWeight: '800',
    },
    playerName: {
      flex: 1,
      fontSize: useAccordion ? 15 : 16,
      fontWeight: '700',
      color: colors.textTitle,
      marginLeft: 10,
    },
    scoredBadge: {
      backgroundColor: colors.chipBg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginRight: 6,
    },
    scoredBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    totalBadge: {
      backgroundColor: colors.chipBg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    totalBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    chevron: {
      fontSize: 12,
      color: colors.textMuted,
      marginLeft: 8,
    },
    chipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: useAccordion ? 8 : 10,
      marginTop: 14,
    },
    chipWrapper: {
      alignItems: 'center',
    },
    chip: {
      width: chipSize,
      height: chipSize,
      borderRadius: chipSize / 2,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipSelected: {
      backgroundColor: colors.chipSelectedBg,
      shadowColor: colors.chipSelectedBg,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    chipText: {
      fontSize: chipSize > 50 ? 18 : 15,
      fontWeight: '800',
      color: colors.chipText,
    },
    chipTextSelected: {
      color: colors.chipSelectedText,
    },
    chipLabel: {
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 3,
    },
    navRow: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      gap: 12,
      backgroundColor: colors.background,
      padding: 20,
      paddingBottom: 34,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    navBtn: {
      flex: 1,
      alignItems: 'center',
      borderRadius: 20,
      backgroundColor: colors.chipBg,
      paddingVertical: 14,
    },
    navBtnDisabled: {
      opacity: 0.35,
    },
    navBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textMuted,
    },
    navBtnTextDisabled: {
      color: colors.border,
    },
    navBtnNext: {
      backgroundColor: colors.primary,
    },
    navBtnFinish: {
      backgroundColor: colors.accent,
    },
    navBtnNextText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#ffffff',
    },
  });
}
