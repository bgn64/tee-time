/**
 * Round detail — read-only scorecard for a single completed round.
 *
 * Reached from the Rounds list (and later, from the Feed deep-link). Looks up
 * the round by id from `completedRounds`. The grid itself is rendered by the
 * shared `<ReadOnlyScorecard />` component, which is also used by the Score
 * tab's in-progress scorecard view.
 *
 * Phase 3 step 7: when the user is signed-out and the round was completed
 * very recently (last 24h), a dismissible "Sign in to back up" banner is
 * shown above the scorecard. After the user has dismissed it
 * `POST_ROUND_PROMPT_SUPPRESS_THRESHOLD` times across all rounds, the banner
 * stops appearing entirely. Local view state also hides the banner for the
 * current view session so "Maybe later" feels responsive.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FriendStatusChip } from '@/components/FriendStatusChip';
import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

const POST_ROUND_PROMPT_WINDOW_MS = 24 * 60 * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getRoundTotalRelative(round: Round): number {
  let total = 0;
  for (const score of round.scores) {
    const hole = round.course.holes.find((h) => h.number === score.holeNumber);
    if (hole) total += score.strokes - hole.par;
  }
  return total;
}

function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

export default function RoundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { completedRounds, deleteRoundFromHistory } = useGolfRound();
  const { account, postRoundPromptSuppressed, markPostRoundPromptDismissed } = useAccount();
  const { getPlayer } = usePlayers();
  const [bannerDismissedLocal, setBannerDismissedLocal] = useState(false);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Rounds', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const round = completedRounds.find((r) => r.id === id);

  if (!round) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundIcon}>⛳</Text>
        <Text style={styles.notFoundTitle}>Round not found</Text>
        <Text style={styles.notFoundBody}>
          It may have been abandoned or the link is stale.
        </Text>
      </View>
    );
  }

  const totalRel = getRoundTotalRelative(round);
  const isScramble = round.scoringRule === 'scramble';
  const dateLabel = formatDate(round.completedAt ?? round.startedAt);

  // Banner is shown only when:
  //   · The user is signed out
  //   · The user hasn't reached the dismiss threshold globally
  //   · The user hasn't dismissed it on this view session
  //   · The round actually completed within the last 24h (so opening an
  //     old round detail months later doesn't surface it).
  const completedRecently =
    !!round.completedAt &&
    Date.now() - new Date(round.completedAt).getTime() < POST_ROUND_PROMPT_WINDOW_MS;
  const showSignInBanner =
    !account && !postRoundPromptSuppressed && !bannerDismissedLocal && completedRecently;

  const onDismissBanner = () => {
    setBannerDismissedLocal(true);
    markPostRoundPromptDismissed();
  };

  const onSignInFromBanner = () => {
    router.push('/sign-in');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {showSignInBanner && (
        <View style={styles.banner}>
          <Text style={styles.bannerHead}>✦  YOU JUST FINISHED A ROUND</Text>
          <Text style={styles.bannerBody}>
            Sign in to back up <Text style={styles.bannerBodyEm}>this round</Text> and your full
            history. You can skip and keep playing locally — no pressure.
          </Text>
          <View style={styles.bannerActions}>
            <Pressable style={[styles.bannerBtn, styles.bannerBtnSkip]} onPress={onDismissBanner}>
              <Text style={styles.bannerBtnSkipText}>Maybe later</Text>
            </Pressable>
            <Pressable
              style={[styles.bannerBtn, styles.bannerBtnPrimary]}
              onPress={onSignInFromBanner}>
              <Text style={styles.bannerBtnPrimaryText}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.title}>{round.course.name}</Text>
      {round.course.location ? (
        <Text style={styles.location}>{round.course.location}</Text>
      ) : null}
      <Text style={styles.subtitle}>
        {isScramble ? 'Scramble' : 'Stroke'} · {dateLabel} · Final{' '}
        <Text
          style={[
            styles.subtitleScore,
            totalRel > 0 && styles.scoreOver,
            totalRel < 0 && styles.scoreUnder,
          ]}>
          {formatScore(totalRel)}
        </Text>
      </Text>

      {round.claims && Object.keys(round.claims).length > 0 && (
        <View style={styles.claimsStrip}>
          <Text style={styles.claimsHead}>FRIEND CLAIMS</Text>
          {Object.entries(round.claims).map(([participantId, status]) => {
            const participant = getPlayer(participantId);
            const label = participant?.nickname ?? 'Unknown';
            return (
              <View key={participantId} style={styles.claimRow}>
                <Text style={styles.claimName}>{label}</Text>
                <FriendStatusChip status={status} />
              </View>
            );
          })}
        </View>
      )}

      <ReadOnlyScorecard round={round} />

      {/* Delete button. Only meaningful while signed in (cloud round_claims
          drives the lifecycle); offline-only rounds get a local-only delete
          since there's no claim graph to consult. The confirmation message
          adapts to whether anyone else has a 'claimed' entry. */}
      <View style={styles.dangerZone}>
        <Pressable
          style={styles.deleteButton}
          onPress={() => {
            const otherClaimedCount = round.claims
              ? Object.entries(round.claims).filter(([, status]) => status === 'claimed')
                  .length
              : 0;
            const message =
              otherClaimedCount > 0
                ? 'Other players who claimed this round will keep their copy.'
                : 'It will be removed permanently.';
            Alert.alert('Delete this round?', message, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteRoundFromHistory(round.id);
                  router.back();
                },
              },
            ]);
          }}>
          <Text style={styles.deleteButtonText}>Delete this round</Text>
        </Pressable>
      </View>
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
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    location: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 8,
      marginBottom: 16,
    },
    subtitleScore: {
      fontWeight: '800',
      color: colors.textTitle,
    },
    scoreOver: {
      color: colors.accent,
    },
    scoreUnder: {
      color: colors.primaryDark,
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
      maxWidth: 240,
    },

    // Post-round sign-in banner
    banner: {
      backgroundColor: '#fff8e7',
      borderWidth: 1,
      borderColor: '#f5e0b8',
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    bannerHead: {
      fontSize: 11,
      color: colors.accent,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    bannerBody: {
      fontSize: 13,
      color: '#6b5a3a',
      lineHeight: 18,
      marginBottom: 12,
    },
    bannerBodyEm: {
      fontWeight: '800',
      color: '#6b5a3a',
    },
    bannerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    bannerBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 8,
      alignItems: 'center',
    },
    bannerBtnSkip: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: '#e0d0a8',
    },
    bannerBtnSkipText: {
      color: '#7c6b4f',
      fontWeight: '800',
      fontSize: 12,
    },
    bannerBtnPrimary: {
      backgroundColor: colors.primary,
    },
    bannerBtnPrimaryText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 12,
    },

    // Friend-claims strip
    claimsStrip: {
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    claimsHead: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.7,
      color: colors.textMuted,
      marginBottom: 8,
    },
    claimRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    claimName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    dangerZone: {
      marginTop: 28,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    deleteButton: {
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: '#dc2626',
      paddingVertical: 12,
      alignItems: 'center',
    },
    deleteButtonText: {
      color: '#dc2626',
      fontWeight: '800',
      fontSize: 13,
    },
  });
}
