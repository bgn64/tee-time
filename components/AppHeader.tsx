/**
 * Persistent app header. Three slots: left (tab name OR back button),
 * center (the brand mark + "tee time" wordmark), and right (settings
 * gear OR ⋯ overflow OR text action).
 *
 * Slot contents are driven by HeaderContext, which screens populate via
 * the `useScreenHeader` hook. The `kind: 'profile'` slot used to render
 * a colored avatar dot that opened a menu — it now renders a gear icon
 * that pushes the Settings screen directly. Profile content (name,
 * avatar, color picker, stats, friends) lives on the You tab itself.
 */

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { useHeaderSlots } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';

const HEADER_HEIGHT = 52;

export function AppHeader() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const slots = useHeaderSlots();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, height: HEADER_HEIGHT + insets.top }]}>
      <View style={styles.row}>
        <View style={styles.leftSlot}>{renderLeft(slots.left, styles)}</View>
        <View pointerEvents="none" style={styles.centerSlot}>
          <Logo size={36} color={colors.primaryDark} ballFill={colors.cardBg} />
        </View>
        <View style={styles.rightSlot}>{renderRight(slots.right, styles, colors)}</View>
      </View>
    </View>
  );
}

function renderLeft(left: ReturnType<typeof useHeaderSlots>['left'], styles: HeaderStyles) {
  if (left.kind === 'text') {
    return <Text style={styles.leftText}>{left.text}</Text>;
  }
  return (
    <Pressable
      onPress={left.onPress}
      style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
      hitSlop={8}>
      <Text style={styles.backChevron}>‹</Text>
      <Text style={styles.backLabel}>{left.label}</Text>
    </Pressable>
  );
}

function renderRight(
  right: ReturnType<typeof useHeaderSlots>['right'],
  styles: HeaderStyles,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  if (right.kind === 'none') {
    return null;
  }
  if (right.kind === 'menu') {
    return (
      <Pressable
        onPress={right.onPress}
        style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
        hitSlop={8}
        accessibilityLabel="Round actions">
        <Text style={styles.menuGlyph}>⋯</Text>
      </Pressable>
    );
  }
  if (right.kind === 'action') {
    return (
      <Pressable
        onPress={right.onPress}
        style={({ pressed }) => [
          styles.actionChip,
          right.active && styles.actionChipActive,
          pressed && styles.pressed,
        ]}
        hitSlop={8}
        accessibilityLabel={right.label}>
        <Text style={[styles.actionChipText, right.active && styles.actionChipTextActive]}>
          {right.label}
        </Text>
      </Pressable>
    );
  }
  // right.kind === 'profile' — historically an avatar dot that opened a
  // menu. Now a settings gear that pushes the Settings screen. Any
  // caller-supplied onPress still wins (no current caller uses it but
  // the option stays in the type for future flexibility).
  const onPress = right.onPress ?? (() => router.push('/settings'));
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityLabel="Settings">
      <FontAwesome name="cog" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

type HeaderStyles = ReturnType<typeof makeStyles>;

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.cardBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      position: 'relative',
    },
    leftSlot: {
      minWidth: 70,
      flexDirection: 'row',
      alignItems: 'center',
    },
    centerSlot: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rightSlot: {
      marginLeft: 'auto',
      minWidth: 32,
      alignItems: 'flex-end',
    },
    leftText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backChevron: {
      fontSize: 22,
      lineHeight: 22,
      marginRight: 2,
      color: colors.primaryDark,
      fontWeight: '600',
    },
    backLabel: {
      fontSize: 14,
      color: colors.primaryDark,
      fontWeight: '600',
    },
    settingsBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuGlyph: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: -1,
      lineHeight: 24,
    },
    actionChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
    },
    actionChipText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.primaryDark,
    },
    actionChipActive: {
      backgroundColor: colors.accent + '1c',
      borderWidth: 1,
      borderColor: colors.accent + '55',
    },
    actionChipTextActive: {
      color: colors.accent,
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
