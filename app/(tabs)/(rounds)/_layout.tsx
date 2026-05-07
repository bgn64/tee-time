/**
 * Rounds tab stack. Owns the round-history flow:
 *   index → [id]
 * Reachable from anywhere in the app via /(tabs)/(rounds)/<id>.
 */

import { Stack } from 'expo-router';

export default function RoundsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
