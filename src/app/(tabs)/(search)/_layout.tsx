/**
 * Search tab stack.
 *
 *   index            — search input + people results (future: courses).
 *   profile/[userId] — read-only profile screen with friend-action pill.
 *
 * Headers are owned by each screen so titles can vary by content
 * (the profile screen sets its title to the displayName once loaded).
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export default function SearchLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.tabBar },
        headerShadowVisible: false,
        headerTintColor: colors.textTitle,
        contentStyle: { backgroundColor: colors.background }
      }}>
      <Stack.Screen name="index" options={{ title: 'Search' }} />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
