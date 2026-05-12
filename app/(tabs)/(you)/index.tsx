/**
 * You tab landing — profile + stats strip + Friends row + 2×2 settings grid.
 *
 * Wired in Phase 1:
 *   · Profile name/avatar (sourced from the default player record)
 *   · Stats: rounds played, avg score, best score (computed from completedRounds
 *     filtered to stroke rounds the default player participated in)
 *   · Theme card → /(tabs)/(you)/theme (existing 5-swatch picker)
 *
 * Phase 3 step 7 additions:
 *   · Profile name / handle row reflects sign-in state. Signed-in users see
 *     their account displayName + @handle (green); signed-out keeps the
 *     existing "No account yet" italic text.
 *   · The Account grid card morphs based on sign-in state. Signed-out:
 *     "Sign in / Back up & connect" with an orange pulse dot + accented
 *     border, taps into the /sign-in modal flow. Signed-in: shows the
 *     handle as the subtitle and routes into /(tabs)/(you)/account for
 *     account details + sign-out.
 *
 * People → You reshape:
 *   · Friends row above the settings grid. Drills into the (you)/friends
 *     stack. Shows a small accent dot + an "X requests pending" subtitle
 *     when there are incoming friend requests; falls back to an "X friends"
 *     count otherwise. Signed-out variant nudges into /sign-in.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { themeNames } from '@/constants/themes';
import { formatScore } from '@/lib/scoring';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useLocation } from '@/state/LocationContext';
import { useOnboarding } from '@/state/OnboardingContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

function formatAvg(avg: number): string {
  // Sign-aware to one decimal: +4.2, −1.5, E
  const rounded = Math.round(avg * 10) / 10;
  if (rounded === 0) return 'E';
  const abs = Math.abs(rounded).toFixed(1);
  return rounded > 0 ? `+${abs}` : `−${abs}`;
}

export default function YouScreen() {
  const { colors, themeName } = useTheme();
  const { completedRounds } = useGolfRound();
  const { defaultPlayerId, getPlayer } = usePlayers();
  const { account } = useAccount();
  const { friends, incomingRequests } = useSocial();
  const { status: locationStatus, request: requestLocation, openSystemSettings } = useLocation();
  const { setStatus: setPrimerStatus } = useOnboarding();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'text', text: 'YOU' },
    right: { kind: 'profile' },
  });

  // Profile header: signed-in account values win over the local default
  // player record. Avatar color also follows the SSO-supplied color so the
  // profile feels consistent with the all-set screen the user just saw.
  const me = defaultPlayerId ? getPlayer(defaultPlayerId) : undefined;
  const displayName = account?.displayName ?? me?.nickname ?? 'You';
  const avatarColor = account?.avatarColor ?? me?.color ?? colors.primary;
  const avatarLetter = displayName[0]?.toUpperCase() ?? 'Y';

  // Stats: only stroke rounds where the default player participated.
  const stats = useMemo(() => {
    if (!defaultPlayerId) return { rounds: 0, avg: null as number | null, best: null as number | null };

    const perRound: number[] = [];
    for (const round of completedRounds) {
      if (round.scoringRule !== 'stroke') continue;
      if (!round.playerIds.includes(defaultPlayerId)) continue;
      let total = 0;
      let scored = 0;
      for (const score of round.scores) {
        if (score.scorerId !== defaultPlayerId) continue;
        const hole = round.course.holes.find((h) => h.number === score.holeNumber);
        if (hole) {
          total += score.strokes - hole.par;
          scored++;
        }
      }
      if (scored > 0) perRound.push(total);
    }

    if (perRound.length === 0) return { rounds: 0, avg: null, best: null };
    const sum = perRound.reduce((a, b) => a + b, 0);
    return {
      rounds: perRound.length,
      avg: sum / perRound.length,
      best: Math.min(...perRound),
    };
  }, [completedRounds, defaultPlayerId]);

  const themeLabel = useMemo(
    () => themeNames.find((t) => t.key === themeName)?.label ?? 'Earthy Green',
    [themeName]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{displayName}</Text>
          {account ? (
            <Text style={styles.handleReal}>@{account.handle}</Text>
          ) : (
            <Text style={styles.handle}>No account yet</Text>
          )}
        </View>
      </View>

      <View style={styles.statsStrip}>
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

      <FriendsRow
        styles={styles}
        account={account}
        friendsCount={friends.length}
        pendingCount={incomingRequests.length}
      />

      <View style={styles.grid}>
        <GridCard
          styles={styles}
          label="Theme"
          subtitle={themeLabel}
          icon="🎨"
          iconBg="#9c5dde"
          onPress={() => router.push('/(tabs)/(you)/theme')}
        />
        <GridCard
          styles={styles}
          label="Notifications"
          subtitle="—"
          icon="🔔"
          iconBg="#4a90e2"
          todo
          onPress={() => router.push('/(tabs)/(you)/notifications')}
        />
        <GridCard
          styles={styles}
          label={account ? 'Account' : 'Sign in'}
          subtitle={account ? `@${account.handle}` : 'Back up & connect'}
          icon="👤"
          iconBg={account ? colors.primary : colors.accent}
          accented={!account}
          pulse={!account}
          onPress={() =>
            account ? router.push('/(tabs)/(you)/account') : router.push('/sign-in')
          }
        />
        <GridCard
          styles={styles}
          label="About"
          subtitle="—"
          icon="ⓘ"
          iconBg={colors.textMuted}
          todo
          onPress={() => router.push('/(tabs)/(you)/about')}
        />
        <GridCard
          styles={styles}
          label="Location"
          subtitle={
            locationStatus === 'granted'
              ? 'On · sorting by distance'
              : locationStatus === 'denied'
              ? 'Denied — tap to open settings'
              : 'Off — tap to enable'
          }
          icon="📍"
          iconBg={
            locationStatus === 'granted'
              ? colors.primaryDark
              : locationStatus === 'denied'
              ? '#b53030'
              : colors.textMuted
          }
          onPress={async () => {
            if (locationStatus === 'granted') {
              // No-op for now. Future: a sub-screen for granular controls.
              return;
            }
            if (locationStatus === 'denied') {
              await openSystemSettings();
              return;
            }
            // Off / unknown: re-trigger the primer so the user sees the
            // value-prop before the OS dialog. We bump status back to
            // 'not_seen' first so OnboardingContext's nextPrimer effect
            // doesn't immediately re-route them after the primer
            // resolves on its own.
            setPrimerStatus('location', 'not_seen');
            router.push('/onboarding/location');
          }}
        />
      </View>
    </ScrollView>
  );
}

type GridCardProps = {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  todo?: boolean;
  accented?: boolean;
  pulse?: boolean;
  onPress: () => void;
};

type FriendsRowProps = {
  styles: ReturnType<typeof makeStyles>;
  account: ReturnType<typeof useAccount>['account'];
  friendsCount: number;
  pendingCount: number;
};

function FriendsRow({ styles, account, friendsCount, pendingCount }: FriendsRowProps) {
  const signedIn = !!account;
  const hasPending = signedIn && pendingCount > 0;

  const onPress = () => {
    if (!signedIn) {
      router.push('/sign-in');
      return;
    }
    router.push('/(tabs)/(you)/friends');
  };

  const subtitle = !signedIn
    ? 'Sign in to find friends'
    : pendingCount > 0
    ? `${friendsCount} ${friendsCount === 1 ? 'friend' : 'friends'} · ${pendingCount} ${
        pendingCount === 1 ? 'request' : 'requests'
      } pending`
    : `${friendsCount} ${friendsCount === 1 ? 'friend' : 'friends'}`;

  return (
    <Pressable
      style={[
        styles.friendsRow,
        hasPending && styles.friendsRowPending,
        !signedIn && styles.friendsRowSignedOut,
      ]}
      onPress={onPress}>
      {hasPending && <View style={styles.friendsRowDot} />}
      <View style={styles.friendsRowIcon}>
        <Text style={styles.friendsRowIconText}>👥</Text>
      </View>
      <View style={styles.friendsRowBody}>
        <Text style={styles.friendsRowLabel}>Friends</Text>
        <Text
          style={[styles.friendsRowSub, !signedIn && styles.friendsRowSubSignedOut]}
          numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.friendsRowChev}>›</Text>
    </Pressable>
  );
}

function GridCard({
  styles,
  label,
  subtitle,
  icon,
  iconBg,
  todo,
  accented,
  pulse,
  onPress,
}: GridCardProps) {
  return (
    <Pressable style={[styles.gridCard, accented && styles.gridCardAccented]} onPress={onPress}>
      {todo && (
        <View style={styles.todoBadge}>
          <Text style={styles.todoBadgeText}>TODO</Text>
        </View>
      )}
      {pulse && <View style={styles.pulseDot} />}
      <View style={[styles.gridIcon, { backgroundColor: iconBg }]}>
        <Text style={styles.gridIconText}>{icon}</Text>
      </View>
      <Text style={styles.gridLabel}>{label}</Text>
      <Text style={styles.gridSubtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    profile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#ffffff',
    },
    profileInfo: { flex: 1 },
    name: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
    },
    handle: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: 2,
    },
    handleReal: {
      fontSize: 12,
      color: colors.primaryDark,
      fontWeight: '700',
      marginTop: 2,
    },
    statsStrip: {
      flexDirection: 'row',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
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
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    statOver: {
      color: colors.accent,
    },
    statUnder: {
      color: colors.primaryDark,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.6,
      marginTop: 2,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    friendsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 12,
      marginBottom: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    friendsRowPending: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
    },
    friendsRowSignedOut: {
      backgroundColor: '#fffbe8',
      borderColor: '#f5e0b8',
    },
    friendsRowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
      marginRight: 2,
    },
    friendsRowIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.chipBg,
    },
    friendsRowIconText: { fontSize: 16 },
    friendsRowBody: { flex: 1, minWidth: 0 },
    friendsRowLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    friendsRowSub: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
      marginTop: 2,
    },
    friendsRowSubSignedOut: {
      color: colors.accent,
      fontWeight: '700',
    },
    friendsRowChev: {
      fontSize: 18,
      color: colors.textMuted,
      opacity: 0.5,
    },
    gridCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      position: 'relative',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    gridCardAccented: {
      borderColor: colors.accent,
    },
    pulseDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.accent,
    },
    todoBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: '#fbbf24',
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    todoBadgeText: {
      fontSize: 8,
      fontWeight: '800',
      color: '#ffffff',
      letterSpacing: 0.5,
    },
    gridIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    gridIconText: {
      fontSize: 18,
      color: '#ffffff',
      fontWeight: '800',
    },
    gridLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    gridSubtitle: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
      maxWidth: '100%',
    },
  });
}
