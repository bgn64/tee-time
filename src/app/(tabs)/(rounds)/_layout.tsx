/**
 * Rounds tab stack.
 *
 * Owns:
 *   index            — the user's completed rounds list.
 *   [id]             — read-only detail for a single round.
 *   profile/[userId] — per-tab profile route (mirrors (home),
 *                      (search), (you), (score)). Tap-through from a
 *                      participant on the detail screen lands here so
 *                      back navigation stays inside the Rounds tab.
 *
 * Mirrors the (home) / (you) layout shape: each screen owns its
 * title; the Stack supplies the chrome.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

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
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
