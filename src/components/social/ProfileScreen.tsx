/**
 * ProfileScreen — read-only profile body shared by every entry
 * point that displays a single user (search/profile, score/profile,
 * you/profile, you/index).
 *
 * Layout (mostly identical regardless of viewer):
 *
 *   · Avatar circle + display name + @handle
 *   · FriendActionPill (hidden when viewing your own profile)
 *   · Stats card:
 *       OWN:    [Friends N] (tappable when onPressFriends given)
 *             + [Rounds played N]
 *       OTHER:  [Rounds together N]   (count is computed entirely
 *                                       from scorecards already
 *                                       synced to your device — see
 *                                       useScorecardStats for the
 *                                       accuracy ceiling)
 *   · Sign-out button (own only)
 *
 * `onPressFriends` is provided by the You-tab landing so the
 * Friends stat drills to `(you)/friends`. Other consumers leave it
 * undefined and the count renders non-interactive (or is hidden, see
 * below — currently we hide non-self friend counts entirely because
 * other users' friendships aren't synced and the count would always
 * be 0).
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { signOut } from '@/library/supabase/auth';
import { PullToRefreshScrollView } from '@/components/widgets/PullToRefreshScrollView';
import { useRefresh } from '@/library/data/useRefresh';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useFriends, useProfile } from '@/library/social/FriendsContext';
import { useScorecardStats } from '@/library/golf/useScorecardStats';
import { useTheme } from '@/library/theme/ThemeContext';
import { FriendActionPill } from './FriendActionPill';

type Props = {
  userId: string;
  /** Provided by the You-tab landing so the Friends stat is tappable.
   * Other entry points omit this; the stat then renders non-interactive
   * (only relevant on own profile — others' friend count is hidden). */
  onPressFriends?: () => void;
};

export function ProfileScreen({ userId, onPressFriends }: Props) {
  const { colors } = useTheme();
  const account = useRequiredAccount();
  const { profile, loading } = useProfile(userId);
  const { friends } = useFriends();
  const { roundsPlayed, roundsTogether } = useScorecardStats();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const refresh = useRefresh();

  const isOwn = userId === account.userId;
  const togetherCount = isOwn ? 0 : roundsTogether(userId);

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
    <PullToRefreshScrollView onRefresh={refresh} style={styles.container}>
      <View style={styles.body}>
        <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
          <Text style={styles.avatarText}>
            {profile.displayName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.handle}>@{profile.handle}</Text>

        {!isOwn && (
          <View style={styles.pillRow}>
            <FriendActionPill target={profile} />
          </View>
        )}

        {/* Stats card — two cells for own profile, one for others. */}
        <View style={styles.statsCard}>
          {isOwn ? (
            <>
              <StatCell
                styles={styles}
                colors={colors}
                value={String(friends.length)}
                label="FRIENDS"
                onPress={onPressFriends}
              />
              <View style={styles.statsDivider} />
              <StatCell
                styles={styles}
                colors={colors}
                value={String(roundsPlayed)}
                label="ROUNDS PLAYED"
              />
            </>
          ) : (
            <StatCell
              styles={styles}
              colors={colors}
              value={String(togetherCount)}
              label="ROUNDS TOGETHER"
            />
          )}
        </View>

        {isOwn && (
          <Pressable
            style={({ pressed }) => [
              styles.signOutBtn,
              pressed && styles.signOutBtnPressed
            ]}
            onPress={() => {
              void signOut();
            }}>
            <Text style={styles.signOutBtnText}>Sign out</Text>
          </Pressable>
        )}
      </View>
    </PullToRefreshScrollView>
  );
}

type StatCellProps = {
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>['colors'];
  value: string;
  label: string;
  onPress?: () => void;
};

function StatCell({ styles, colors, value, label, onPress }: StatCellProps) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label.toLowerCase()}: ${value}`}
        onPress={onPress}
        style={({ pressed }) => [styles.statCell, pressed && { backgroundColor: colors.chipBg }]}>
        <Text style={styles.statNumber}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.statCell}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    body: {
      paddingTop: 24,
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
      marginTop: 2
    },
    pillRow: { marginTop: 18 },
    statsCard: {
      marginTop: 20,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      flexDirection: 'row',
      alignSelf: 'stretch',
      overflow: 'hidden'
    },
    statsDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.border
    },
    statCell: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center'
    },
    statNumber: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginTop: 2
    },
    signOutBtn: {
      marginTop: 28,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border
    },
    signOutBtnPressed: { opacity: 0.7 },
    signOutBtnText: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
      color: colors.textMuted
    },
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
