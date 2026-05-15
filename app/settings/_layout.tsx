/**
 * Settings stack — a root-level (non-tab) route.
 *
 * Settings used to live under `(tabs)/(you)/` which had the side effect of
 * making the You tab "stick" to whichever settings sub-screen was last
 * pushed — tapping the You tab from elsewhere would bring you back to
 * Settings rather than the You landing. Hoisting Settings out of the tabs
 * tree fixes that AND matches the user's mental model that Settings is an
 * app-level concern, not a sub-section of "You".
 *
 * Children: theme · notifications · account · about. Reached by drill-in
 * from the Settings hub at index. Back from each lands on Settings; back
 * from Settings returns the user to wherever they came from (Feed, You,
 * Rounds — whatever tab they were on when they tapped the gear).
 */

import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="theme" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="account" />
      <Stack.Screen name="about" />
    </Stack>
  );
}
