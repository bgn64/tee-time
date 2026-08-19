/**
 * EditableHoleStats — the interactive sibling of `HoleStatsLine`. Where
 * `HoleStatsLine` renders a scorer's per-hole stats as read-only chips on
 * the viewing surface, this renders the SAME `StatChip` row on the
 * scoring / edit surface but tappable, so the two surfaces read as one
 * design language (mockup `mockups/aurora-screens.html`, scoring screen: a
 * "Stats" label above a wrapped `.tg` chip row).
 *
 * Single-chip interaction (the redesign dropped the radio-pair + stepper):
 *
 *   - Binary (GIR/FIR): tap cycles  unset (—) → Yes (✓) → No (✗) → unset.
 *     The Yes/No fill colour follows the stat's `yesTone`, matching
 *     `HoleStatsLine`.
 *   - Integer (Putts/OB): tap increments, wrapping back to the stat's
 *     `min` past `INTEGER_CHIP_MAX`. A single tappable chip can only go
 *     one way; the wrap keeps every value reachable without a stepper.
 *
 * Pure presentation: the caller supplies the applicable stats (already
 * filtered by enabled-set + hole par) and the value map, and persists via
 * `onChangeStat`.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatChip } from '@/components/aurora';
import {
  type IntegerStatDefinition,
  type StatDefinition,
  type StatKey,
  type StatValue,
  type StatValueMap,
} from '@/library/golf/builtInStats';
import { displayStatLabel } from '@/library/golf/statDisplay';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

/**
 * Ceiling a single-tap integer chip wraps at. Built-in integer stats
 * (putts, OB) sit well under this in practice; the wrap exists so a
 * mis-tap is always correctable without a dedicated decrement control.
 */
const INTEGER_CHIP_MAX = 9;

type Props = {
  stats: readonly StatDefinition[];
  values: StatValueMap;
  onChangeStat: (statKey: StatKey, value: StatValue | null) => void;
};

export function EditableHoleStats({ stats, values, onChangeStat }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (stats.length === 0) return null;

  return (
    <View>
      <Text style={styles.label}>Stats</Text>
      <View style={styles.row}>
        {stats.map((stat) => (
          <EditableStatChip
            key={stat.key}
            stat={stat}
            value={values[stat.key]}
            onChangeStat={onChangeStat}
            styles={styles}
          />
        ))}
      </View>
    </View>
  );
}

type StylesShape = ReturnType<typeof makeStyles>;

function cycleBinary(current: boolean | null): boolean | null {
  if (current === null) return true;
  if (current === true) return false;
  return null;
}

function nextInteger(stat: IntegerStatDefinition, current: number): number {
  const next = current + 1;
  return next > INTEGER_CHIP_MAX ? stat.min : next;
}

function EditableStatChip({
  stat,
  value,
  onChangeStat,
  styles,
}: {
  stat: StatDefinition;
  value: StatValue | undefined;
  onChangeStat: (statKey: StatKey, value: StatValue | null) => void;
  styles: StylesShape;
}) {
  const label = displayStatLabel(stat.label);

  if (stat.type === 'binary') {
    const bool = typeof value === 'boolean' ? value : null;
    if (bool === null) {
      return (
        <StatChip
          label={label}
          value="—"
          state="neutral"
          onPress={() => onChangeStat(stat.key, cycleBinary(bool))}
          style={styles.chip}
        />
      );
    }
    // yesTone='good': Yes good, No bad — yesTone='bad': Yes bad, No good.
    const positive =
      stat.yesTone === 'good' ? bool : stat.yesTone === 'bad' ? !bool : null;
    return (
      <StatChip
        label={label}
        value={bool ? 'Yes' : 'No'}
        state={positive === true ? 'on' : positive === false ? 'no' : 'neutral'}
        onPress={() => onChangeStat(stat.key, cycleBinary(bool))}
        style={styles.chip}
      />
    );
  }

  // Integer: display the stored value or the stat's visual default;
  // colour only when > 0 AND the aggregate tone is non-neutral.
  const display = typeof value === 'number' ? value : stat.defaultValue;
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
      onPress={() => onChangeStat(stat.key, nextInteger(stat, display))}
      style={styles.chip}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    label: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
    },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 14,
    },
  });
}
