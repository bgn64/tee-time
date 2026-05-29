/**
 * Hole navigation bar — the prev / current-hole / next chevron control
 * shared by the live scoring screen and the read-only scorecard's
 * tap-to-jump.
 *
 * Layout: dark-green pill banner with a centered info column —
 * `HOLE N · PAR X` on the top line, a horizontally-wrapping row of
 * `[swatch] {yardage}` chips on the bottom line (one per supplied
 * tee, in caller order). Chevrons disable at the holeNumber
 * boundaries (1 and maxHole).
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { teeSwatch } from './TeePickerSheet';
import { useTheme } from '@/library/theme/ThemeContext';

export type HoleNavTee = {
  id: string;
  name: string;
  color?: string;
  /** Per-hole yardage (already resolved by the caller). */
  yardage?: number;
};

type Props = {
  holeNumber: number;
  par: number;
  /** Per-tee yardages for this hole. Tees with no finite yardage on
   *  this hole should be filtered out by the caller. Empty array
   *  hides the yardage row entirely. */
  tees: readonly HoleNavTee[];
  maxHole: number;
  onChange: (next: number) => void;
};

export function HoleNavBar({ holeNumber, par, tees, maxHole, onChange }: Props) {
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
        <Text style={styles.holeNum}>
          HOLE {holeNumber}
          <Text style={styles.par}>{`  ·  PAR ${par}`}</Text>
        </Text>
        {tees.length > 0 ? (
          <View style={styles.yardRow}>
            {tees.map((tee) => {
              const swatch = teeSwatch(tee);
              // White / very light swatches need a hairline border to
              // stay visible on the dark banner background.
              const isLight = isLightHex(swatch);
              return (
                <View
                  key={tee.id}
                  style={styles.yardChip}
                  accessibilityLabel={`${tee.name} tees${
                    tee.yardage != null ? ` · ${tee.yardage} yards` : ''
                  }`}>
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: swatch },
                      isLight && styles.swatchLight,
                    ]}
                  />
                  <Text style={styles.yardText}>
                    {tee.yardage != null ? tee.yardage : '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
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

function isLightHex(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Rough perceptual luminance — anything north of ~80% reads as
  // "light" against the dark green banner and needs an outline.
  return r * 0.299 + g * 0.587 + b * 0.114 > 200;
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
      fontSize: 18,
      fontWeight: '800',
      color: '#ffffff',
      letterSpacing: 0.5,
      lineHeight: 22,
    },
    par: {
      fontSize: 13,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.85)',
      letterSpacing: 0.4,
    },
    yardRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 10,
      marginTop: 4,
    },
    yardChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    swatch: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    swatchLight: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.45)',
    },
    yardText: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.95)',
      letterSpacing: 0.2,
    },
  });
}
