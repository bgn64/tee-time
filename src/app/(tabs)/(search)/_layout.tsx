/**
 * Search tab stack.
 *
 *   index            — search input + requests + friends list.
 *   profile/[userId] — read-only profile screen with friend-action pill.
 *
 * Headers are owned by each screen so titles can vary by content
 * (the profile screen sets its title to the displayName once loaded).
 */

import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/aurora';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function SearchLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        header: (props) => <AppHeader {...props} />,
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: colors.textTitle,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: 'transparent' }
      }}>
      <Stack.Screen
        name="index"
        options={{ title: 'Friends', headerRight: () => <SearchHeaderAvatar /> }}
      />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
    </Stack>
  );
}

function SearchHeaderAvatar() {
  const router = useRouter();
  const account = useRequiredAccount();

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/(you)' as never)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open your profile">
      <Avatar
        initial={account.displayName || account.handle}
        color={account.avatarColor}
        size={34}
        circle
      />
    </Pressable>
  );
}
