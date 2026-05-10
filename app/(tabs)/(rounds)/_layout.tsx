/**
 * Rounds tab stack.
 *   - index    — Mine list (with optional Pending drawer-link at top)
 *   - pending  — drilldown of rounds awaiting the user's confirmation
 *   - [id]     — round detail
 */

import { Stack } from 'expo-router';

export default function RoundsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}

