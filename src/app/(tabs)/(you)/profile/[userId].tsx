/**
 * Profile route inside the You stack.
 *
 * Mounted for future drill-ins inside the You tab. Thin wrapper around the
 * shared `<ProfileScreen>` — same body as `(search)/profile/[uid]`
 * and `(score)/profile/[uid]`. Sets the header title to the
 * resolved displayName once available.
 */

import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ProfileScreen } from '@/components/social/ProfileScreen';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function YouProfileRoute() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ userId: string | string[] }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const { profile } = useProfile(userId ?? null);

  if (!userId) {
    return (
      <View style={styles.fallback}>
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
