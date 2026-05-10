/**
 * Rounds list — root of the Rounds tab.
 *
 * Renders completed rounds grouped by month (newest first), with a
 * stroke / scramble segmented filter. Each card shows: course name, day,
 * stacked-avatar participants, and final relative-to-par score chip.
 * Tap a card → /(tabs)/(rounds)/<id> detail.
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  formatDay,
  formatScore,
  getRoundTotalRelative,
  monthKey,
} from '@/lib/scoring';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

type FilterKey = 'all' | 'stroke' | 'scramble';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stroke', label: 'Stroke' },
  { key: 'scramble', label: 'Scramble' },
];

function getRoundEndDate(round: Round): Date {
  return new Date(round.completedAt ?? round.startedAt);
}

export default function RoundsListScreen() {
  const { colors } = useTheme();
  const { completedRounds, pendingRoundsForMe } = useGolfRound();
  const { account } = useAccount();
  const { getPlayer } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [filter, setFilter] = useState<FilterKey>('all');

  useScreenHeader({
    left: { kind: 'text', text: 'ROUNDS' },
    right: { kind: 'profile' },
  });

  // "Mine" = rounds I scored OR rounds where I have a confirmed participant
  // row. Pending-for-me rounds are excluded; they live in the Pending
  // drilldown instead. Friend-of-participant visibility (which surfaces
  // rounds I wasn't in at all) is handled by the Feed tab, not here.
  const minedRounds = useMemo(() => {
    const pendingIds = new Set(pendingRoundsForMe.map((r) => r.id));
    return completedRounds.filter((r) => {
      if (pendingIds.has(r.id)) return false;
      if (account?.userId && r.ownerUserId === account.userId) return true;
      if (!account) return true; // anonymous mode — only own rounds visible anyway
      return !!r.participants?.some(
        (p) => p.linkedUserId === account.userId && p.status === 'confirmed'
      );
    });
  }, [completedRounds, pendingRoundsForMe, account]);

  const filteredRounds = useMemo(() => {
    if (filter === 'all') return minedRounds;
    return minedRounds.filter((r) => r.scoringRule === filter);
  }, [minedRounds, filter]);

  // Sort newest-first then group into [{ key, rounds }] preserving sort order.
  const grouped = useMemo(() => {
    const sorted = [...filteredRounds].sort((a, b) => {
      const ad = getRoundEndDate(a).getTime();
      const bd = getRoundEndDate(b).getTime();
      return bd - ad;
    });
    const groups: { key: string; rounds: Round[] }[] = [];
    for (const round of sorted) {
      const key = monthKey(getRoundEndDate(round));
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.rounds.push(round);
      } else {
        groups.push({ key, rounds: [round] });
      }
    }
    return groups;
  }, [filteredRounds]);

  return (
    <View style={styles.container}>
      <View style={styles.fixedTop}>
        <Text style={styles.title}>Rounds</Text>

        {pendingRoundsForMe.length > 0 && (
          <Pressable
            onPress={() => router.push('/(tabs)/(rounds)/pending')}
            style={styles.pendingDrawer}>
            <Text style={styles.pendingDrawerText}>
              ⏳  <Text style={styles.pendingDrawerBold}>
                {pendingRoundsForMe.length} pending
              </Text>{' '}· friends say you played
            </Text>
            <Text style={styles.pendingDrawerChev}>›</Text>
          </Pressable>
        )}

        <View style={styles.segs}>
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.seg, isActive && styles.segActive]}>
                <Text style={[styles.segText, isActive && styles.segTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {grouped.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>⛳</Text>
            <Text style={styles.emptyTitle}>No rounds yet</Text>
            <Text style={styles.emptyBody}>
              {filter === 'all'
                ? 'Finished rounds will show up here, grouped by month.'
                : `Finished ${filter} rounds will show up here.`}
            </Text>
          </View>
        ) : (
          grouped.map((group) => (
            <View key={group.key}>
              <Text style={styles.monthLabel}>{group.key}</Text>
              {group.rounds.map((round) => {
                const date = getRoundEndDate(round);
                const isScramble = round.scoringRule === 'scramble';
                const isOwner =
                  !!account?.userId && round.ownerUserId === account.userId;

                // Avatars: prefer cloud-synced participant snapshot (correct
                // displayName + color across users) over local roster lookup.
                // Hide still-pending linked rows for non-owner viewers; the
                // round owner always sees them since they're the one who
                // entered the score and the round was scored on their device.
                const avatarSources: { id: string; name: string; color: string }[] =
                  isScramble && round.teams
                    ? round.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))
                    : (round.participants ?? [])
                        .filter(
                          (p) => isOwner || p.status === 'confirmed' || !p.linkedUserId
                        )
                        .map((p) => ({
                          id: p.participantKey,
                          name: p.displayName,
                          color: p.displayColor || colors.primary,
                        }));

                // Score chip: in stroke mode show the viewer's own score
                // relative to par (we're in "Mine" so the viewer is one of
                // the participants). For scramble, show the total round
                // relative-to-par across all team scores (no notion of "my
                // team" vs "their team" in the user's profile yet).
                let myScorerId: string | undefined;
                if (!isScramble && account?.userId) {
                  const myPart = round.participants?.find(
                    (p) => p.linkedUserId === account.userId
                  );
                  myScorerId = myPart?.participantKey;
                }
                const totalRel = isScramble
                  ? getRoundTotalRelative(round)
                  : getRoundTotalRelative(round, myScorerId);

                return (
                  <Pressable
                    key={round.id}
                    style={[
                      styles.card,
                      { borderLeftColor: isScramble ? '#9c5dde' : colors.primary },
                    ]}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/(rounds)/[id]',
                        params: { id: round.id },
                      })
                    }>
                    <View style={styles.cardTop}>
                      <Text style={styles.courseName} numberOfLines={1}>
                        {round.course.name}
                      </Text>
                      <Text style={styles.date}>{formatDay(date)}</Text>
                    </View>
                    <View style={styles.cardBottom}>
                      <View style={styles.avatars}>
                        {avatarSources.slice(0, 4).map((src, i) => (
                          <View
                            key={src.id}
                            style={[
                              styles.avatar,
                              {
                                backgroundColor: src.color,
                                marginLeft: i === 0 ? 0 : -7,
                                zIndex: 10 - i,
                                borderColor: colors.cardBg,
                              },
                            ]}>
                            <Text style={styles.avatarText}>
                              {src.name[0]?.toUpperCase()}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.metaRight}>
                        <View
                          style={[
                            styles.tag,
                            isScramble && styles.tagScramble,
                          ]}>
                          <Text
                            style={[
                              styles.tagText,
                              isScramble && styles.tagTextScramble,
                            ]}>
                            {isScramble ? 'Scramble' : 'Stroke'}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.score,
                            totalRel > 0 && styles.scoreOver,
                            totalRel < 0 && styles.scoreUnder,
                          ]}>
                          {formatScore(totalRel)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    fixedTop: {
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
    },
    pendingDrawer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(245,158,11,0.12)',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
    },
    pendingDrawerText: { fontSize: 12, color: '#92660d', fontWeight: '700', flex: 1 },
    pendingDrawerBold: { fontWeight: '800' },
    pendingDrawerChev: { fontSize: 16, color: '#92660d', opacity: 0.7 },
    segs: {
      flexDirection: 'row',
      gap: 4,
      backgroundColor: colors.chipBg,
      borderRadius: 12,
      padding: 4,
      marginBottom: 4,
    },
    seg: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 8,
    },
    segActive: {
      backgroundColor: colors.cardBg,
    },
    segText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    segTextActive: {
      color: colors.textTitle,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 8,
      paddingBottom: 32,
      flexGrow: 1,
    },
    monthLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textMuted,
      marginTop: 14,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderLeftWidth: 3,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    courseName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    date: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
    },
    cardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    avatars: {
      flexDirection: 'row',
    },
    avatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: '800',
    },
    metaRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    tag: {
      backgroundColor: colors.chipBg,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    tagScramble: {
      backgroundColor: '#ede9fe',
    },
    tagText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    tagTextScramble: {
      color: '#7e22ce',
    },
    score: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
      minWidth: 36,
      textAlign: 'right',
    },
    scoreOver: {
      color: colors.accent,
    },
    scoreUnder: {
      color: colors.primaryDark,
    },
    emptyWrap: {
      alignItems: 'center',
      gap: 6,
      paddingTop: 80,
      paddingHorizontal: 20,
    },
    emptyIcon: {
      fontSize: 36,
      marginBottom: 4,
      opacity: 0.6,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
    },
    emptyBody: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 17,
      maxWidth: 240,
    },
  });
}
