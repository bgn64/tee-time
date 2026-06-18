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
import { StyleSheet, View } from 'react-native';

import { StatChip } from '@/components/aurora';
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
      {tiles.map((tile) =>
        tile.kind === 'binary' ? (
          <BinaryToken key={tile.label} tile={tile} styles={styles} />
        ) : (
          <IntegerToken key={tile.label} tile={tile} styles={styles} />
        )
      )}
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
  const value =
    tile.totalApplicable === 0
      ? '—'
      : tile.denom === 0
        ? `—/${tile.totalApplicable}`
        : `${tile.num}/${tile.denom}`;
  return (
    <StatChip
      label={label}
      value={value}
      state={chipState(tile.num, tile.tone)}
      style={styles.chip}
    />
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
  return (
    <StatChip
      label={label}
      value={tile.totalApplicable === 0 ? '—' : tile.sum}
      state={chipState(tile.sum, tile.tone)}
      style={styles.chip}
    />
  );
}

function chipState(value: number, tone: StatTone): 'on' | 'no' | 'neutral' {
  if (value <= 0 || tone === 'neutral') return 'neutral';
  return tone === 'good' ? 'on' : 'no';
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
    },
  });
}
