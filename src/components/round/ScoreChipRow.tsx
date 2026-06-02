/**
 * ScoreChipRow — the −2 / −1 / E / +1 / +2 / custom quick-pick chips
 * extracted out of the old `ScorerRow`. ScoreEntryAccordion mounts
 * this directly below the shared `ScorerSummaryRow` so the editing
 * surface stays visually aligned with the Summary tab.
 *
 * Pure presentational: parent provides current par/strokes and the
 * onChange callback; the row owns only the local "custom sheet open"
 * state.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CustomScoreSheet } from '@/components/scoring/CustomScoreSheet';
import { formatScore } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  /** Display name used in the custom-score sheet heading. */
  scorerName: string;
  holeNumber: number;
  par: number;
  strokes: number | null;
  onChange: (strokes: number) => void;
};

const QUICK_PICKS: readonly { rel: number; label: string }[] = [
  { rel: -2, label: '−2' },
  { rel: -1, label: '−1' },
  { rel: 0, label: 'E' },
  { rel: 1, label: '+1' },
  { rel: 2, label: '+2' },
];

export function ScoreChipRow({
  scorerName,
  holeNumber,
  par,
  strokes,
  onChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const rel = strokes === null ? null : strokes - par;
  const customActive = rel !== null && (rel > 2 || rel < -2);

  const handleQuickPick = (relVal: number) => {
    onChange(Math.max(1, par + relVal));
  };

  return (
    <View style={styles.row}>
      {QUICK_PICKS.map((q) => {
        const isActive = rel === q.rel;
        return (
          <Pressable
            key={q.rel}
            onPress={() => handleQuickPick(q.rel)}
            style={[
              styles.chip,
              isActive &&
                (q.rel > 0 ? styles.chipActiveOver : styles.chipActive),
            ]}
            hitSlop={2}>
            <Text
              style={[styles.chipText, isActive && styles.chipTextActive]}>
              {q.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => setSheetOpen(true)}
        style={[
          styles.chip,
          customActive &&
            (rel! > 0 ? styles.chipActiveOver : styles.chipActive),
        ]}
        hitSlop={2}>
        <Text style={[styles.chipText, customActive && styles.chipTextActive]}>
          {customActive ? formatScore(rel!) : '✕'}
        </Text>
      </Pressable>

      <CustomScoreSheet
        visible={sheetOpen}
        scorerName={scorerName}
        holeNumber={holeNumber}
        par={par}
        initialStrokes={strokes}
        onCancel={() => setSheetOpen(false)}
        onConfirm={(v) => {
          setSheetOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    chip: {
      height: 38,
      minWidth: 40,
      paddingHorizontal: 6,
      borderRadius: 9,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      backgroundColor: colors.primary,
    },
    chipActiveOver: {
      backgroundColor: colors.accent,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primaryDark,
    },
    chipTextActive: {
      color: '#fff',
    },
  });
}
