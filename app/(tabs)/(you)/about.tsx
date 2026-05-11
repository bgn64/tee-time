/**
 * About screen — Phase 1 placeholder. App version, credits, links live here later.
 *
 * Hosts a dev-only "Reset all data" affordance behind `__DEV__` so we can
 * wipe local AsyncStorage during testing. Production builds skip the dev
 * block entirely.
 *
 * Earlier the dev panel also hosted Step 8 stub toggles (auto-accept,
 * auto-claim, inject incoming request). Those were deleted alongside the
 * stub friend directory in Phase E since the friend graph is now real.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { DevSettings, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ComingSoon } from '@/components/ComingSoon';
import { OPENGOLF_ATTRIBUTION, OPENGOLF_ATTRIBUTION_URL } from '@/lib/attribution';
import { confirm } from '@/lib/dialog';
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

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset all data?',
      message:
        'This wipes the saved roster, courses, rounds, theme, account, and friends, then reloads the app. Dev-only.',
      confirmLabel: 'Reset',
      destructive: true,
    });
    if (!ok) return;
    await clearAll();
    DevSettings.reload();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ComingSoon
        icon="ⓘ"
        title="About Tee Time"
        body="Version, credits, and the changelog will appear here once there's a story to tell."
      />

      <View style={styles.dataSourcesSection}>
        <Text style={styles.sectionLabel}>DATA SOURCES</Text>
        <Pressable
          style={styles.attribLink}
          onPress={() => Linking.openURL(OPENGOLF_ATTRIBUTION_URL)}>
          <Text style={styles.attribText}>{OPENGOLF_ATTRIBUTION}</Text>
          <Text style={styles.attribUrl}>{OPENGOLF_ATTRIBUTION_URL}</Text>
        </Pressable>
      </View>

      {__DEV__ && (
        <View style={styles.devSection}>
          <Text style={styles.sectionLabel}>DEVELOPER</Text>
          <Pressable style={styles.dangerButton} onPress={handleReset}>
            <Text style={styles.dangerButtonText}>Reset all data</Text>
          </Pressable>
          <Text style={styles.devHint}>
            Wipes persisted local storage and reloads. Cloud data on Supabase is
            unaffected; sign in again to re-download.
          </Text>
        </View>
      )}
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
    dataSourcesSection: {
      marginHorizontal: 20,
      marginTop: 16,
      padding: 16,
      borderRadius: 14,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    devLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    attribLink: {
      paddingVertical: 4,
    },
    attribText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    attribUrl: {
      fontSize: 11,
      color: colors.primaryDark,
      marginTop: 2,
      fontWeight: '600',
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