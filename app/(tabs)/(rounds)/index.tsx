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
  const { completedRounds } = useGolfRound();
  const { account } = useAccount();
  const { getPlayer } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [filter, setFilter] = useState<FilterKey>('all');

  useScreenHeader({
    left: { kind: 'text', text: 'ROUNDS' },
    right: { kind: 'profile' },
  });

  // "Mine" = rounds I scored. The v7 model has no shared-ownership concept;
  // rounds where I'm merely named (but didn't score) live on the feed only.
  const minedRounds = useMemo(() => {
    return completedRounds.filter((r) => {
      if (account?.userId) return r.ownerUserId === account.userId;
      return !r.ownerUserId;
    });
  }, [completedRounds, account]);

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

                // Avatars rendered live via the participantIdentity resolver.
                // Local entries fall back to their snapshot fields. For
                // scramble rounds we still use the team chips.
                const avatarSources: { id: string; name: string; color: string }[] =
                  isScramble && round.teams
                    ? round.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))
                    : (round.participants ?? []).map((p) => {
                        const id = p.linkedUserId ?? p.participantKey;
                        if (p.linkedUserId) {
                          const rosterMatch = getPlayer(p.participantKey);
                          return {
                            id,
                            name:
                              rosterMatch?.displayName ?? rosterMatch?.nickname ?? 'Friend',
                            color: rosterMatch?.color ?? colors.primary,
                          };
                        }
                        return {
                          id,
                          name: p.localDisplayName ?? 'Player',
                          color: p.localDisplayColor ?? colors.primary,
                        };
                      });

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
