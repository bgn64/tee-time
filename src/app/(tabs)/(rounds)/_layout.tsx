/**
 * Rounds tab stack.
 *
 * Owns:
 *   index            — the user's completed rounds list.
 *   [id]             — read-only detail for a single round.
 *   [id]/edit        — editing UI for one of the user's completed
 *                      rounds (state ③ of the four-state model).
 *                      Only the round owner can reach it (the read-only
 *                      detail's Edit button only renders for the
 *                      owner, and the route's query is owner-scoped).
 *   profile/[userId] — per-tab profile route (mirrors (home),
 *                      (search), (you), (score)). Tap-through from a
 *                      participant on the detail screen lands here so
 *                      back navigation stays inside the Rounds tab.
 *
 * `unstable_settings.initialRouteName` tells expo-router that
 * `index` is the canonical first screen of this stack. Without it,
 * a deep link / web reload that lands on `[id]` (or
 * `profile/[userId]`) starts the stack with only that one screen
 * and the back arrow disappears because there's no parent to pop
 * to. With it, expo-router synthesizes the parent so `back` works
 * cleanly.
 *
 * Mirrors the (home) / (you) layout shape: each screen owns its
 * title; the Stack supplies the chrome.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RoundsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.tabBar },
        headerShadowVisible: false,
        headerTintColor: colors.textTitle,
        contentStyle: { backgroundColor: colors.background }
      }}>
      <Stack.Screen name="index" options={{ title: 'Rounds' }} />
      <Stack.Screen name="[id]" options={{ title: 'Round' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Round' }} />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
