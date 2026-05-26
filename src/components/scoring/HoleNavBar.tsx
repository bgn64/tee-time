/**
 * Hole navigation bar — the prev / current-hole / next chevron control
 * shared by the live scoring screen and the read-only scorecard's
 * tap-to-jump.
 *
 * Ported verbatim from the destination tee-time app, with the only
 * change being the theme-context import path (`@/state/ThemeContext`
 * → `@/library/theme/ThemeContext`). Chevrons disable at the
 * holeNumber boundaries (1 and maxHole).
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';

type Props = {
  holeNumber: number;
  par: number;
  yardage?: number;
  maxHole: number;
  onChange: (next: number) => void;
};

export function HoleNavBar({ holeNumber, par, yardage, maxHole, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const canPrev = holeNumber > 1;
  const canNext = holeNumber < maxHole;

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => onChange(Math.max(1, holeNumber - 1))}
        disabled={!canPrev}
        style={[styles.chev, !canPrev && styles.chevDisabled]}
        hitSlop={6}>
        <Text style={styles.chevText}>‹</Text>
      </Pressable>
      <View style={styles.info}>
        <Text style={styles.holeNum}>HOLE {holeNumber}</Text>
        <Text style={styles.meta}>
          PAR {par}
          {yardage ? `  ·  ${yardage} YD` : ''}
        </Text>
      </View>
      <Pressable
        onPress={() => onChange(Math.min(maxHole, holeNumber + 1))}
        disabled={!canNext}
        style={[styles.chev, !canNext && styles.chevDisabled]}
        hitSlop={6}>
        <Text style={styles.chevText}>›</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.primaryDark,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
      shadowColor: colors.primaryDark,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    chev: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevDisabled: { opacity: 0.35 },
    chevText: {
      fontSize: 20,
      lineHeight: 22,
      fontWeight: '800',
      color: '#ffffff',
    },
    info: {
      flex: 1,
      alignItems: 'center',
    },
    holeNum: {
      fontSize: 22,
      fontWeight: '800',
      color: '#ffffff',
      letterSpacing: 0.5,
      lineHeight: 24,
    },
    meta: {
      fontSize: 10,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.85)',
      letterSpacing: 0.5,
      marginTop: 2,
    },
  });
}
