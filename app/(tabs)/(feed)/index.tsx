/**
 * Feed tab — chronological list of friends' completed rounds.
 *
 * Data flow: `completedRounds` from GolfRoundContext already includes any
 * rounds the local user has visibility to (via the v6 RLS, which uses the
 * union of friend graphs across confirmed participants). The Feed tab
 * filters that to "rounds I didn't score and that aren't pending my
 * confirmation."
 *
 * Sort: most recent first by `completedAt`. Realtime subscriptions pushed
 * by Phase D keep the feed up to date without explicit polling. Pull-to-
 * refresh is wired anyway as a belt-and-suspenders for cases where the
 * websocket drops during long backgrounds.
 *
 * Three empty states:
 *   1. Pre-account — orange "Sign in to unlock" banner over a generic empty.
 *   2. Signed-in but no friends — "Find friends" CTA → /(tabs)/(people)/search.
 *   3. Signed-in with friends but no friend-scored rounds yet — "View Rounds"
 *      CTA → /(tabs)/(rounds).
 */

import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatRelativeTime, formatScore, getRoundTotalRelative } from '@/lib/scoring';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Player, Round } from '@/types/golf';

export default function FeedScreen() {
  const { colors } = useTheme();
  const { account } = useAccount();
  const { friends } = useSocial();
  const { profileCache } = useSocial();
  const { completedRounds } = useGolfRound();
  const { allPlayers, defaultPlayerId, getPlayer } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [refreshing, setRefreshing] = useState(false);

  useScreenHeader({
    left: { kind: 'text', text: 'FEED' },
    right: { kind: 'profile' },
  });

  // Feed shows rounds where at least one confirmed linked participant is
  // NOT the current user. That includes friends' solo rounds and any shared
  // round once another participant has confirmed. Rounds awaiting my own
  // confirmation are excluded (they live in the Pending drilldown).
  const { pendingRoundsForMe } = useGolfRound();
  const friendRounds = useMemo(() => {
    const pendingIds = new Set(pendingRoundsForMe.map((r) => r.id));
    const rows = completedRounds.filter((r) => {
      if (pendingIds.has(r.id)) return false;
      const otherConfirmed = r.participants?.some(
        (p) =>
          p.linkedUserId &&
          p.linkedUserId !== account?.userId &&
          p.status === 'confirmed'
      );
      return !!otherConfirmed;
    });
    return [...rows].sort((a, b) => {
      const at = new Date(a.completedAt ?? a.startedAt).getTime();
      const bt = new Date(b.completedAt ?? b.startedAt).getTime();
      return bt - at;
    });
  }, [completedRounds, pendingRoundsForMe, account]);

  const onRefresh = useCallback(async () => {
    // The cloud-sync effects in GolfRoundContext re-run when `account`
    // changes; for an explicit refresh we do nothing fancy yet — a future
    // improvement would expose a public `refreshRounds()` helper. Today we
    // just pause briefly so the spinner gives feedback.
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
  }, []);

  // -------- Empty states --------
  if (!account) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentEmpty}>
        <Text style={styles.title}>Feed</Text>
        <View style={styles.preaccountBanner}>
          <Text style={styles.preaccountHead}>✦  SIGN IN TO UNLOCK</Text>
          <Text style={styles.preaccountBody}>
            The feed shows rounds your friends have scored. Sign in and connect with friends to
            see them roll in here in real time.
          </Text>
          <Pressable style={styles.preaccountBtn} onPress={() => router.push('/sign-in')}>
            <Text style={styles.preaccountBtnText}>Sign in</Text>
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📰</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            Once you have an account, your friends' rounds will appear here chronologically.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (friends.length === 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentEmpty}>
        <Text style={styles.title}>Feed</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Find friends to see their rounds</Text>
          <Text style={styles.emptyBody}>
            Search for friends by their <Text style={styles.codeChip}>@handle</Text> and add them.
            Their completed rounds will appear here.
          </Text>
          <Pressable
            style={styles.primaryCta}
            onPress={() => router.push('/(tabs)/(people)/search')}>
            <Text style={styles.primaryCtaText}>+  Find friends</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (friendRounds.length === 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentEmpty}>
        <Text style={styles.title}>Feed</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⛳</Text>
          <Text style={styles.emptyTitle}>No friend rounds yet</Text>
          <Text style={styles.emptyBody}>
            You're connected with friends, but no one has scored a round you can see yet. Your own
            rounds live in the <Text style={styles.emptyBodyEm}>Rounds</Text> tab.
          </Text>
          <Pressable
            style={styles.outlineCta}
            onPress={() => router.push('/(tabs)/(rounds)')}>
            <Text style={styles.outlineCtaText}>View Rounds</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // -------- Populated feed --------
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }>
      <Text style={styles.title}>Feed</Text>
      {friendRounds.map((round) => (
        <FeedCard
          key={round.id}
          round={round}
          allPlayers={allPlayers}
          defaultPlayerId={defaultPlayerId}
          getPlayer={getPlayer}
          colors={colors}
          styles={styles}
          myUserId={account?.userId}
          profileCache={profileCache}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/(rounds)/[id]',
              params: { id: round.id },
            })
          }
        />
      ))}
    </ScrollView>
  );
}

