/**
 * You tab landing — profile card + color picker + stats + friends.
 *
 * Profile-page focus. All non-profile configuration lives behind the
 * profile-icon menu in the app header (→ Settings). The You tab itself
 * carries only:
 *
 *   1. Avatar + name + handle + joined-at line.
 *   2. Color swatch row — pick any palette color; writes to
 *      profiles.avatar_color and propagates everywhere participant
 *      identity resolves (feed band, scorer rows, etc.). Hidden when
 *      signed out (we need a profile row to update).
 *   3. Stats strip: rounds, avg, best — computed from stroke rounds
 *      only (scramble is collaborative; no individual credit).
 *   4. Friends row → /(you)/friends.
 *
 * Signed-out state shows a value-prop banner above the profile card
 * instead of the color picker.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AVATAR_COLORS } from '@/constants/avatarColors';
import { formatScore } from '@/lib/scoring';
import { firstName } from '@/lib/userIdentity';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

function formatAvg(avg: number): string {
  const rounded = Math.round(avg * 10) / 10;
  if (rounded === 0) return 'E';
  const abs = Math.abs(rounded).toFixed(1);
  return rounded > 0 ? `+${abs}` : `−${abs}`;
}

function formatJoined(iso: string): string {
  const d = new Date(iso);
  return `Joined ${d.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`;
}

export default function YouScreen() {
  const { colors } = useTheme();
  const { completedRounds } = useGolfRound();
  const { defaultPlayerId, getPlayer } = usePlayers();
  const { account, updateAvatarColor } = useAccount();
  const { friends, incomingRequests } = useSocial();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'text', text: 'YOU' },
    right: { kind: 'profile' },
  });

  const me = defaultPlayerId ? getPlayer(defaultPlayerId) : undefined;
  const displayName = account?.displayName ?? me?.nickname ?? 'You';
  const avatarColor = account?.avatarColor ?? me?.color ?? colors.primary;
  const avatarLetter = (firstName(displayName) || displayName)[0]?.toUpperCase() ?? 'Y';

  // Stats: only stroke rounds where the viewer participated. Scramble
  // is collaborative — no individual credit.
  const myUserId = account?.userId;
  const stats = useMemo(() => {
    const perRound: number[] = [];
    for (const round of completedRounds) {
      if (round.scoringRule !== 'stroke') continue;
      // Identify the viewer's participantKey within this round.
      let scorerId: string | undefined;
      if (myUserId) {
        const p = round.participants?.find((q) => q.linkedUserId === myUserId);
        scorerId = p?.participantKey;
      } else if (defaultPlayerId) {
        scorerId = defaultPlayerId;
      }
      if (!scorerId) continue;
      if (!round.playerIds.includes(scorerId)) continue;
      let total = 0;
      let scored = 0;
      for (const score of round.scores) {
        if (score.scorerId !== scorerId) continue;
        const hole = round.course.holes.find((h) => h.number === score.holeNumber);
        if (hole) {
          total += score.strokes - hole.par;
          scored++;
        }
      }
      if (scored > 0) perRound.push(total);
    }
    if (perRound.length === 0) return { rounds: 0, avg: null as number | null, best: null as number | null };
    const sum = perRound.reduce((a, b) => a + b, 0);
    return {
      rounds: perRound.length,
      avg: sum / perRound.length,
      best: Math.min(...perRound),
    };
  }, [completedRounds, defaultPlayerId, myUserId]);

  const friendsSubtitle = !account
    ? 'Sign in to find friends'
    : incomingRequests.length > 0
    ? `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'} · ${incomingRequests.length} ${
        incomingRequests.length === 1 ? 'request' : 'requests'
      } pending`
    : `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}`;

  const onFriends = () => {
    if (!account) {
      router.push('/sign-in');
      return;
    }
    router.push('/(tabs)/(you)/friends');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!account ? (
        <View style={styles.signInBanner}>
          <Text style={styles.signInHead}>✦  SIGN IN TO UNLOCK</Text>
          <Text style={styles.signInBody}>
            Back up your rounds, connect with friends, and customize your profile.
          </Text>
          <Pressable style={styles.signInBtn} onPress={() => router.push('/sign-in')}>
            <Text style={styles.signInBtnText}>Sign in</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        {account ? (
          <Text style={styles.handle}>@{account.handle}</Text>
        ) : (
          <Text style={styles.handleEmpty}>No account yet</Text>
        )}
        {account ? (
          <Text style={styles.joined}>{formatJoined(account.createdAt)}</Text>
        ) : null}

        {account ? (
          <View style={styles.colorRow}>
            {AVATAR_COLORS.map((c) => {
              const active = c.toLowerCase() === avatarColor.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    if (active) return;
                    void updateAvatarColor(c);
                  }}
                  hitSlop={6}
                  accessibilityLabel={`Use color ${c}`}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    active && styles.swatchActive,
                  ]}
                />
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statCell}>
          <Text style={styles.statNumber}>{stats.rounds}</Text>
          <Text style={styles.statLabel}>ROUNDS</Text>
        </View>
        <View style={[styles.statCell, styles.statCellMiddle]}>
          <Text
            style={[
              styles.statNumber,
              stats.avg !== null && stats.avg > 0 && styles.statOver,
              stats.avg !== null && stats.avg < 0 && styles.statUnder,
            ]}>
            {stats.avg !== null ? formatAvg(stats.avg) : '—'}
          </Text>
          <Text style={styles.statLabel}>AVG</Text>
        </View>
        <View style={styles.statCell}>
          <Text
            style={[
              styles.statNumber,
              stats.best !== null && stats.best > 0 && styles.statOver,
              stats.best !== null && stats.best < 0 && styles.statUnder,
            ]}>
            {stats.best !== null ? formatScore(stats.best) : '—'}
          </Text>
          <Text style={styles.statLabel}>BEST</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.friendsRow, pressed && styles.friendsRowPressed]}
        onPress={onFriends}>
        <View style={styles.friendsLeft}>
          <Text style={styles.friendsIcon}>👥</Text>
          <View>
            <Text style={styles.friendsLabel}>Friends</Text>
            <Text style={styles.friendsSub}>{friendsSubtitle}</Text>
          </View>
        </View>
        <Text style={styles.friendsChev}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },

    profileCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 22,
      paddingHorizontal: 18,
      alignItems: 'center',
      marginBottom: 14,
    },
    avatar: {
      width: 86,
      height: 86,
      borderRadius: 43,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: colors.cardBg,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 34,
      fontWeight: '800',
    },
    name: {
      marginTop: 12,
      color: colors.textTitle,
      fontSize: 22,
      fontWeight: '800',
    },
    handle: {
      color: colors.primaryDark,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 2,
    },
    handleEmpty: {
      color: colors.textMuted,
      fontSize: 13,
      fontStyle: 'italic',
      marginTop: 2,
    },
    joined: {
      color: colors.textMuted,
      fontSize: 11.5,
      marginTop: 4,
    },
    colorRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    swatch: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.cardBg,
    },
    swatchActive: {
      borderColor: colors.textTitle,
    },

    statsCard: {
      flexDirection: 'row',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      marginBottom: 12,
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
    },
    statCellMiddle: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    statNumber: {
      color: colors.textTitle,
      fontSize: 20,
      fontWeight: '800',
    },
    statOver: {
      color: colors.accent,
    },
    statUnder: {
      color: colors.primaryDark,
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginTop: 4,
    },

    friendsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    friendsRowPressed: {
      backgroundColor: colors.chipBg,
    },
    friendsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    friendsIcon: {
      fontSize: 20,
    },
    friendsLabel: {
      color: colors.textTitle,
      fontSize: 15,
      fontWeight: '800',
    },
    friendsSub: {
      color: colors.textMuted,
      fontSize: 11.5,
      marginTop: 2,
    },
    friendsChev: {
      color: colors.textMuted,
      fontSize: 18,
      fontWeight: '700',
    },

    signInBanner: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
    },
    signInHead: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    signInBody: {
      color: '#6b5a3a',
      fontSize: 12.5,
      lineHeight: 18,
      marginBottom: 10,
    },
    signInBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 9,
      alignItems: 'center',
    },
    signInBtnText: {
      color: '#ffffff',
      fontSize: 12.5,
      fontWeight: '800',
    },
  });
}
