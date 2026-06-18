/**
 * Search tab stack.
 *
 *   index            — search input + requests + friends list.
 *   profile/[userId] — read-only profile screen with friend-action pill.
 *
 * Headers are owned by each screen so titles can vary by content
 * (the profile screen sets its title to the displayName once loaded).
 */

import { Stack } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { ScreenBackground } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';

export default function SearchLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Friends' }} />
        <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
      </Stack>
    </ScreenBackground>
  );
}
