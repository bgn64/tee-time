/**
 * NeonButton — lime primary or ghost glass CTA button.
 */

import React, { useMemo, type JSX } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function NeonButton(props: { label: string; onPress?: () => void; disabled?: boolean; variant?: 'solid' | 'ghost'; size?: 'md' | 'sm'; iconLeft?: React.ReactNode; iconRight?: React.ReactNode; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const variant = props.variant ?? 'solid';
  const size = props.size ?? 'md';
  const isSolid = variant === 'solid';

  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || !props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' ? styles.sm : styles.md,
        isSolid ? styles.solid : styles.ghost,
        props.disabled ? styles.disabled : null,
        pressed && !props.disabled ? styles.pressed : null,
        props.style,
      ]}>
      {props.iconLeft ? <View style={styles.icon}>{props.iconLeft}</View> : null}
      <Text style={[styles.label, size === 'sm' ? styles.labelSm : null, isSolid ? styles.solidLabel : styles.ghostLabel]}>
        {props.label}
      </Text>
      {props.iconRight ? <View style={styles.icon}>{props.iconRight}</View> : null}
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 16,
      borderWidth: 1,
    },
    md: {
      minHeight: 48,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    sm: {
      minHeight: 36,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 13,
    },
    solid: {
      backgroundColor: colors.lime,
      borderColor: colors.lime,
      shadowColor: colors.lime,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 6,
    },
    ghost: {
      backgroundColor: colors.glassFill2,
      borderColor: colors.glassStroke,
    },
    disabled: {
      opacity: 0.45,
    },
    pressed: {
      transform: [{ scale: 0.98 }],
    },
    label: {
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.1,
    },
    labelSm: {
      fontSize: 12,
    },
    solidLabel: {
      color: colors.onNeon,
    },
    ghostLabel: {
      color: colors.textTitle,
    },
    icon: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
