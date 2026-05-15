/**
 * You tab stack. Profile/stats hub at index, with the friends list (and its
 * onward search / confirm-request / per-friend detail screens) as nested
 * sub-routes. The friends sub-routes are flat children of this stack — no
 * nested layout — so back-navigation pops naturally to the You landing and
 * `expo-router` doesn't try to surface `friends` as an additional tab.
 *
 * Settings used to live here too (theme, notifications, account, about).
 * It was hoisted out to the root-level `/settings` stack so re-tapping the
 * You tab from another tab doesn't pin to Settings.
 */

import { Stack } from 'expo-router';

export default function YouLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="friends/index" />
      <Stack.Screen name="friends/search" />
      <Stack.Screen name="friends/confirm-request" />
      <Stack.Screen name="friends/[id]" />
    </Stack>
  );
}
