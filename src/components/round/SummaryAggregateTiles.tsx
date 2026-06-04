/**
 * SummaryAggregateTiles — inline single-line stat summary rendered
 * under each scorer row on the Summary tab.
 *
 * The component name is historical; the V1 redesign replaced the
 * tile-strip layout with a single `<Text>` of comma-separated
 * tokens so the final score remains the visual hero of each card.
 * Callers keep the existing import path.
 *
 * Token formatting:
 *
 *   - Binary  : `N/M GIR`. Em-dash numerator when there are no
 *               applicable holes OR the user hasn't tagged any.
 *               Coloured per the stat's `yesTone` when `num > 0`.
 *
 *   - Integer : `N putts` or `0 OB`. Coloured per the stat's
 *               `aggregateTone` only when `sum > 0` and the tone
 *               is non-neutral (so "0 OB" stays neutral — zero of
 *               a bad-tone stat is the positive outcome).
 *
 * Partial-round suffix: when fewer holes have been played /
 * tagged than the stat's applicable universe, the token gets a
 * trailing `(thru K)` segment so the reader knows the number is
 * not yet final.
 *
 * Tokens are separated by `·` in the muted text colour. Receives
 * a pre-built list of tiles from `SummaryTabContent`, which folds
 * the round's enabled-stats set + per-(scorer, hole) details rows
 * into one tile per enabled stat.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { StatTone } from '@/library/golf/builtInStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import { displayStatLabel } from '@/library/golf/statDisplay';

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
    <View style={styles.wrap}>
      <Text style={styles.line}>
        {tiles.map((tile, i) => (
          <Text key={tile.label}>
            {i > 0 ? <Text style={styles.sep}> · </Text> : null}
            {tile.kind === 'binary' ? (
              <BinaryToken tile={tile} styles={styles} />
            ) : (
              <IntegerToken tile={tile} styles={styles} />
            )}
          </Text>
        ))}
      </Text>
    </View>
  );
}

type StylesShape = ReturnType<typeof makeStyles>;

function BinaryToken({
  tile,
  styles,
}: {
  tile: Extract<AggregateTile, { kind: 'binary' }>;
  styles: StylesShape;
}) {
  const label = displayStatLabel(tile.label);
  const valueStyle =
    tile.num > 0 && tile.tone === 'good'
      ? styles.valueGood
      : tile.num > 0 && tile.tone === 'bad'
        ? styles.valueBad
        : styles.value;

  // Three display states:
  //   1. No applicable holes for the round              → "—  GIR"
  //   2. Applicable holes exist but none tagged yet     → "—/M GIR"
  //   3. Tagged                                         → "N/M GIR"
  // Partial "(thru K)" suffix is intentionally omitted — the
  // per-scorer score block already shows "THRU K" above this line.
  if (tile.totalApplicable === 0) {
    return (
      <Text>
        <Text style={styles.unset}>—</Text>
        <Text style={styles.label}> {label}</Text>
      </Text>
    );
  }
  if (tile.denom === 0) {
    return (
      <Text>
        <Text style={styles.value}>
          <Text style={styles.unset}>—</Text>
          <Text style={styles.denom}>/{tile.totalApplicable}</Text>
        </Text>
        <Text style={styles.label}> {label}</Text>
      </Text>
    );
  }
  return (
    <Text>
      <Text style={valueStyle}>{tile.num}</Text>
      <Text style={styles.denom}>/{tile.denom}</Text>
      <Text style={styles.label}> {label}</Text>
    </Text>
  );
}

function IntegerToken({
  tile,
  styles,
}: {
  tile: Extract<AggregateTile, { kind: 'integer' }>;
  styles: StylesShape;
}) {
  const label = displayStatLabel(tile.label);
  const valueStyle =
    tile.sum > 0 && tile.tone === 'bad'
      ? styles.valueBad
      : tile.sum > 0 && tile.tone === 'good'
        ? styles.valueGood
        : styles.value;

  if (tile.totalApplicable === 0) {
    return (
      <Text>
        <Text style={styles.unset}>—</Text>
        <Text style={styles.label}> {label}</Text>
      </Text>
    );
  }
  // "(thru K)" suffix intentionally omitted; the per-scorer
  // "THRU K" label above this line already covers partial rounds.
  return (
    <Text>
      <Text style={valueStyle}>{tile.sum}</Text>
      <Text style={styles.label}> {label}</Text>
    </Text>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 8,
    },
    line: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textBody,
    },
    value: {
      color: colors.textTitle,
      fontWeight: '900',
    },
    valueGood: {
      color: '#b6dd92',
      fontWeight: '900',
    },
    valueBad: {
      color: '#f3a59f',
      fontWeight: '900',
    },
    denom: {
      color: colors.textMuted,
      fontWeight: '700',
      fontSize: 11.5,
    },
    label: {
      color: colors.textMuted,
      fontWeight: '700',
    },
    unset: {
      color: colors.textMuted,
      fontWeight: '700',
    },
    sep: {
      color: colors.textMuted,
      fontWeight: '700',
    },
  });
}
