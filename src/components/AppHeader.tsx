/**
 * AppHeader — custom native-stack header used by every screen
 * inside the tabbed surface (Home / Rounds / Search / You stacks).
 *
 * Three-slot layout:
 *
 *   [ title text  OR  back chevron+label ]  [ Logo ]  [ headerRight ]
 *
 * Goals (vs the default react-navigation header):
 *   - Logo is centered as a brand anchor.
 *   - Title text uses the same weight / colour conventions as the
 *     rest of the app's titles instead of the default semibold
 *     system font that read as "basic".
 *   - The header gets a hairline bottom border so it visually
 *     separates from the feed cards beneath it — feed cards share
 *     the header's background colour (`cardBg` ≡ `tabBar` in the
 *     palette), so without the border the boundary is invisible
 *     on overlap. Mirrors what the tab-bar's `borderTopColor`
 *     already does at the bottom of the screen.
 *
 * Wiring: set `header: (props) => <AppHeader {...props} />` on a
 * `<Stack>`'s `screenOptions`. Per-screen `options.title`,
 * `options.headerRight`, and the native `back` field flow through
 * `NativeStackHeaderProps` so each screen can still customise its
 * own chrome — no HeaderContext-style indirection.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

const HEADER_HEIGHT = 52;

/**
 * Minimal local type for the props expo-router's native-stack
 * `header` callback receives. We avoid the deep
 * `expo-router/build/react-navigation/native-stack` import path
 * (fragile across SDK upgrades) and instead pin to just the fields
 * we actually use:
 *
 *   - `navigation.goBack()` — back-button handler
 *   - `route.name`          — fallback when `options.title` is unset
 *   - `options.title`       — primary header label
 *   - `options.headerRight` — optional render function for the
 *                             right slot (e.g. the scoring screen's
 *                             Finish chip)
 *   - `back`                — undefined at stack root, populated
 *                             with `{ title? }` after a push so we
 *                             know to show a back chevron
 *
 * This shape is stable across react-navigation 6/7 — both pass the
 * same fields to a custom `header` renderer.
 */
type HeaderRightInfo = { tintColor?: string; canGoBack?: boolean };
type AppHeaderProps = {
  navigation: { goBack: (e?: GestureResponderEvent) => void };
  route: { name: string };
  options: {
    title?: string;
    headerRight?: (info: HeaderRightInfo) => React.ReactNode;
  };
  back?: { title?: string };
};

export function AppHeader({
  navigation,
  route,
  options,
  back,
}: AppHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Title for the left slot. `options.title` is set by every
  // screen via `Stack.Screen options={{ title: '...' }}`; fall
  // back to the route name so we never render an empty header.
  const title =
    typeof options.title === 'string' && options.title.length > 0
      ? options.title
      : route.name;

  // Per-screen right slot. `options.headerRight` is a render
  // function in react-navigation's type. We pass empty info so
  // headerRight implementations that don't rely on `tintColor` /
  // `canGoBack` keep working; today's call sites (the scoring
  // Finish chip) don't.
  const rightNode =
    typeof options.headerRight === 'function'
      ? options.headerRight({ tintColor: colors.textTitle, canGoBack: !!back })
      : null;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, height: HEADER_HEIGHT + insets.top },
      ]}>
      <View style={styles.row}>
        <View style={styles.leftSlot}>
          {back ? (
            <Pressable
              onPress={navigation.goBack}
              hitSlop={8}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back">
              <Text style={styles.backChevron}>‹</Text>
              <Text style={styles.backLabel} numberOfLines={1}>
                {back.title ?? 'Back'}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>

        <View pointerEvents="none" style={styles.centerSlot}>
          <Logo size={36} variant="disc" />
        </View>

        <View style={styles.rightSlot}>{rightNode}</View>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.tabBar,
      borderBottomWidth: StyleSheet.hairlineWidth,
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
      minWidth: 80,
      flexShrink: 1,
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
      minWidth: 40,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    titleText: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.textTitle,
      letterSpacing: 0.1,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backChevron: {
      fontSize: 24,
      lineHeight: 24,
      marginRight: 2,
      color: colors.primaryDark,
      fontWeight: '700',
    },
    backLabel: {
      fontSize: 15,
      color: colors.primaryDark,
      fontWeight: '700',
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
