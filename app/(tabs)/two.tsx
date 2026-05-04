/**
 * Rounds tab with a lightweight current/completed round summary for the prototype.
 */

import { ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useGolfRound } from '@/state/GolfRoundContext';

export default function TabTwoScreen() {
  const { completedRounds, currentRound } = useGolfRound();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Rounds</Text>
      <Text style={styles.title}>Round summary</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Round</Text>
        {currentRound ? (
          <>
            <Text style={styles.cardText}>{currentRound.course.name}</Text>
            <Text style={styles.cardMeta}>Hole {currentRound.currentHoleNumber}</Text>
          </>
        ) : (
          <Text style={styles.cardMeta}>No round in progress.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Completed in this session</Text>
      {completedRounds.length === 0 ? (
        <Text style={styles.cardMeta}>Completed rounds will appear here until the app restarts.</Text>
      ) : (
        completedRounds.map((round) => (
          <View key={round.id} style={styles.card}>
            <Text style={styles.cardTitle}>{round.course.name}</Text>
            <Text style={styles.cardMeta}>
              {round.scores.length} score{round.scores.length === 1 ? '' : 's'} recorded
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 28,
  },
  card: {
    borderColor: '#d0d7de',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  cardText: {
    fontSize: 16,
    marginTop: 8,
  },
  cardMeta: {
    color: '#687076',
    lineHeight: 20,
    marginTop: 8,
  },
});
