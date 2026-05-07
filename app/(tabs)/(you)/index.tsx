/**
 * You tab — profile / settings. Currently houses the theme picker; per the
 * design doc additional content (profile, stats) is TODO.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { themeNames, ThemeName, themes } from '@/constants/themes';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';

export default function YouScreen() {
  const { colors, themeName, setThemeName } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'text', text: 'YOU' },
    right: { kind: 'profile' },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>You</Text>
      <Text style={styles.sectionTitle}>Color Theme</Text>
      <View style={styles.grid}>
        {themeNames.map(({ key, label }) => {
          const isActive = key === themeName;
          const swatch = themes[key];
          return (
            <Pressable
              key={key}
              style={[styles.themeCard, isActive && styles.themeCardActive]}
              onPress={() => setThemeName(key as ThemeName)}>
              <View style={styles.swatchRow}>
                <View style={[styles.swatch, { backgroundColor: swatch.primary }]} />
                <View style={[styles.swatch, { backgroundColor: swatch.accent }]} />
                <View style={[styles.swatch, { backgroundColor: swatch.primaryDark }]} />
              </View>
              <Text style={[styles.themeLabel, isActive && styles.themeLabelActive]}>{label}</Text>
              {isActive && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingTop: 16, paddingBottom: 40 },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 24,
      marginBottom: 12,
    },
    grid: { gap: 10 },
    themeCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },
    themeCardActive: { borderColor: colors.primary },
    swatchRow: { flexDirection: 'row', gap: 6, marginRight: 14 },
    swatch: { width: 22, height: 22, borderRadius: 11 },
    themeLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textBody,
      flex: 1,
    },
    themeLabelActive: { color: colors.primary, fontWeight: '700' },
    checkmark: { fontSize: 18, fontWeight: '700', color: colors.primary },
  });
}
