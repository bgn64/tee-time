/**
 * Search tab stack.
 *
 *   index            — people + course search, requests, and friends list.
 *   profile/[userId] — read-only profile screen with friend-action pill.
 *   course/[id]      — read-only course detail (full scorecard + tees).
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
        options={{ title: 'Search', headerRight: () => <SearchHeaderAvatar /> }}
      />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
      <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
      <Stack.Screen name="course/add" options={{ title: 'Add course' }} />
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
