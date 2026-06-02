/**
 * SummaryAggregateTiles — inline 4-tile row of {value, label} pairs
 * rendered under each scorer row on the Summary tab.
 *
 * Tiles whose `denom` is exactly 0 (no holes recorded for the
 * metric) render the numerator only; tiles with a `denom > 0`
 * render `N/M`. OB / Sand tiles never carry a denom and always
 * show the raw count.
 *
 * Phase 5 always shows all four tiles; Phase 5's storage layer
 * (`filterAggregatesByEnabled`) hides disabled tags from the
 * data, so a tile for a tag the scorer opted out of renders `0`.
 * Phase 6 may add per-tile hiding when the user has opted the
 * underlying tag out via the gear panel.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ScorerAggregates } from '@/library/golf/aggregateStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  aggregates: ScorerAggregates;
};

export function SummaryAggregateTiles({ aggregates }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const tiles = [
    aggregates.fairways,
    aggregates.gir,
    aggregates.ob,
    aggregates.sand,
  ];

  return (
    <View style={styles.row}>
      {tiles.map((tile) => (
        <View key={tile.label} style={styles.tile}>
          <Text style={styles.value}>
            {tile.value}
            {tile.denom != null && tile.denom > 0 ? (
              <Text style={styles.denom}>/{tile.denom}</Text>
            ) : null}
          </Text>
          <Text style={styles.label}>{tile.label.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 5,
    },
    tile: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
    },
    value: {
      fontSize: 14,
      fontWeight: '900',
      color: colors.textTitle,
      lineHeight: 15,
    },
    denom: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    label: {
      marginTop: 5,
      fontSize: 9,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
  });
}
