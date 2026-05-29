/**
 * Home tab stack.
 *
 * Owns:
 *   index            — the friend-rounds feed.
 *   round/[id]       — round detail (tapped through from a feed card).
 *                      Mirrors the rounds-tab detail; both routes
 *                      render the shared `<RoundDetailView />`. Lives
 *                      in this stack so back navigation returns to
 *                      the feed.
 *   profile/[userId] — drill-ins from any participant tap on a feed
 *                      card. Mirrors (you) / (search) — each tab that
 *                      can reach a profile owns its own copy of the
 *                      profile route so back navigation stays inside
 *                      the tab.
 *
 * `unstable_settings.initialRouteName` tells expo-router that
 * `index` is the canonical first screen of this stack. Without it,
 * a deep link / web reload that lands on `round/[id]` (or
 * `profile/[userId]`) starts the stack with only that one screen
 * and the back arrow disappears because there's no parent to pop
 * to. With it, expo-router synthesizes the parent so `back` works
 * cleanly.
 *
 * Mirrors the (you) stack layout: each screen owns its title; the
 * Stack supplies the chrome.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export const unstable_settings = {
  initialRouteName: 'index',
};

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
      <Stack.Screen name="round/[id]" options={{ title: 'Round' }} />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
