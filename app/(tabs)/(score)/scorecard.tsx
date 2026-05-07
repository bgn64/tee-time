/**
 * Scorecard view (TODO content). Reachable from the ⋯ overflow on Scoring.
 * Per the design doc, this should eventually render a full read-only grid of
 * all 18 holes × all players. Stubbed for now.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';

export default function ScorecardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Score', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scorecard</Text>
      <Text style={styles.stub}>TODO — full scorecard grid (read-only)</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
    },
    stub: {
      color: colors.textMuted,
      fontStyle: 'italic',
      fontSize: 14,
      textAlign: 'center',
    },
  });
}
