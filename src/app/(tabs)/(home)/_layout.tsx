/**
 * Home tab stack.
 *
 * Owns:
 *   index            — the friend-rounds feed.
 *   profile/[userId] — drill-ins from any participant tap on a feed
 *                      card. Mirrors (you) / (search) — each tab that
 *                      can reach a profile owns its own copy of the
 *                      profile route so back navigation stays inside
 *                      the tab.
 *
 * Mirrors the (you) stack layout: each screen owns its title; the
 * Stack supplies the chrome.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export default function HomeLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.tabBar },
        headerShadowVisible: false,
        headerTintColor: colors.textTitle,
        contentStyle: { backgroundColor: colors.background }
      }}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
