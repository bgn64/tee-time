/**
 * HoleStatsLine — read-only inline summary of a scorer's per-hole
 * stat values, used by the per-hole viewing surface
 * (`HoleDetailSheet`). Renders a single `<Text>` containing
 * comma-separated tokens:
 *
 *   Binary set:   `Yes GIR` / `No GIR` (Yes/No tone-coloured)
 *   Binary unset: `— GIR` (em-dash + label, muted)
 *   Integer:      `2 putts` / `0 OB`
 *                 (value coloured per aggregateTone only when > 0
 *                 AND tone !== 'neutral' — e.g. "3 OB" red, "0 OB" not)
 *
 * Renders the same `StatChip` row the editable scoring surface
 * (`EditableHoleStats`) uses, so the viewing and editing surfaces read
 * as one design language. Tokens are separated by `·` in the muted
 * text colour.
 *
 * Pure presentation: caller supplies the applicable stats (already
 * filtered by enabled-set + par) and the value map for the
 * (scorer, hole) tuple.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { StatChip } from '@/components/aurora';
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
      {stats.map((stat) => (
        <StatToken
          key={stat.key}
          stat={stat}
          value={values[stat.key]}
          styles={styles}
        />
      ))}
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
        <StatChip label={label} value="—" state="neutral" style={styles.chip} />
      );
    }
    // yesTone='good': Yes good, No bad
    // yesTone='bad':  Yes bad,  No good
    // yesTone='neutral': both neutral
    const positive =
      stat.yesTone === 'good' ? value : stat.yesTone === 'bad' ? !value : null;
    return (
      <StatChip
        label={label}
        value={value ? 'Yes' : 'No'}
        state={positive === true ? 'on' : positive === false ? 'no' : 'neutral'}
        style={styles.chip}
      />
    );
  }

  // Integer
  const display = typeof value === 'number' ? value : stat.defaultValue;
  // Colour only when value > 0 AND tone is non-neutral. "0 OB" stays
  // neutral because zero of a bad-tone stat is the positive outcome.
  return (
    <StatChip
      label={label}
      value={display}
      state={
        display > 0 && stat.aggregateTone === 'good'
          ? 'on'
          : display > 0 && stat.aggregateTone === 'bad'
            ? 'no'
            : 'neutral'
      }
      style={styles.chip}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 8,
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