type FeedCardProps = {
  round: Round;
  allPlayers: Player[];
  defaultPlayerId: string | null;
  getPlayer: (id: string) => Player | undefined;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof makeStyles>;
  myUserId?: string;
  profileCache: Record<string, { displayName: string; handle: string; avatarColor: string; userId: string }>;
  onPress: () => void;
};

function FeedCard({
  round,
  allPlayers,
  defaultPlayerId,
  getPlayer,
  colors,
  styles,
  onPress,
  myUserId,
  profileCache,
}: FeedCardProps) {
  // Owner display: snapshot from participants if the owner is a confirmed
  // linked participant; fall back to profile cache; finally to roster.
  const ownerParticipant = round.participants?.find(
    (p) => p.linkedUserId === round.ownerUserId && p.status === 'confirmed'
  );
  const ownerProfile = round.ownerUserId ? profileCache[round.ownerUserId] : undefined;
  const ownerLocal = round.ownerId ? getPlayer(round.ownerId) : undefined;
  const ownerName =
    ownerParticipant?.displayName ??
    ownerProfile?.displayName ??
    ownerLocal?.nickname ??
    'A friend';
  const ownerHandle = ownerProfile?.handle ?? ownerLocal?.handle;
  const ownerColor =
    ownerParticipant?.displayColor ?? ownerProfile?.avatarColor ?? ownerLocal?.color ?? colors.primary;
  const ownerInitial = ownerName[0]?.toUpperCase() ?? '?';

  const isScramble = round.scoringRule === 'scramble';

  // Score chip = the round owner's score (in stroke). For scramble we still
  // show round-total since there's no clear "owner team."
  const ownerScorerId = isScramble ? undefined : ownerParticipant?.participantKey;
  const totalRel = ownerScorerId
    ? getRoundTotalRelative(round, ownerScorerId)
    : getRoundTotalRelative(round);
  const scoreChipStyle =
    totalRel > 0 ? styles.scoreChipOver : totalRel < 0 ? styles.scoreChipUnder : styles.scoreChipEven;
  const scoreTextStyle =
    totalRel > 0
      ? styles.scoreChipTextOver
      : totalRel < 0
      ? styles.scoreChipTextUnder
      : styles.scoreChipTextEven;

  const dateLabel = formatRelativeTime(round.completedAt ?? round.startedAt);
  const holeCount = round.course.holes.length;

  // Participant strip + with-line both come from round.participants so the
  // rendering is consistent across users (no roster lookups). Hide pending
  // rows from non-owner viewers; the owner always sees them since they
  // entered the scores.
  const viewerIsOwner = !!myUserId && round.ownerUserId === myUserId;
  const visibleParticipants = (round.participants ?? []).filter(
    (p) => viewerIsOwner || p.status === 'confirmed' || !p.linkedUserId
  );
  const stackSources: Array<{ id: string; name: string; color: string }> = isScramble && round.teams
    ? round.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))
    : visibleParticipants.map((p) => ({
        id: p.participantKey,
        name: p.displayName,
        color: p.displayColor || colors.primary,
      }));

  const pendingNames = (round.participants ?? [])
    .filter((p) => p.status === 'pending')
    .map((p) => `${p.displayName} ?`);

  const others = visibleParticipants
    .filter(
      (p) =>
        p.linkedUserId !== round.ownerUserId &&
        p.linkedUserId !== myUserId
    )
    .map((p) => p.displayName);
  const meIsParticipant =
    !!myUserId &&
    !!round.participants?.some((p) => p.linkedUserId === myUserId && p.status === 'confirmed');
  const withParts: string[] = [];
  if (meIsParticipant) withParts.push('you');
  withParts.push(...others, ...pendingNames);
  const withText = withParts.length > 0 ? `with ${withParts.join(', ')}` : '';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: ownerColor }]}>
          <Text style={styles.avatarText}>{ownerInitial}</Text>
        </View>
        <View style={styles.cardWho}>
          <Text style={styles.cardWhoName} numberOfLines={1}>
            {ownerName}
          </Text>
          {ownerHandle ? (
            <Text style={styles.cardWhoHandle} numberOfLines={1}>
              @{ownerHandle}
            </Text>
          ) : null}
        </View>
        <Text style={styles.cardWhen}>{dateLabel}</Text>
      </View>

      <View style={styles.cardCourse}>
        <View style={styles.cardCourseInfo}>
          <Text style={styles.cardCourseName} numberOfLines={1}>
            {round.course.name}
          </Text>
          <Text style={styles.cardCourseMeta}>
            {isScramble ? 'Scramble' : 'Stroke'} · {holeCount} {holeCount === 1 ? 'hole' : 'holes'}
          </Text>
        </View>
        <View style={[styles.scoreChip, scoreChipStyle]}>
          <Text style={[styles.scoreChipText, scoreTextStyle]}>{formatScore(totalRel)}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.stack}>
          {stackSources.slice(0, 4).map((src, i) => (
            <View
              key={src.id}
              style={[
                styles.stackAvatar,
                { backgroundColor: src.color, marginLeft: i === 0 ? 0 : -6 },
              ]}>
              <Text style={styles.stackAvatarText}>{src.name[0]?.toUpperCase()}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.withText} numberOfLines={1}>
          {withText}
        </Text>
        <Text style={styles.viewLink}>View round  →</Text>
      </View>
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
    contentEmpty: {
      padding: 20,
      paddingBottom: 40,
      flexGrow: 1,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
    },

    // Card
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 10,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
    cardWho: {
      flex: 1,
      minWidth: 0,
    },
    cardWhoName: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    cardWhoHandle: {
      fontSize: 11,
      color: colors.primaryDark,
      fontWeight: '700',
      marginTop: 1,
    },
    cardWhen: {
      fontSize: 10.5,
      color: colors.textMuted,
      fontWeight: '600',
    },

    cardCourse: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    cardCourseInfo: {
      flex: 1,
      minWidth: 0,
    },
    cardCourseName: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    cardCourseMeta: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    scoreChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9,
    },
    scoreChipText: {
      fontSize: 14,
      fontWeight: '800',
    },
    scoreChipEven: {
      backgroundColor: colors.chipBg,
    },
    scoreChipTextEven: {
      color: colors.textTitle,
    },
    scoreChipOver: {
      backgroundColor: colors.accent + '22',
    },
    scoreChipTextOver: {
      color: colors.accent,
    },
    scoreChipUnder: {
      backgroundColor: colors.primary + '22',
    },
    scoreChipTextUnder: {
      color: colors.primaryDark,
    },

    cardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    stack: {
      flexDirection: 'row',
    },
    stackAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.cardBg,
    },
    stackAvatarText: {
      color: '#ffffff',
      fontSize: 9,
      fontWeight: '800',
    },
    withText: {
      flex: 1,
      fontSize: 11,
      color: colors.textMuted,
      marginLeft: 4,
    },
    viewLink: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primaryDark,
      letterSpacing: 0.3,
    },

    // Empty / pre-account states
    empty: {
      alignItems: 'center',
      paddingTop: 40,
      paddingHorizontal: 16,
      gap: 10,
    },
    emptyIcon: {
      fontSize: 38,
      opacity: 0.5,
    },
    emptyTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 270,
    },
    emptyBodyEm: {
      color: colors.textTitle,
      fontWeight: '800',
    },
    codeChip: {
      fontFamily: 'SpaceMono',
      fontSize: 11,
      color: colors.primaryDark,
    },
    primaryCta: {
      marginTop: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    primaryCtaText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13,
    },
    outlineCta: {
      marginTop: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    outlineCtaText: {
      color: colors.primaryDark,
      fontWeight: '800',
      fontSize: 13,
    },

    preaccountBanner: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    preaccountHead: {
      fontSize: 10,
      color: colors.accent,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    preaccountBody: {
      fontSize: 12,
      color: '#6b5a3a',
      lineHeight: 18,
      marginBottom: 10,
    },
    preaccountBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 9,
      alignItems: 'center',
    },
    preaccountBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '800',
    },
  });
}