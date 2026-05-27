/**
 * You tab stack.
 *
 * Owns:
 *   index            — the signed-in user's own profile.
 *   profile/[userId] — drill-ins from the friends list (and any
 *                      future entry points within the You stack).
 *   friends/index    — the user's friends list.
 *
 * Mirrors the (search) stack layout: each screen owns its title,
 * the Stack supplies the chrome.
 */

import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export default function YouLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.tabBar },
        headerShadowVisible: false,
        headerTintColor: colors.textTitle,
        contentStyle: { backgroundColor: colors.background }
      }}>
      <Stack.Screen name="index" options={{ title: 'You' }} />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
      <Stack.Screen name="friends/index" options={{ title: 'Friends' }} />
    </Stack>
  );
}
