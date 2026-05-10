/**
 * People tab stack.
 *   - index           — Friends list (primary content of the tab)
 *   - unlinked        — drilldown listing unlinked roster entries
 *   - [id]            — per-person detail (linked friend OR unlinked player)
 *   - search          — find a friend by @handle
 *   - confirm-request — preview + send button for the friend request
 *   - merge-target    — friend picker shown when initiating a merge
 */

import { Stack } from 'expo-router';

export default function PeopleLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="unlinked" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="search" />
      <Stack.Screen name="confirm-request" />
      <Stack.Screen name="merge-target" />
    </Stack>
  );
}

