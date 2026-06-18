/**
 * You tab stack.
 *
 * Owns:
 *   index            — the signed-in user's own Aurora profile.
 *   profile/[userId] — drill-ins from the friends list (and any
 *                      future entry points within the You stack).
 *   friends/index    — legacy redirect to Search (friends/requests live there).
 *
 * Mirrors the (search) stack layout: each screen owns its title,
 * the Stack supplies the chrome.
 */

import { Stack } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { ScreenBackground } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';

export default function YouLayout() {
  const { colors } = useTheme();
  return (
    <ScreenBackground>
      <Stack
        screenOptions={{
          header: (props) => <AppHeader {...props} />,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: colors.textTitle,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: 'transparent' }
        }}>
        <Stack.Screen name="index" options={{ title: 'You' }} />
        <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
        <Stack.Screen name="friends/index" options={{ title: 'Search' }} />
      </Stack>
    </ScreenBackground>
  );
}
