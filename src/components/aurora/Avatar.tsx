/**
 * Avatar — rounded-square or circular initial badge with solid/gradient fill.
 */

import { useMemo, type JSX } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { auroraAvatarColor, avatarInitialColor } from '@/library/social/avatarColors';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function Avatar(props: { initial: string; color?: string; gradient?: [string, string]; size?: number; circle?: boolean; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const size = props.size ?? 40;
  const radius = props.circle ? size / 2 : size * 0.3;
  const dynamicStyle = { width: size, height: size, borderRadius: radius };
  const textStyle = { fontSize: Math.max(11, size * 0.38) };
  // Coerce stored profile colors onto the Aurora palette at render time.
  const safeColor = props.color ? auroraAvatarColor(props.color) : null;
  const gradient = props.gradient ?? (safeColor ? null : [colors.cyan, colors.violet] as [string, string]);
  // Dark glyphs on the bright gradient/neon fills, matching the mockup.
  const initialColor = gradient
    ? colors.onNeon
    : avatarInitialColor(safeColor ?? colors.glassFill2);

  if (gradient) {
    return (
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.avatar, dynamicStyle, props.style]}>
        <Text style={[styles.initial, textStyle, { color: initialColor }]} numberOfLines={1}>
          {props.initial.slice(0, 1).toUpperCase()}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.avatar, dynamicStyle, { backgroundColor: safeColor ?? colors.glassFill2 }, props.style]}>
      <Text style={[styles.initial, textStyle, { color: initialColor }]} numberOfLines={1}>
        {props.initial.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    avatar: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      shadowColor: colors.lime,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 18,
      elevation: 3,
    },
    initial: {
      color: colors.textTitle,
      fontWeight: '900',
      includeFontPadding: false,
    },
  });
}
