/**
 * Home tab that either starts a new round or scores the active current round.
 */

import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useGolfRound } from '@/state/GolfRoundContext';
import { Round } from '@/types/golf';

const quickScores = [-2, -1, 0, 1, 2];
const customStrokeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function TabOneScreen() {
  const {
    completeCurrentRound,
    currentRound,
    goToNextHole,
    goToPreviousHole,
    recentCourses,
    setCustomHoleScore,
    setHoleScore,
  } = useGolfRound();
  const [customScorePlayerId, setCustomScorePlayerId] = useState<string | null>(null);

  if (!currentRound) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Golf Scorecard</Text>
        <Text style={styles.title}>Ready to play?</Text>
        <Text style={styles.description}>
          Start a new round, or choose a recent course to preselect it during setup.
        </Text>

        <Link href="/new-round" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Start Round</Text>
          </Pressable>
        </Link>

        <Text style={styles.sectionTitle}>Recent Courses</Text>
        {recentCourses.map((course) => (
          <Link
            key={course.id}
            href={{ pathname: '/new-round', params: { courseId: course.id } }}
            asChild>
            <Pressable style={styles.courseCard}>
              <Text style={styles.courseName}>{course.name}</Text>
              <Text style={styles.courseMeta}>{course.location}</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    );
  }

  const currentHole = currentRound.course.holes.find(
    (hole) => hole.number === currentRound.currentHoleNumber
  );

  if (!currentHole) {
    throw new Error(`Current hole ${currentRound.currentHoleNumber} does not exist.`);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{currentRound.course.name}</Text>
      <Text style={styles.title}>Hole {currentHole.number}</Text>
      <Text style={styles.description}>
        Par {currentHole.par}
        {currentHole.yardage ? ` · ${currentHole.yardage} yards` : ''}
      </Text>

      {currentRound.players.map((player) => {
        const score = getScore(currentRound, player.id, currentHole.number);
        const relativeScore = score ? score.strokes - currentHole.par : null;
        const isCustomScore = score && !quickScores.includes(relativeScore ?? 0);

        return (
          <View key={player.id} style={styles.playerSection}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerScore}>
                {score ? `${score.strokes} strokes` : 'No score yet'}
              </Text>
            </View>

            <View style={styles.scoreGrid}>
              {quickScores.map((quickScore) => (
                <Pressable
                  key={quickScore}
                  onPress={() => setHoleScore(player.id, currentHole.number, quickScore)}
                  style={[
                    styles.scoreButton,
                    relativeScore === quickScore && styles.selectedScoreButton,
                  ]}>
                  <Text
                    style={[
                      styles.scoreButtonText,
                      relativeScore === quickScore && styles.selectedScoreButtonText,
                    ]}>
                    {formatRelativeScore(quickScore)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setCustomScorePlayerId(player.id)}
                style={[styles.scoreButton, isCustomScore && styles.selectedScoreButton]}>
                <Text
                  style={[
                    styles.scoreButtonText,
                    isCustomScore && styles.selectedScoreButtonText,
                  ]}>
                  X
                </Text>
              </Pressable>
            </View>

            {isCustomScore ? (
              <Text style={styles.customHint}>Custom score selected: {score.strokes}</Text>
            ) : (
              <Text style={styles.customHint}>Tap X to choose a custom stroke count.</Text>
            )}
          </View>
        );
      })}

      {customScorePlayerId ? (
        <View style={styles.customScorePanel}>
          <Text style={styles.sectionTitle}>Choose custom score</Text>
          <Text style={styles.courseMeta}>
            Select the total strokes for this hole. This fixed list keeps the prototype dependency
            free.
          </Text>
          <View style={styles.customScoreGrid}>
            {customStrokeOptions.map((strokes) => (
              <Pressable
                key={strokes}
                onPress={() => {
                  setCustomHoleScore(customScorePlayerId, currentHole.number, strokes);
                  setCustomScorePlayerId(null);
                }}
                style={styles.customScoreButton}>
                <Text style={styles.customScoreButtonText}>{strokes}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.navigationRow}>
        <Pressable
          disabled={currentHole.number === 1}
          onPress={goToPreviousHole}
          style={[styles.secondaryButton, currentHole.number === 1 && styles.disabledButton]}>
          <Text style={styles.secondaryButtonText}>Prev</Text>
        </Pressable>

        {currentHole.number === currentRound.course.holes.length ? (
          <Pressable onPress={completeCurrentRound} style={styles.endButton}>
            <Text style={styles.primaryButtonText}>End Round</Text>
          </Pressable>
        ) : (
          <Pressable onPress={goToNextHole} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Next</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function getScore(round: Round, playerId: string, holeNumber: number) {
  return round.scores.find((score) => score.playerId === playerId && score.holeNumber === holeNumber);
}

function formatRelativeScore(score: number) {
  if (score > 0) {
    return `+${score}`;
  }

  return `${score}`;
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2e78b7',
    borderRadius: 999,
    marginTop: 28,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 28,
  },
  courseCard: {
    borderColor: '#d0d7de',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  courseName: {
    fontSize: 17,
    fontWeight: '700',
  },
  courseMeta: {
    color: '#687076',
    lineHeight: 20,
    marginTop: 4,
  },
  playerSection: {
    borderColor: '#d0d7de',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 28,
    padding: 16,
  },
  playerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  playerName: {
    fontSize: 20,
    fontWeight: '800',
  },
  playerScore: {
    color: '#687076',
    fontWeight: '700',
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scoreButton: {
    alignItems: 'center',
    borderColor: '#d0d7de',
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedScoreButton: {
    backgroundColor: '#2e78b7',
    borderColor: '#2e78b7',
  },
  scoreButtonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  selectedScoreButtonText: {
    color: '#fff',
  },
  customHint: {
    color: '#687076',
    marginTop: 12,
  },
  customScorePanel: {
    marginTop: 4,
  },
  customScoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  customScoreButton: {
    alignItems: 'center',
    borderColor: '#d0d7de',
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 42,
    paddingVertical: 10,
  },
  customScoreButtonText: {
    fontWeight: '800',
  },
  navigationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2e78b7',
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 116,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#2e78b7',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.35,
  },
  endButton: {
    alignItems: 'center',
    backgroundColor: '#b42318',
    borderRadius: 999,
    minWidth: 132,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
});
