/**
 * Feed tab stack — single index screen for now (content TBD per design doc).
 * Becomes the social feed surface in Phase 3 (friends' rounds, etc.).
 */

import { Stack } from 'expo-router';

export default function FeedLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
