/**
 * Rounds list — root of the Rounds tab (redesigned).
 *
 * Renders completed rounds the viewer scored. The in-page "Rounds"
 * title is dropped (the persistent app header already says it). The
 * toolbar is:
 *
 *   · full-width search bar — fuzzy match across course name + every
 *     participant display name. Search is the right tool for high-
 *     cardinality free-text recall.
 *
 *   · Filter pill — opens a bottom sheet covering format, hole-range,
 *     and date-range. Selections apply live; the pill's badge
 *     ("Filter · N") tracks active count.
 *
 *   · Sort pill — opens a compact anchored dropdown with Newest /
 *     Oldest / Best score / Worst score.
 *
 *   · active-filter chip row — removable chips below the pill row
 *     when filters are non-default.
 *
 * Rounds still group by month (newest-first by default); sort
 * direction collapses the grouping when the user picks a non-time
 * sort.
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  DEFAULT_ROUNDS_FILTERS,
  RoundsFilterSheet,
  RoundsFilters,
  countActiveFilters,
} from '@/components/RoundsFilterSheet';
import { SortDropdown, SortOption } from '@/components/SortDropdown';
import {
  buildAvatarEntries,
  groupByTeam,
  makeRosterResolver,
  TeamGroup,
  truncateEntries,
} from '@/lib/avatars';
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

type SortKey = 'newest' | 'oldest' | 'bestScore' | 'worstScore';

const SORT_OPTIONS: ReadonlyArray<SortOption<SortKey>> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'bestScore', label: 'Best score' },
  { value: 'worstScore', label: 'Worst score' },
];

function getRoundEndDate(round: Round): Date {
  return new Date(round.completedAt ?? round.startedAt);
}

function rangeLabel(r: RoundsFilters['range']): string {
  if (r === 'all') return '18 holes';
  if (r === 'front9') return 'Front 9';
  if (r === 'back9') return 'Back 9';
  return '';
}

function dateLabel(d: RoundsFilters['date']): string {
  if (d === 'last30') return 'Last 30 days';
  if (d === 'last90') return 'Last 90 days';
  if (d === 'thisYear') return 'This year';
  return '';
}

function formatLabel(f: RoundsFilters['format']): string {
  if (f === 'stroke') return 'Stroke';
  if (f === 'scramble') return 'Scramble';
  return '';
}

function sortLabel(s: SortKey): string {
  const opt = SORT_OPTIONS.find((o) => o.value === s);
  return opt?.label ?? '';
}

function dateCutoff(d: RoundsFilters['date']): Date | null {
  const now = new Date();
  if (d === 'last30') {
    const t = new Date(now);
    t.setDate(t.getDate() - 30);
    return t;
  }
  if (d === 'last90') {
    const t = new Date(now);
    t.setDate(t.getDate() - 90);
    return t;
  }
  if (d === 'thisYear') {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null;
}

export default function RoundsListScreen() {
  const { colors } = useTheme();
  const { completedRounds } = useGolfRound();
  const { account } = useAccount();
  const { getPlayer } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<RoundsFilters>(DEFAULT_ROUNDS_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useScreenHeader({
    left: { kind: 'text', text: 'ROUNDS' },
    right: { kind: 'profile' },
  });

  // "Mine" = rounds I scored.
  const minedRounds = useMemo(() => {
    return completedRounds.filter((r) => {
      if (account?.userId) return r.ownerUserId === account.userId;
      return !r.ownerUserId;
    });
  }, [completedRounds, account]);

  // Helper for both search-match and people-display.
  const resolveParticipantName = (
    p: { linkedUserId?: string; localDisplayName?: string; participantKey: string }
  ): string => {
    if (p.linkedUserId) {
      const rosterMatch = getPlayer(p.participantKey);
      return rosterMatch?.displayName ?? rosterMatch?.nickname ?? '';
    }
    return p.localDisplayName ?? '';
  };

  const matchesQuery = (round: Round, q: string): boolean => {
    if (!q) return true;
    const needle = q.toLowerCase();
    if (round.course.name.toLowerCase().includes(needle)) return true;
    for (const p of round.participants ?? []) {
      const name = resolveParticipantName(p).toLowerCase();
      if (name && name.includes(needle)) return true;
    }
    return false;
  };

  const filteredRounds = useMemo(() => {
    const cutoff = dateCutoff(filters.date);
    return minedRounds.filter((r) => {
      if (filters.format !== 'all' && r.scoringRule !== filters.format) return false;
      if (filters.range !== 'any' && r.holeRange !== filters.range) return false;
      if (cutoff) {
        const end = getRoundEndDate(r);
        if (end < cutoff) return false;
      }
      if (!matchesQuery(r, query.trim())) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minedRounds, filters, query, getPlayer]);

  // Sort. For score sorts we use the viewer's own scorer total in stroke;
  // for scramble we use the round total.
  const sortedRounds = useMemo(() => {
    const arr = [...filteredRounds];
    if (sortKey === 'newest' || sortKey === 'oldest') {
      arr.sort((a, b) => {
        const at = getRoundEndDate(a).getTime();
        const bt = getRoundEndDate(b).getTime();
        return sortKey === 'newest' ? bt - at : at - bt;
      });
      return arr;
    }
    const scoreFor = (r: Round): number => {
      const isScramble = r.scoringRule === 'scramble';
      let scorerId: string | undefined;
      if (!isScramble && account?.userId) {
        scorerId = r.participants?.find((p) => p.linkedUserId === account.userId)
          ?.participantKey;
      }
      return getRoundTotalRelative(r, scorerId);
    };
    arr.sort((a, b) => {
      const av = scoreFor(a);
      const bv = scoreFor(b);
      return sortKey === 'bestScore' ? av - bv : bv - av;
    });
    return arr;
  }, [filteredRounds, sortKey, account]);

  // Group by month only when sorted by time. Other sorts render flat.
  const grouped = useMemo(() => {
    if (sortKey !== 'newest' && sortKey !== 'oldest') {
      return [{ key: null, rounds: sortedRounds }] as Array<{
        key: string | null;
        rounds: Round[];
      }>;
    }
    const groups: { key: string | null; rounds: Round[] }[] = [];
    for (const round of sortedRounds) {
      const key = monthKey(getRoundEndDate(round));
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.rounds.push(round);
      } else {
        groups.push({ key, rounds: [round] });
      }
    }
    return groups;
  }, [sortedRounds, sortKey]);

  const activeCount = countActiveFilters(filters);

  // Removable active-filter chips.
  const activeChips: Array<{ label: string; clear: () => void }> = [];
  if (filters.format !== 'all') {
    activeChips.push({
      label: formatLabel(filters.format),
      clear: () => setFilters({ ...filters, format: 'all' }),
    });
  }
  if (filters.range !== 'any') {
    activeChips.push({
      label: rangeLabel(filters.range),
      clear: () => setFilters({ ...filters, range: 'any' }),
    });
  }
  if (filters.date !== 'any') {
    activeChips.push({
      label: dateLabel(filters.date),
      clear: () => setFilters({ ...filters, date: 'any' }),
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search course or player"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={6}>
              <Text style={styles.clearX}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.pillRow}>
          <Pressable
            style={[styles.pill, activeCount > 0 && styles.pillActive]}
            onPress={() => setFilterSheetOpen(true)}>
            <Text
              style={[
                styles.pillText,
                activeCount > 0 && styles.pillTextActive,
              ]}>
              {activeCount > 0 ? `Filter · ${activeCount}` : 'Filter'}
            </Text>
            <Text
              style={[
                styles.pillChev,
                activeCount > 0 && styles.pillChevActive,
              ]}>
              ▾
            </Text>
          </Pressable>

          <Pressable
            style={[styles.pill, sortMenuOpen && styles.pillFocused]}
            onPress={() => setSortMenuOpen(true)}>
            <Text style={styles.pillText}>{`Sort: ${sortLabel(sortKey)}`}</Text>
            <Text style={styles.pillChev}>{sortMenuOpen ? '▴' : '▾'}</Text>
          </Pressable>
        </View>

        {activeChips.length > 0 ? (
          <View style={styles.chipRow}>
            {activeChips.map((c) => (
              <Pressable
                key={c.label}
                style={styles.activeChip}
                onPress={c.clear}>
                <Text style={styles.activeChipText}>{c.label}</Text>
                <Text style={styles.activeChipX}>×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {grouped.length === 0 || grouped.every((g) => g.rounds.length === 0) ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>⛳</Text>
            <Text style={styles.emptyTitle}>
              {query || activeCount > 0 ? 'No rounds match' : 'No rounds yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {query || activeCount > 0
                ? 'Try clearing the search or some filters.'
                : 'Finished rounds will show up here, grouped by month.'}
            </Text>
          </View>
        ) : (
          grouped.map((group, gi) => (
            <View key={group.key ?? `flat-${gi}`}>
              {group.key ? <Text style={styles.monthLabel}>{group.key}</Text> : null}
              {group.rounds.map((round) => {
                const date = getRoundEndDate(round);
                const isScramble = round.scoringRule === 'scramble';

                // Build per-individual entries (tee + team membership resolved
                // upstream in `lib/avatars.ts`), then truncate to a flat cap
                // across the whole card and re-group by team for scramble.
                const allEntries = buildAvatarEntries(
                  round,
                  makeRosterResolver(getPlayer, colors.primary)
                );
                const { visible, hiddenCount } = truncateEntries(allEntries);
                const teamGroups: TeamGroup[] = isScramble
                  ? groupByTeam(visible, round.teams ?? [])
                  : [
                      {
                        teamId: null,
                        teamName: null,
                        teamColor: null,
                        members: visible,
                      },
                    ];

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
                        {teamGroups.map((tg, gi) => {
                          // In scramble every team member shares the same
                          // teeId by construction (the format screen expands
                          // a per-team selection to each member at
                          // startRound). In stroke each "team-of-one" carries
                          // its own tee. Either way, `members[0]` gives us
                          // the right tee for the pill.
                          const sampleEntry = tg.members[0];
                          const teeColor = sampleEntry?.teeColor;
                          const teeName = sampleEntry?.teeName;
                          const showTee = !!(teeColor || teeName);
                          return (
                            <View
                              key={tg.teamId ?? `solo-${gi}`}
                              style={[
                                styles.teamGroup,
                                gi > 0 ? styles.teamGroupGap : null,
                              ]}>
                              <View style={styles.cluster}>
                                {tg.members.map((entry, i) => (
                                  <View
                                    key={entry.participantKey}
                                    style={[
                                      styles.avatarWrap,
                                      i === 0 ? styles.avatarWrapFirst : null,
                                      // Rightmost avatar on top: later
                                      // siblings get higher zIndex.
                                      { zIndex: i + 1 },
                                    ]}>
                                    <View
                                      style={[
                                        styles.avatar,
                                        {
                                          backgroundColor: entry.color,
                                          borderColor: colors.cardBg,
                                        },
                                      ]}>
                                      <Text style={styles.avatarText}>
                                        {entry.name[0]?.toUpperCase()}
                                      </Text>
                                    </View>
                                  </View>
                                ))}
                              </View>
                              {showTee ? (
                                <View style={styles.teePill}>
                                  <View
                                    style={[
                                      styles.teePillDot,
                                      {
                                        backgroundColor:
                                          teeColor ?? colors.chipBg,
                                      },
                                    ]}
                                  />
                                  <Text
                                    style={styles.teePillText}
                                    numberOfLines={1}>
                                    {teeName ?? ''}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                        {hiddenCount > 0 ? (
                          <View style={styles.overflowChip}>
                            <Text style={styles.overflowChipText}>{`+${hiddenCount}`}</Text>
                          </View>
                        ) : null}
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

      <RoundsFilterSheet
        visible={filterSheetOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setFilterSheetOpen(false)}
      />

      <SortDropdown
        visible={sortMenuOpen}
        current={sortKey}
        options={SORT_OPTIONS}
        onCancel={() => setSortMenuOpen(false)}
        onPick={(next) => {
          setSortKey(next);
          setSortMenuOpen(false);
        }}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 32,
      flexGrow: 1,
    },

    // Search bar
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    searchIcon: {
      fontSize: 14,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textTitle,
      paddingVertical: 2,
    },
    clearX: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },

    // Pill row
    pillRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillFocused: {
      borderColor: colors.primaryDark,
    },
    pillText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    pillTextActive: {
      color: '#ffffff',
    },
    pillChev: {
      fontSize: 11,
      color: colors.textMuted,
      marginLeft: 2,
    },
    pillChevActive: {
      color: 'rgba(255,255,255,0.85)',
    },

    // Active-filter chip row
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
    },
    activeChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textTitle,
    },
    activeChipX: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '700',
    },

    monthLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textMuted,
      marginTop: 18,
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
      alignItems: 'flex-start',
      flexShrink: 1,
    },
    teamGroup: {
      // Per-team stacking: avatars on top row, tee pill (if any) below.
      // Pill-below pattern (Option C from the May 2026 mockups).
      flexDirection: 'column',
      alignItems: 'center',
    },
    teamGroupGap: {
      marginLeft: 14,
    },
    cluster: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarWrap: {
      // Negative marginLeft creates the overlap; the rightmost item gets
      // the highest zIndex (set inline at render time) so it appears on top.
      marginLeft: -10,
    },
    avatarWrapFirst: {
      marginLeft: 0,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '800',
    },
    teePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingLeft: 4,
      paddingRight: 7,
      paddingVertical: 1,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginTop: 4,
    },
    teePillDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.18)',
    },
    teePillText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.2,
    },
    overflowChip: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.cardBg,
      backgroundColor: colors.chipBg,
      marginLeft: -10,
      alignSelf: 'flex-start',
    },
    overflowChipText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textMuted,
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
