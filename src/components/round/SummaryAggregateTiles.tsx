/**
 * SummaryAggregateTiles — inline horizontal row of {value, label}
 * tiles rendered under each scorer row on the Summary tab.
 *
 * Receives a pre-filtered list of tiles from
 * `filterAggregatesByEnabled` (Phase 5). Renders nothing when the
 * list is empty so scorers who've opted every tag off don't see a
 * row of placeholder zeros.
 *
 * Tiles with a `denom > 0` render as `N/M`; tiles without a denom
 * (OB, Sand) render the raw count.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AggregateTile } from '@/library/golf/aggregateStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  tiles: readonly AggregateTile[];
};

export function SummaryAggregateTiles({ tiles }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (tiles.length === 0) return null;

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
