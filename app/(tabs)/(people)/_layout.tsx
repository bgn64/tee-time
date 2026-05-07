/**
 * People tab stack. The landing (index) hosts the Roster ↔ Friends segmented
 * control; tapping a roster row pushes to [id] for the per-person detail view.
 *
 * Phase 3 step 8 added two flow screens:
 *   - search       — search-by-handle (entered from a roster row's "Connect"
 *                    CTA or the Friends segment "+ Find friends" CTA)
 *   - confirm-request — preview of the matched account + Send button
 */

import { Stack } from 'expo-router';

export default function PeopleLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="search" />
      <Stack.Screen name="confirm-request" />
    </Stack>
  );
}
