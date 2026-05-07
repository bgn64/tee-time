/**
 * Persistent app header. Three slots: left (tab name OR back button),
 * center (the "tee time" logo), and right (profile dot OR ⋯ overflow).
 *
 * Slot contents are driven by HeaderContext, which screens populate via
 * the `useScreenHeader` hook.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
          <Text style={styles.logo}>tee time</Text>
        </View>
        <View style={styles.rightSlot}>{renderRight(slots.right, styles)}</View>
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

function renderRight(right: ReturnType<typeof useHeaderSlots>['right'], styles: HeaderStyles) {
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
  return (
    <Pressable
      onPress={right.onPress}
      style={({ pressed }) => [styles.profileDot, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityLabel="Profile"
    />
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
    logo: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
      letterSpacing: 0.5,
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
    profileDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.chipBg,
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
    pressed: {
      opacity: 0.6,
    },
  });
}
