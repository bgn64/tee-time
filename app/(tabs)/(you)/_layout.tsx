/**
 * You tab stack. Profile/stats hub at index, with sub-screens for theme,
 * notifications, account, and about (most are "Coming soon" placeholders
 * for now — see phase-1-mockups.html).
 */

import { Stack } from 'expo-router';

export default function YouLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="theme" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="account" />
      <Stack.Screen name="about" />
    </Stack>
  );
}
