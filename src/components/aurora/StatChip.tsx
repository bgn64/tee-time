/**
 * StatChip — compact stat toggle/display chip for on, no, and neutral states.
 */

import { useMemo, type JSX } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { NumericText } from './NumericText';

export function StatChip(props: { label: string; value?: string | number; state?: 'on' | 'no' | 'neutral'; onPress?: () => void; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const state = props.state ?? 'neutral';
  const content = (
    <>
      <Text style={[styles.mark, state === 'on' ? styles.markOn : state === 'no' ? styles.markNo : styles.markNeutral]}>
        {state === 'on' ? '✓' : state === 'no' ? '✗' : '•'}
      </Text>
      <Text style={[styles.label, state === 'on' ? styles.textOn : state === 'no' ? styles.textNo : null]}>{props.label}</Text>
      {props.value != null ? (
        <NumericText style={[styles.value, state === 'on' ? styles.textOn : state === 'no' ? styles.textNo : null]}>
          {props.value}
        </NumericText>
      ) : null}
    </>
  );

  if (!props.onPress) {
    return (
      <View style={[styles.chip, stateStyle(styles, state), props.style]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.value != null ? `${props.label} ${props.value}` : props.label}
      style={({ pressed }) => [
        styles.chip,
        stateStyle(styles, state),
        pressed ? styles.pressed : null,
        props.style,
      ]}>
      {content}
    </Pressable>
  );
}

function stateStyle(styles: ReturnType<typeof makeStyles>, state: 'on' | 'no' | 'neutral') {
  if (state === 'on') return styles.on;
  if (state === 'no') return styles.no;
  return styles.neutral;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: colors.glassFill,
      borderColor: colors.glassStroke,
    },
    on: {
      backgroundColor: colors.glowLime,
      borderColor: colors.lime,
    },
    no: {
      backgroundColor: colors.glassFill2,
      borderColor: colors.accent,
    },
    neutral: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassStroke,
    },
    pressed: {
      opacity: 0.76,
    },
    mark: {
      fontSize: 12,
      fontWeight: '900',
    },
    markOn: {
      color: colors.lime,
    },
    markNo: {
      color: colors.accent,
    },
    markNeutral: {
      color: colors.textMuted,
    },
    label: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    value: {
      color: colors.textTitle,
      fontSize: 12,
      fontWeight: '800',
    },
    textOn: {
      color: colors.lime,
    },
    textNo: {
      color: colors.accent,
    },
  });
}
