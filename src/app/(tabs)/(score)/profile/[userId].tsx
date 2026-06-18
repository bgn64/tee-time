/**
 * Profile route inside the Score stack.
 *
 * Mounted when the user taps a `user:` participant's name in the
 * Final-totals row of `<ReadOnlyScorecard>` during scoring. The
 * scoring screen wires `onPressParticipant` to push here, so the
 * navigation stays inside the Score tab (no jump to Search).
 *
 * Thin wrapper around the shared `<ProfileScreen>` — same body as
 * the (search) and (you) variants.
 */

import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ProfileScreen } from '@/components/social/ProfileScreen';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function ScoreProfileRoute() {
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
