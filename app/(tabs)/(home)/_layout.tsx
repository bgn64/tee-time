/**
 * Nested stack navigator for the Home tab flow.
 * Screens push within the tab, keeping the tab bar visible.
 */

import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="player-config" />
      <Stack.Screen name="scoring" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
