/**
 * You tab stack. Profile/stats hub at index, with sub-screens for theme,
 * notifications, account, about, and the friends list (and its onward
 * search / confirm-request / per-friend detail screens). The friends
 * sub-routes are flat children of this stack — no nested layout — so
 * back-navigation pops naturally to the You landing and `expo-router`
 * doesn't try to surface `friends` as an additional tab.
 */

import { Stack } from 'expo-router';

export default function YouLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="theme" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="account" />
      <Stack.Screen name="about" />
      <Stack.Screen name="friends/index" />
      <Stack.Screen name="friends/search" />
      <Stack.Screen name="friends/confirm-request" />
      <Stack.Screen name="friends/[id]" />
    </Stack>
  );
}
