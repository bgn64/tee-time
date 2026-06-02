/**
 * HolesTabPlaceholder — Phase 1 stand-in for the Holes tab body on
 * read-only surfaces (feed card + completed-round detail view).
 *
 * Phase 3 lands the real `<HolesTabContent>` with scorer pick + hole
 * stepper-combo + hole-context summary. Until then this just renders
 * a muted "Coming soon" line so the tab is reachable without
 * crashing.
 *
 * The scoring screen uses a different placeholder strategy: while
 * `isEditing=true`, `RoundDetailView` mounts the existing
 * `HoleNavBar` + `ScorerStack` (with score chips) inside the Holes
 * tab so score entry keeps working. Phase 3 replaces that arrangement
 * with the proper per-scorer entry blocks.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function HolesTabPlaceholder() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Per-hole view coming soon</Text>
      <Text style={styles.sub}>
        Browse each hole with achievement tags and shot attribution in an
        upcoming release.
      </Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 18,
      paddingVertical: 32,
      alignItems: 'center',
      gap: 6,
    },
    title: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center',
    },
    sub: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 16,
      maxWidth: 280,
    },
  });
}
