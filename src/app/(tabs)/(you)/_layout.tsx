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

import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { useTheme } from '@/library/theme/ThemeContext';

export default function YouLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = React.useMemo(() => StyleSheet.create({
    gear: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke
    },
    gearPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.98 }]
    },
    gearText: {
      color: colors.textMuted,
      fontSize: 17,
      fontWeight: '800'
    }
  }), [colors]);

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
        options={{
          title: 'You',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Appearance"
              hitSlop={8}
              onPress={() => router.push('/(tabs)/(you)/appearance' as never)}
              style={({ pressed }) => [styles.gear, pressed ? styles.gearPressed : null]}>
              <Text style={styles.gearText}>⚙</Text>
            </Pressable>
          )
        }}
      />
      <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="handicap" options={{ title: 'Handicap' }} />
      <Stack.Screen name="friends/index" options={{ title: 'Search' }} />
    </Stack>
  );
}
