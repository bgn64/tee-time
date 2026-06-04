/**
 * HoleDetailRow — one per-stat input row, rendered as part of the
 * per-hole stat-entry stack on the editing surface
 * (`ScoreEntryAccordion`). The read-only surface (`HolesTabContent`)
 * uses `HoleStatsLine` instead, so this component is always
 * editable.
 *
 * Two visual shapes driven by the stat's type:
 *
 *   - Binary: a radio pair (`( ) Yes  ( ) No`). The selected
 *     option's fill colour follows the stat's `yesTone`:
 *       yesTone='good'    → selected Yes = primary (green),
 *                           selected No = accent (red)
 *       yesTone='bad'     → selected Yes = accent (red),
 *                           selected No = primary (green)
 *       yesTone='neutral' → both selected states use primary
 *     Tapping the currently-selected option is a no-op (matches
 *     the existing score-chip "can't revert to unset" convention).
 *
 *   - Integer: a `[− value +]` stepper. The displayed value is the
 *     stored value when present, otherwise `stat.defaultValue` (a
 *     visual default — see `useRoundHoleDetails.seedDefaults` for
 *     when defaults are written to storage). The `−` button is
 *     disabled when the value is at `stat.min`; `+` has no upper
 *     bound. Each tap fires `onChange(nextValue)` which
 *     persists immediately.
 *
 * The component is unconditionally interactive — there is no
 * read-only mode any more. Callers that need a read-only render
 * use `HoleStatsLine` (which presents stats as inline typography
 * rather than tappable controls).
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  IntegerStatDefinition,
  StatDefinition,
  StatTone,
  StatValue,
} from '@/library/golf/builtInStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  stat: StatDefinition;
  value: StatValue | null;
  onChange: (value: StatValue | null) => void;
};

export function HoleDetailRow({ stat, value, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{stat.label}</Text>
      <View style={styles.controls}>
        {stat.type === 'binary' ? (
          <BinaryRadioGroup
            yesTone={stat.yesTone}
            value={typeof value === 'boolean' ? value : null}
            onChange={onChange}
            styles={styles}
          />
        ) : (
          <IntegerStepper
            stat={stat}
            value={typeof value === 'number' ? value : null}
            onChange={onChange}
            styles={styles}
          />
        )}
      </View>
    </View>
  );
}

type StylesShape = ReturnType<typeof makeStyles>;

function BinaryRadioGroup({
  yesTone,
  value,
  onChange,
  styles,
}: {
  yesTone: StatTone;
  value: boolean | null;
  onChange: (value: StatValue | null) => void;
  styles: StylesShape;
}) {
  // Selected-fill colours pivot off yesTone:
  //   good    → Yes good, No bad
  //   bad     → Yes bad, No good
  //   neutral → both good (factual stat — render positively when
  //             the user has made a choice either way)
  const yesFill =
    yesTone === 'bad' ? 'bad' : ('good' as const);
  const noFill =
    yesTone === 'good' ? 'bad' : ('good' as const);

  const handlePress = (next: boolean) => {
    // Matches the existing convention: tapping the currently
    // selected value is a no-op (no revert to unset). Switching to
    // the other value flips the boolean.
    if (value === next) return;
    onChange(next);
  };

  return (
    <View style={styles.radioGroup}>
      <RadioOption
        label="Yes"
        selected={value === true}
        fill={yesFill}
        onPress={() => handlePress(true)}
        styles={styles}
      />
      <RadioOption
        label="No"
        selected={value === false}
        fill={noFill}
        onPress={() => handlePress(false)}
        styles={styles}
      />
    </View>
  );
}

function RadioOption({
  label,
  selected,
  fill,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  fill: 'good' | 'bad';
  onPress: () => void;
  styles: StylesShape;
}) {
  const ringStyle = [
    styles.radioRing,
    selected && (fill === 'good' ? styles.radioRingGood : styles.radioRingBad),
  ];
  const dotStyle = [
    styles.radioDot,
    fill === 'good' ? styles.radioDotGood : styles.radioDotBad,
  ];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={styles.radioOption}>
      <View style={ringStyle}>
        {selected ? <View style={dotStyle} /> : null}
      </View>
      <Text
        style={[
          styles.radioLabel,
          selected && styles.radioLabelSelected,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function IntegerStepper({
  stat,
  value,
  onChange,
  styles,
}: {
  stat: IntegerStatDefinition;
  value: number | null;
  onChange: (value: StatValue | null) => void;
  styles: StylesShape;
}) {
  // Display value: stored value when present, else the stat's
  // visual default. Note that the stored value can be absent on
  // legacy / mid-upgrade rounds where `seedDefaults` didn't run —
  // showing `stat.defaultValue` keeps the UI consistent in that
  // case.
  const display = value ?? stat.defaultValue;
  const canDecrement = display > stat.min;

  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => {
          if (!canDecrement) return;
          onChange(display - 1);
        }}
        disabled={!canDecrement}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${stat.label}`}
        style={[styles.stepBtn, !canDecrement && styles.stepBtnDisabled]}>
        <Text
          style={[
            styles.stepBtnText,
            !canDecrement && styles.stepBtnTextDisabled,
          ]}>
          −
        </Text>
      </Pressable>
      <View style={styles.stepValueWrap}>
        <Text style={styles.stepValue}>{display}</Text>
      </View>
      <Pressable
        onPress={() => onChange(display + 1)}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${stat.label}`}
        style={styles.stepBtn}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 40,
    },
    label: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textBody,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    // Binary radio group
    radioGroup: {
      flexDirection: 'row',
      gap: 16,
    },
    radioOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    radioRing: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioRingGood: {
      borderColor: colors.primary,
    },
    radioRingBad: {
      borderColor: colors.accent,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    radioDotGood: {
      backgroundColor: colors.primary,
    },
    radioDotBad: {
      backgroundColor: colors.accent,
    },
    radioLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textBody,
    },
    radioLabelSelected: {
      color: colors.textTitle,
    },
    // Integer stepper
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.chipBg,
      borderRadius: 999,
      padding: 3,
    },
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: 999,
      backgroundColor: colors.cardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: {
      opacity: 0.4,
    },
    stepBtnText: {
      fontSize: 16,
      fontWeight: '900',
      color: colors.textTitle,
      lineHeight: 18,
    },
    stepBtnTextDisabled: {
      color: colors.textMuted,
    },
    stepValueWrap: {
      minWidth: 32,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    stepValue: {
      fontSize: 14,
      fontWeight: '900',
      color: colors.textTitle,
    },
  });
}
