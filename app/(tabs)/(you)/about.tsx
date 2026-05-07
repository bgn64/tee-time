/**
 * About screen — Phase 1 placeholder. App version, credits, links live here later.
 *
 * Also hosts the dev-only "Reset all data" affordance: wipes every persisted
 * AsyncStorage key the app owns and reloads the JS bundle so contexts re-hydrate
 * from empty storage (which falls back to seed data). Gated on `__DEV__` so it
 * never ships to production.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, DevSettings, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ComingSoon } from '@/components/ComingSoon';
import { useScreenHeader } from '@/state/HeaderContext';
import { clearAll } from '@/state/persistence';
import { useTheme } from '@/state/ThemeContext';

export default function AboutScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'You', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const handleReset = () => {
    Alert.alert(
      'Reset all data?',
      'This wipes the saved roster, courses, rounds, and theme, then reloads the app. Dev-only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearAll();
            // DevSettings.reload is only available in the dev client; in
            // production this whole block is unreachable thanks to __DEV__.
            DevSettings.reload();
          },
        },
      ]
    );
  };

  if (!__DEV__) {
    return (
      <ComingSoon
        icon="ⓘ"
        title="About Tee Time"
        body="Version, credits, and the changelog will appear here once there's a story to tell."
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ComingSoon
        icon="ⓘ"
        title="About Tee Time"
        body="Version, credits, and the changelog will appear here once there's a story to tell."
      />

      <View style={styles.devSection}>
        <Text style={styles.devLabel}>DEVELOPER</Text>
        <Pressable style={styles.dangerButton} onPress={handleReset}>
          <Text style={styles.dangerButtonText}>Reset all data</Text>
        </Pressable>
        <Text style={styles.devHint}>
          Wipes persisted storage and reloads. Seed data returns on next launch.
        </Text>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingBottom: 40,
    },
    devSection: {
      marginHorizontal: 20,
      marginTop: 8,
      padding: 16,
      borderRadius: 14,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    devLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    dangerButton: {
      backgroundColor: '#dc2626',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    dangerButtonText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 14,
      letterSpacing: 0.3,
    },
    devHint: {
      marginTop: 8,
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}
