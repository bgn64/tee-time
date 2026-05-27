/**
 * ProfileScreen — read-only profile body (avatar + name + handle + pill).
 *
 * Decoupled from the route so future entry points (e.g. tapping a
 * player name during scoring) can render the same component without
 * the `(search)/profile/[userId]` URL shape.
 *
 * Resolves the target profile via `useProfile(userId)` which checks
 * the in-memory `profileCache` first and falls back to a direct
 * `profiles` row fetch. While loading: themed spinner. On miss
 * (deleted account or invalid id): "Profile not found" placeholder.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import { FriendActionPill } from './FriendActionPill';

type Props = {
  userId: string;
};

export function ProfileScreen({ userId }: Props) {
  const { colors } = useTheme();
  const { profile, loading } = useProfile(userId);
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  if (loading && !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.notFoundIcon}>👤</Text>
        <Text style={styles.notFoundTitle}>Profile not found</Text>
        <Text style={styles.notFoundBody}>
          They may have deleted their account or never finished signing up.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
          <Text style={styles.avatarText}>
            {profile.displayName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.handle}>@{profile.handle}</Text>

        <View style={styles.pillRow}>
          <FriendActionPill target={profile} />
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    body: {
      paddingTop: 32,
      paddingBottom: 24,
      paddingHorizontal: 24,
      alignItems: 'center'
    },
    avatar: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14
    },
    avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 32 },
    name: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textTitle
    },
    handle: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
      marginBottom: 22
    },
    pillRow: { marginTop: 4 },
    notFoundIcon: { fontSize: 36, marginBottom: 8 },
    notFoundTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 6
    },
    notFoundBody: {
      fontSize: 13,
      color: colors.textBody,
      textAlign: 'center',
      lineHeight: 18
    }
  });
}
