/**
 * Profile screen — `(tabs)/(rounds)/profile/[userId]`.
 *
 * Thin route wrapper around `<ProfileScreen userId={...} />`. Mirrors
 * the wrappers in `(home)/profile`, `(you)/profile`, `(search)/profile`,
 * and `(score)/profile` — tap-through from a participant on the
 * Rounds detail screen lands here so back returns to the round
 * (and not, e.g., to the You tab's profile).
 */

import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ProfileScreen } from '@/components/social/ProfileScreen';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function ProfileRoute() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ userId: string | string[] }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const { profile } = useProfile(userId ?? null);

  if (!userId) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textBody }}>Missing user id.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: profile?.displayName ?? 'Profile' }} />
      <ProfileScreen userId={userId} />
    </>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  }
});
