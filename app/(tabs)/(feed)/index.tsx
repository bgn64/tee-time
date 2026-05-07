/**
 * Feed tab — stub per Phase 1. Phase 3 turns this into the social feed
 * (friends' completed rounds, achievements, etc.). For now: centered placeholder.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';

export default function FeedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'text', text: 'FEED' },
    right: { kind: 'profile' },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.stubText}>TODO — fill in Feed</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: 20,
    },
    stubText: {
      color: colors.textMuted,
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
    },
  });
}
