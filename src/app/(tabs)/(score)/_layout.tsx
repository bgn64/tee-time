/**
 * Score tab stack.
 *
 * Owns the round-setup flow:
 *   index → players → format → scoring (locked root once a round is in flight)
 *
 * `scoring` has `gestureEnabled: false` and (on Android) blocks
 * hardware back so the round can only be exited via Finish / Abandon.
 * The redirect-when-in-flight gates live inside each setup screen.
 */

import { Stack } from 'expo-router';

export default function ScoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="players" />
      <Stack.Screen name="format" />
      <Stack.Screen name="scoring" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
