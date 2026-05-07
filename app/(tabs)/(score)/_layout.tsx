/**
 * Score tab stack. Owns the round flow:
 *   index → player-config → scoring (locked root after Start Round)
 *   new-course is pushed from index.
 */

import { Stack } from 'expo-router';

export default function ScoreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="player-config" />
      <Stack.Screen name="scoring" options={{ gestureEnabled: false }} />
      <Stack.Screen name="new-course" />
      <Stack.Screen name="scorecard" />
    </Stack>
  );
}
