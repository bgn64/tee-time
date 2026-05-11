/**
 * Onboarding routes — first-launch primer screens.
 *
 * Pushed by the root layout when the user has primers in `not_seen`
 * status. Each screen is a standalone modal-style page with no tab bar.
 */

import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="account" />
      <Stack.Screen name="location" />
    </Stack>
  );
}
