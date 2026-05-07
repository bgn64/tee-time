/**
 * Confirm friend request.
 *
 * Reached from the search results. Spells out exactly what will happen on
 * send — request goes out, auto-link on acceptance, past shared rounds
 * queue as bulk-claim — so the user doesn't accidentally fire off requests.
 *
 * On send: dispatches `sendFriendRequest` and pops back two screens (out
 * of confirm and search) so the user lands on the screen they came from
 * (roster detail or Friends segment).
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

export default function ConfirmRequestScreen() {
  const { colors } = useTheme();
  const { targetUserId, sourcePlayerId } = useLocalSearchParams<{
    targetUserId: string;
    sourcePlayerId?: string;
  }>();
  const { directory, sendFriendRequest } = useSocial();
  const { completedRounds } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Search', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const target = directory.find((d) => d.userId === targetUserId);

  if (!target) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundIcon}>👤</Text>
        <Text style={styles.notFoundTitle}>That account isn't reachable</Text>
        <Text style={styles.notFoundBody}>The link is stale. Search again.</Text>
      </View>
    );
  }

  const initial = target.displayName[0]?.toUpperCase() ?? '?';

  // Estimate how many past rounds will queue as bulk-claim on the friend's
  // side: rounds where the source roster Player participated. Only relevant
  // for source-rooted requests.
  const sharedRoundsCount = sourcePlayerId
    ? completedRounds.filter((r) => r.playerIds.includes(sourcePlayerId)).length
    : 0;

  const onSend = () => {
    sendFriendRequest(target, sourcePlayerId);
    // Pop the confirm screen — we want to leave the search route open
    // briefly then bounce all the way out. router.back() once exits to
    // search; calling back twice exits the whole flow.
    router.back();
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Send friend request to @{target.handle}?</Text>

      <View style={styles.previewCard}>
        <View style={[styles.avatar, { backgroundColor: target.avatarColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.previewInfo}>
          <Text style={styles.previewName}>{target.displayName}</Text>
          <Text style={styles.previewHandle}>@{target.handle}</Text>
          <Text style={styles.previewMeta}>
            Joined {new Date(target.joinedAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <Text style={styles.body}>
        We'll send <Text style={styles.bodyEm}>@{target.handle}</Text> a friend request. Once they
        accept, your roster {sourcePlayerId ? 'entry will auto-link to their account' : 'will get a new entry for them'}
        {sharedRoundsCount > 0
          ? `, and they'll see a prompt to claim your ${sharedRoundsCount} past shared ${
              sharedRoundsCount === 1 ? 'round' : 'rounds'
            }.`
          : '.'}
      </Text>

      <Pressable style={styles.primaryBtn} onPress={onSend}>
        <Text style={styles.primaryBtnText}>Send friend request</Text>
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
        <Text style={styles.secondaryBtnText}>Cancel</Text>
      </Pressable>
    </ScrollView>
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
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 14,
    },
    previewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 22,
      fontWeight: '800',
    },
    previewInfo: {
      flex: 1,
      minWidth: 0,
    },
    previewName: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
    },
    previewHandle: {
      fontSize: 12,
      color: colors.primaryDark,
      fontWeight: '700',
      marginTop: 1,
    },
    previewMeta: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 4,
    },
    body: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 18,
    },
    bodyEm: {
      fontWeight: '800',
      color: colors.primaryDark,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginBottom: 8,
    },
    primaryBtnText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 14,
    },
    secondaryBtn: {
      paddingVertical: 13,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: colors.textMuted,
      fontWeight: '700',
      fontSize: 13,
    },
    notFound: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: 32,
      gap: 8,
    },
    notFoundIcon: {
      fontSize: 36,
      opacity: 0.5,
      marginBottom: 4,
    },
    notFoundTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
    },
    notFoundBody: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}
