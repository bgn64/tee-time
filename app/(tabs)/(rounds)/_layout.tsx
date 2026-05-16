/**
 * Rounds tab stack.
 *   - index    — Mine list
 *   - [id]     — round detail
 */

import { Stack } from 'expo-router';

export default function RoundsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="player/[id]" />
    </Stack>
  );
}
