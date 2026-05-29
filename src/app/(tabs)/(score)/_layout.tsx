/**
 * Rounds tab stack (folder name kept as `(score)` for now; tab label
 * is "Rounds").
 *
 * Hub-led structure:
 *   index           — three-action hub (New round · Continue · Previous)
 *   new/index       — course picker (step 1 of the new-round flow)
 *   players         — step 2 of new-round flow
 *   format          — step 3 of new-round flow
 *   scoring         — live scoring (locked once a round is in flight)
 *   previous/index  — completed-rounds list (absorbed from old Rounds tab)
 *   previous/[id]   — round detail (read-only)
 *   previous/[id]/edit — edit a completed round (state ③)
 *   profile/[uid]   — profile drill-in, used by every detail/scoring screen
 *
 * `scoring` has `gestureEnabled: false` and (on Android) blocks
 * hardware back so the round can only be exited via Finish / Abandon.
 * The redirect-when-in-flight gates live inside each new-round setup
 * screen.
 *
 * `profile/[userId]` is reachable from scoring and from the previous-
 * rounds detail; back navigation stays inside this tab.
 *
 * `unstable_settings.initialRouteName` tells expo-router that `index`
 * (the hub) is the canonical first screen of this stack. Without it,
 * a deep link / web reload that lands on `previous/[id]` (or
 * `profile/[userId]`) starts the stack with only that one screen and
 * the back arrow disappears because there's no parent to pop to.
 * With it, expo-router synthesizes the parent so `back` works
 * cleanly back to the hub.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export const unstable_settings = {
  initialRouteName: 'index',
};

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
      <Stack.Screen name="new/index" />
      <Stack.Screen name="players" />
      <Stack.Screen name="format" />
      <Stack.Screen name="scoring" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="previous/index"
        options={{ headerShown: true, title: 'Previous rounds' }}
      />
      <Stack.Screen
        name="previous/[id]"
        options={{ headerShown: true, title: 'Round' }}
      />
      <Stack.Screen
        name="previous/[id]/edit"
        options={{ headerShown: true, title: 'Edit Round' }}
      />
      <Stack.Screen
        name="profile/[userId]"
        options={{ headerShown: true, title: 'Profile' }}
      />
    </Stack>
  );
}
