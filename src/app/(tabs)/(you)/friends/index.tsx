/**
 * Friends list — reached from the You tab's Friends stat.
 *
 * Renders one row per current friend, sorted alphabetically by
 * display name. Each row shows:
 *
 *   · Avatar circle (color + initial)
 *   · Display name
 *   · @handle  ·  N rounds together   (footer; "rounds together"
 *                                       half is omitted when 0)
 *   · chevron
 *
 * Tap a row → pushes `(you)/profile/{userId}`. Tab context stays
 * on You.
 *
 * Data sources (no extra fetches; all PowerSync local):
 *   useFriends().friends         — the userId list.
 *   useParticipantResolver(...)  — display name / handle / avatar
 *                                  color for each row.
 *   useScorecardStats()          — per-row rounds-together count.
 *
 * Empty state surfaces a call to action toward the Search tab.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useScorecardStats } from '@/library/golf/useScorecardStats';
import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function FriendsListScreen() {
  const { colors } = useTheme();
  const { friends } = useFriends();
  const { roundsTogether } = useScorecardStats();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const participantKeys = React.useMemo(
    () => friends.map(userParticipantKey),
    [friends]
  );
  const resolver = useParticipantResolver(participantKeys);

  // Compose rows for rendering. Sort by display name (handle as
  // tiebreak) so the list order is stable even when two rows resolve
  // to the same name. Rows without a resolved name fall through to
  // the bottom but still render with a placeholder.
  const rows = React.useMemo(() => {
    const items = friends.map((userId) => {
      const resolved = resolver.get(userParticipantKey(userId));
      return {
        userId,
        displayName: resolved?.displayName || 'Player',
        handle: resolved?.handle,
        avatarColor: resolved?.avatarColor || colors.primary,
        together: roundsTogether(userId)
      };
    });
    items.sort((a, b) => {
      const cmp = a.displayName.localeCompare(b.displayName);
      if (cmp !== 0) return cmp;
      return (a.handle ?? '').localeCompare(b.handle ?? '');
    });
    return items;
  }, [friends, resolver, roundsTogether, colors.primary]);

  if (friends.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>👥</Text>
        <Text style={styles.emptyTitle}>No friends yet</Text>
        <Text style={styles.emptyBody}>
          Open the Search tab to find people by their @handle and send a
          friend request.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>
        {friends.length} {friends.length === 1 ? 'FRIEND' : 'FRIENDS'}
      </Text>
      {rows.map((row) => {
        const letter = (row.displayName[0] ?? '?').toUpperCase();
        const meta = row.handle
          ? row.together > 0
            ? `@${row.handle}  ·  ${row.together} ${row.together === 1 ? 'round' : 'rounds'} together`
            : `@${row.handle}`
          : row.together > 0
            ? `${row.together} ${row.together === 1 ? 'round' : 'rounds'} together`
            : 'Friend';
        return (
          <Pressable
            key={row.userId}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() =>
              router.push(`/(tabs)/(you)/profile/${row.userId}` as never)
            }>
            <View style={[styles.avatar, { backgroundColor: row.avatarColor }]}>
              <Text style={styles.avatarLetter}>{letter}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.name} numberOfLines={1}>
                {row.displayName}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {meta}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 48 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 10
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 8
    },
    rowPressed: {
      opacity: 0.85
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarLetter: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 15
    },
    body: {
      flex: 1,
      minWidth: 0
    },
    name: {
      color: colors.textTitle,
      fontWeight: '800',
      fontSize: 14
    },
    meta: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
      fontWeight: '600'
    },
    empty: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      gap: 6
    },
    emptyIcon: { fontSize: 36, opacity: 0.5 },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle
    },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 260
    }
  });
}
