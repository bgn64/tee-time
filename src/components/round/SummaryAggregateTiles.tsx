/**
 * SummaryAggregateTiles — inline horizontal row of {value, label}
 * tiles rendered under each scorer row on the Summary tab.
 *
 * Receives a pre-built list of tiles from `SummaryTabContent`,
 * which folds the round's enabled-stats set + per-(scorer, hole)
 * details rows into one tile per enabled stat.
 *
 * Render rules:
 *   - Binary  : `N/M`. Em-dash when there are no applicable holes
 *               OR the user hasn't entered any value yet (denom is
 *               0). Tile coloured per the stat's `yesTone` when
 *               num > 0.
 *   - Integer : `N`. Sub-line "thru K holes" shows only when
 *               taggedCount < totalApplicable. Tile coloured per
 *               the stat's `aggregateTone` when sum > 0 and the
 *               tone isn't neutral.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { StatTone } from '@/library/golf/builtInStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type AggregateTile =
  | {
      kind: 'binary';
      label: string;
      num: number;
      denom: number;
      totalApplicable: number;
      tone: StatTone;
    }
  | {
      kind: 'integer';
      label: string;
      sum: number;
      taggedCount: number;
      totalApplicable: number;
      tone: StatTone;
    };

type Props = {
  tiles: readonly AggregateTile[];
};

export function SummaryAggregateTiles({ tiles }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (tiles.length === 0) return null;

  return (
    <View style={styles.row}>
      {tiles.map((tile) =>
        tile.kind === 'binary' ? (
          <BinaryTile key={tile.label} tile={tile} styles={styles} />
        ) : (
          <IntegerTile key={tile.label} tile={tile} styles={styles} />
        )
      )}
    </View>
  );
}

type StylesShape = ReturnType<typeof makeStyles>;

function BinaryTile({
  tile,
  styles,
}: {
  tile: Extract<AggregateTile, { kind: 'binary' }>;
  styles: StylesShape;
}) {
  const wrapStyle = [
    styles.tile,
    tile.num > 0 && tile.tone === 'good' && styles.tileGood,
    tile.num > 0 && tile.tone === 'bad' && styles.tileBad,
  ];
  if (tile.totalApplicable === 0 || tile.denom === 0) {
    return (
      <View style={wrapStyle}>
        <Text style={styles.value}>—</Text>
        <Text style={styles.label}>{tile.label.toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <View style={wrapStyle}>
      <Text style={styles.value}>
        {tile.num}
        <Text style={styles.denom}>/{tile.denom}</Text>
      </Text>
      <Text style={styles.label}>{tile.label.toUpperCase()}</Text>
    </View>
  );
}

function IntegerTile({
  tile,
  styles,
}: {
  tile: Extract<AggregateTile, { kind: 'integer' }>;
  styles: StylesShape;
}) {
  const colored = tile.sum > 0 && tile.tone !== 'neutral';
  const wrapStyle = [
    styles.tile,
    colored && tile.tone === 'good' && styles.tileGood,
    colored && tile.tone === 'bad' && styles.tileBad,
  ];
  if (tile.totalApplicable === 0) {
    return (
      <View style={wrapStyle}>
        <Text style={styles.value}>—</Text>
        <Text style={styles.label}>{tile.label.toUpperCase()}</Text>
      </View>
    );
  }
  const partial = tile.taggedCount < tile.totalApplicable;
  return (
    <View style={wrapStyle}>
      <Text style={styles.value}>{tile.sum}</Text>
      <Text style={styles.label}>{tile.label.toUpperCase()}</Text>
      {partial ? (
        <Text style={styles.sub}>thru {tile.taggedCount}</Text>
      ) : null}
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
    tileGood: {
      backgroundColor: colors.primary,
    },
    tileBad: {
      backgroundColor: colors.accent,
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
    sub: {
      marginTop: 3,
      fontSize: 8.5,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.3,
    },
  });
}
