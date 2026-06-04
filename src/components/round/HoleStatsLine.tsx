/**
 * HoleStatsLine — read-only inline summary of a scorer's per-hole
 * stat values, used by the per-hole viewing surface
 * (`HolesTabContent`). Renders a single `<Text>` containing
 * comma-separated tokens:
 *
 *   Binary set:   `Yes GIR` / `No GIR` (Yes/No tone-coloured)
 *   Binary unset: `— GIR` (em-dash + label, muted)
 *   Integer:      `2 putts` / `0 OB`
 *                 (value coloured per aggregateTone only when > 0
 *                 AND tone !== 'neutral' — e.g. "3 OB" red, "0 OB" not)
 *
 * Mirrors `SummaryAggregateTiles`'s inline-line treatment so the
 * per-hole and aggregate views read as the same design language.
 * Tokens are separated by `·` in the muted text colour.
 *
 * Pure presentation: caller supplies the applicable stats (already
 * filtered by enabled-set + par) and the value map for the
 * (scorer, hole) tuple.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  type StatDefinition,
  type StatValueMap,
} from '@/library/golf/builtInStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import { displayStatLabel } from '@/library/golf/statDisplay';

type Props = {
  stats: readonly StatDefinition[];
  values: StatValueMap;
};

export function HoleStatsLine({ stats, values }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (stats.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.line}>
        {stats.map((stat, i) => (
          <Text key={stat.key}>
            {i > 0 ? <Text style={styles.sep}> · </Text> : null}
            <StatToken stat={stat} value={values[stat.key]} styles={styles} />
          </Text>
        ))}
      </Text>
    </View>
  );
}

type StylesShape = ReturnType<typeof makeStyles>;

function StatToken({
  stat,
  value,
  styles,
}: {
  stat: StatDefinition;
  value: boolean | number | undefined;
  styles: StylesShape;
}) {
  const label = displayStatLabel(stat.label);

  if (stat.type === 'binary') {
    if (typeof value !== 'boolean') {
      return (
        <Text>
          <Text style={styles.unset}>—</Text>
          <Text style={styles.label}> {label}</Text>
        </Text>
      );
    }
    // yesTone='good': Yes good, No bad
    // yesTone='bad':  Yes bad,  No good
    // yesTone='neutral': both neutral
    const positive =
      stat.yesTone === 'good' ? value : stat.yesTone === 'bad' ? !value : null;
    const valueStyle =
      positive === true
        ? styles.valueGood
        : positive === false
          ? styles.valueBad
          : styles.value;
    return (
      <Text>
        <Text style={valueStyle}>{value ? 'Yes' : 'No'}</Text>
        <Text style={styles.label}> {label}</Text>
      </Text>
    );
  }

  // Integer
  const display = typeof value === 'number' ? value : stat.defaultValue;
  // Colour only when value > 0 AND tone is non-neutral. "0 OB" stays
  // neutral because zero of a bad-tone stat is the positive outcome.
  const valueStyle =
    display > 0 && stat.aggregateTone === 'bad'
      ? styles.valueBad
      : display > 0 && stat.aggregateTone === 'good'
        ? styles.valueGood
        : styles.value;
  return (
    <Text>
      <Text style={valueStyle}>{display}</Text>
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
    label: {
      color: colors.textMuted,
      fontWeight: '700',
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
