/**
 * Score tab stack (folder name kept as `(score)`).
 *
 * Score-tab structure:
 *   index           — single New round form
 *   new/index       — course picker
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

import { AppHeader } from '@/components/AppHeader';
import { useTheme } from '@/library/theme/ThemeContext';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ScoreLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: (props) => <AppHeader {...props} />,
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: colors.textTitle,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: 'transparent' }
      }}>
      <Stack.Screen name="index" options={{ title: 'New round' }} />
      <Stack.Screen name="new/index" options={{ title: 'Choose course' }} />
      <Stack.Screen name="scoring" options={{ gestureEnabled: false }} />
      <Stack.Screen name="previous/index" options={{ title: 'Previous rounds' }} />
      <Stack.Screen name="previous/[id]" options={{ title: 'Round' }} />
      <Stack.Screen name="previous/[id]/edit" options={{ title: 'Edit Round' }} />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
