/**
 * Stepper — pill-shaped minus/value/plus control with tabular numerics.
 */

import { useMemo, type JSX } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { NumericText } from './NumericText';

export function Stepper(props: { value: number; onIncrement: () => void; onDecrement: () => void; min?: number; max?: number; displayValue?: string }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const decrementDisabled = props.min != null && props.value <= props.min;
  const incrementDisabled = props.max != null && props.value >= props.max;
  const displayValue = props.displayValue ?? String(props.value);

  return (
    <View style={styles.root}>
      <Pressable
        onPress={props.onDecrement}
        disabled={decrementDisabled}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${displayValue}`}
        accessibilityState={{ disabled: decrementDisabled }}
        style={({ pressed }) => [styles.button, decrementDisabled ? styles.disabled : null, pressed ? styles.pressed : null]}>
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <NumericText style={styles.value}>{displayValue}</NumericText>
      <Pressable
        onPress={props.onIncrement}
        disabled={incrementDisabled}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${displayValue}`}
        accessibilityState={{ disabled: incrementDisabled }}
        style={({ pressed }) => [styles.button, incrementDisabled ? styles.disabled : null, pressed ? styles.pressed : null]}>
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      backgroundColor: colors.night,
      overflow: 'hidden',
    },
    button: {
      width: 42,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      color: colors.textTitle,
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 24,
    },
    disabled: {
      opacity: 0.36,
    },
    pressed: {
      backgroundColor: colors.glassFill2,
    },
    value: {
      width: 44,
      textAlign: 'center',
      color: colors.lime,
      fontSize: 22,
      fontWeight: '900',
    },
  });
}
