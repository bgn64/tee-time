/**
 * People tab stack. The landing (index) hosts the Roster ↔ Friends segmented
 * control; tapping a roster row pushes to [id] for the per-person detail view.
 */

import { Stack } from 'expo-router';

export default function PeopleLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
