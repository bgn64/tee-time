/**
 * Score tab stack.
 *
 * Owns the round-setup flow:
 *   index → players → format → scoring (locked root once a round is in flight)
 *
 * `scoring` has `gestureEnabled: false` and (on Android) blocks
 * hardware back so the round can only be exited via Finish / Abandon.
 * The redirect-when-in-flight gates live inside each setup screen.
 *
 * `profile/[userId]` is reachable from the scoring screen (tap a
 * participant name in the read-only Final-totals row) and uses the
 * stack's shared header for back navigation. Pushing onto this
 * sibling route doesn't violate the lock — the round state in
 * PowerSync persists; back returns to scoring.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export default function ScoreLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.tabBar },
        headerShadowVisible: false,
        headerTintColor: colors.textTitle,
        contentStyle: { backgroundColor: colors.background }
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="players" />
      <Stack.Screen name="format" />
      <Stack.Screen name="scoring" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="profile/[userId]"
        options={{ headerShown: true, title: 'Profile' }}
      />
    </Stack>
  );
}
