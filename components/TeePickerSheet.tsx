/**
 * Tee picker bottom sheet — opened from a player's tee pill on the
 * format screen. Lists every tee on the course, sorted longest first,
 * with total yardage + slope rating as the subtitle. Includes a
 * "No tee" option to clear a previously-set tee.
 *
 * Pure visual / state-passing component: caller controls visibility
 * and gets notified via onPick.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';
import type { Tee } from '@/types/golf';

type Props = {
  visible: boolean;
  scorerName: string;
  tees: Tee[];
  selectedTeeId?: string;
  onCancel: () => void;
  /** undefined === clear selection (the "No tee" row). */
  onPick: (teeId: string | undefined) => void;
};

const TEE_COLOR_HEX: Record<string, string> = {
  black: '#1a1a1a',
  blue: '#4a90e2',
  white: '#ddd6c4',
  gold: '#c9a64a',
  red: '#d54848',
  green: '#7cb342',
  yellow: '#f5d020',
  burgundy: '#722f37',
};

function teeSwatch(tee: Tee): string {
  if (tee.color) {
    const known = TEE_COLOR_HEX[tee.color.toLowerCase()];
    if (known) return known;
    // Some color fields contain hex already (rare).
    if (tee.color.startsWith('#')) return tee.color;
  }
  const known = TEE_COLOR_HEX[tee.name.toLowerCase()];
  return known ?? '#888';
}

export function TeePickerSheet({
  visible,
  scorerName,
  tees,
  selectedTeeId,
  onCancel,
  onPick,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Sort longest first; tees with no totalYardage sink to the bottom.
  const sorted = useMemo(() => {
    return [...tees].sort((a, b) => {
      const av = a.totalYardage ?? -1;
      const bv = b.totalYardage ?? -1;
      return bv - av;
    });
  }, [tees]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>Tee for {scorerName}</Text>
          <Text style={styles.subtitle}>Pick the tee they're playing from.</Text>

          {sorted.map((t) => {
            const active = t.id === selectedTeeId;
            return (
              <Pressable
                key={t.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => onPick(t.id)}>
                <View style={[styles.dot, { backgroundColor: teeSwatch(t) }]} />
                <Text style={styles.name}>{t.name}</Text>
                <Text style={styles.stats}>
                  {t.totalYardage ? `${t.totalYardage.toLocaleString()} yd` : '—'}
                  {t.slope ? `  ·  ${t.slope}` : ''}
                </Text>
                {active ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          })}

          <Pressable
            style={[styles.row, !selectedTeeId && styles.rowActive]}
            onPress={() => onPick(undefined)}>
            <View style={[styles.dot, styles.dotDashed]} />
            <Text style={[styles.name, !selectedTeeId ? undefined : styles.nameMuted]}>
              No tee
            </Text>
            {!selectedTeeId ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 24,
      maxHeight: '85%',
    },
    grab: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    title: { fontSize: 14, fontWeight: '800', color: colors.textTitle, marginBottom: 2 },
    subtitle: {
      fontSize: 11.5,
      color: colors.textMuted,
      marginBottom: 12,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 6,
      paddingVertical: 10,
      borderRadius: 8,
    },
    rowActive: {
      backgroundColor: 'rgba(124,179,66,0.10)',
    },
    dot: { width: 14, height: 14, borderRadius: 7 },
    dotDashed: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
    },
    name: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.textTitle },
    nameMuted: { color: colors.textMuted },
    stats: {
      fontSize: 10.5,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    check: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  });
}

export { teeSwatch };
