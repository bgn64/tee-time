/**
 * You tab stack. Currently a single screen (theme picker / settings); will
 * grow with profile + stats per the design doc.
 */

import { Stack } from 'expo-router';

export default function YouLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
