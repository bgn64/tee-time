/**
 * Previous rounds list — the user's completed rounds (absorbed from
 * the old standalone Rounds tab; now reachable via the Rounds-tab
 * hub's "Previous rounds" card).
 *
 * Owner-scoped via `useCompletedRounds` (filters by `owner_user_id`)
 * so a friend's scorecard — which now syncs to local SQLite via the
 * `friend_scorecards` stream for the feed — never shows up here.
 * This list is "rounds I scored." Friends' rounds live on the Home
 * feed instead.
 *
 * Toolbar:
 *   - Search bar (course name OR any participant's resolved display
 *     name; fuzzy substring match, case-insensitive).
 *   - Filter pill (opens RoundsFilterSheet — Hole range + Date).
 *   - Sort pill (opens SortDropdown — Newest / Oldest / Best / Worst).
 *   - Active filter chips below the pill row when non-default.
 *
 * Cards render owner-perspective: the displayed score chip is the
 * user's own per-scorer total when they were a participant, falling
 * back to the round-wide total when they weren't (a round scored
 * for friends/family without playing yourself — the player picker
 * doesn't auto-include self today).
 *
 * Performance note: participant resolution is batched at the screen
 * level — we collect the union of every loaded round's `playerIds`,
 * call `useParticipantResolver` ONCE, and pass the resolved map down
 * to the card renderer + the search-match helper. Instantiating one
 * resolver per round card would create N PowerSync watches +
 * duplicate Supabase fallback fetches.
 */

import React from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import {
  countActiveFilters,
  DEFAULT_ROUNDS_FILTERS,
  RoundsFilterSheet,
  type RoundsDateFilter,
  type RoundsFilters,
  type RoundsRangeFilter
} from '@/components/rounds/RoundsFilterSheet';
import { SortDropdown, type SortOption } from '@/components/rounds/SortDropdown';
import { RoundListCard } from '@/components/round/RoundListCard';
import { useCompletedRounds } from '@/library/golf/useCompletedRounds';
import { collectParticipantSnapshots, useParticipantResolver } from '@/library/golf/useParticipantResolver';
import {
  monthKey,
  scoreForRoundsList
} from '@/library/golf/scoring';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';

type SortKey = 'newest' | 'oldest' | 'bestScore' | 'worstScore';

const SORT_OPTIONS: readonly SortOption<SortKey>[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'bestScore', label: 'Best score' },
  { value: 'worstScore', label: 'Worst score' }
];

function getRoundEndDate(round: Round): Date {
  return new Date(round.completedAt ?? round.startedAt);
}

function rangeLabel(r: RoundsRangeFilter): string {
  if (r === 'all') return 'All holes';
  if (r === 'front9') return 'Front 9';
  if (r === 'back9') return 'Back 9';
  return '';
}

function dateLabel(d: RoundsDateFilter): string {
  if (d === 'last30') return 'Last 30 days';
  if (d === 'last90') return 'Last 90 days';
  if (d === 'thisYear') return 'This year';
  return '';
}

function sortLabel(s: SortKey): string {
  const opt = SORT_OPTIONS.find((o) => o.value === s);
  return opt?.label ?? '';
}

function dateCutoff(d: RoundsDateFilter): Date | null {
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
  const router = useRouter();
  const account = useRequiredAccount();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const { rounds, isLoading } = useCompletedRounds();

  const [query, setQuery] = React.useState('');
  const [filters, setFilters] = React.useState<RoundsFilters>(DEFAULT_ROUNDS_FILTERS);
  const [sortKey, setSortKey] = React.useState<SortKey>('newest');
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);

  // Batch participant resolution: collect the union of every loaded
  // round's player_ids ONCE, then look them all up via a single
  // resolver hook. Avoids one PowerSync watch per card.
  const allParticipantKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rounds) {
      for (const pid of r.playerIds) set.add(pid);
    }
    return [...set];
  }, [rounds]);

  // Snapshot map merges all rounds' custom-player snapshots so the
  // resolver can resolve a friend's `custom:` participant key on
  // historic rounds where the local `custom_players` row isn't
  // available. (For own rounds the snapshot is also handy as a
  // tombstone for soft-deleted custom players, mirroring how
  // ReadOnlyScorecard wires it up per-round.)
  const allParticipantSnapshots = React.useMemo(
    () => collectParticipantSnapshots(rounds),
    [rounds]
  );

  const resolver = useParticipantResolver(allParticipantKeys, allParticipantSnapshots);

  const matchesQuery = React.useCallback(
    (round: Round, q: string): boolean => {
      if (!q) return true;
      const needle = q.toLowerCase();
      if (round.course.name.toLowerCase().includes(needle)) return true;
      for (const pid of round.playerIds) {
        const resolved = resolver.get(pid);
        const name = resolved?.displayName?.toLowerCase() ?? '';
        const handle = resolved?.handle?.toLowerCase() ?? '';
        if (name && name.includes(needle)) return true;
        if (handle && handle.includes(needle)) return true;
      }
      return false;
    },
    [resolver]
  );

  const filteredRounds = React.useMemo(() => {
    const cutoff = dateCutoff(filters.date);
    const q = query.trim();
    return rounds.filter((r) => {
      if (filters.range !== 'any' && r.holeRange !== filters.range) return false;
      if (cutoff) {
        const end = getRoundEndDate(r);
        if (end < cutoff) return false;
      }
      if (!matchesQuery(r, q)) return false;
      return true;
    });
  }, [rounds, filters, query, matchesQuery]);

  const sortedRounds = React.useMemo(() => {
    const arr = [...filteredRounds];
    if (sortKey === 'newest' || sortKey === 'oldest') {
      arr.sort((a, b) => {
        const at = getRoundEndDate(a).getTime();
        const bt = getRoundEndDate(b).getTime();
        return sortKey === 'newest' ? bt - at : at - bt;
      });
      return arr;
    }
    arr.sort((a, b) => {
      const av = scoreForRoundsList(a, account.userId);
      const bv = scoreForRoundsList(b, account.userId);
      if (av !== bv) {
        return sortKey === 'bestScore' ? av - bv : bv - av;
      }
      // Tiebreaker: more recent first so the list stays stable.
      return getRoundEndDate(b).getTime() - getRoundEndDate(a).getTime();
    });
    return arr;
  }, [filteredRounds, sortKey, account.userId]);

  const grouped = React.useMemo(() => {
    if (sortKey !== 'newest' && sortKey !== 'oldest') {
      return [{ key: null as string | null, rounds: sortedRounds }];
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

  const activeChips: { label: string; clear: () => void }[] = [];
  if (filters.range !== 'any') {
    activeChips.push({
      label: rangeLabel(filters.range),
      clear: () => setFilters({ ...filters, range: 'any' })
    });
  }
  if (filters.date !== 'any') {
    activeChips.push({
      label: dateLabel(filters.date),
      clear: () => setFilters({ ...filters, date: 'any' })
    });
  }

  const showEmptyNoRounds = !isLoading && rounds.length === 0;
  const showEmptyNoMatch =
    !isLoading &&
    rounds.length > 0 &&
    grouped.every((g) => g.rounds.length === 0);

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
              style={[styles.pillText, activeCount > 0 && styles.pillTextActive]}>
              {activeCount > 0 ? `Filter · ${activeCount}` : 'Filter'}
            </Text>
            <Text
              style={[styles.pillChev, activeCount > 0 && styles.pillChevActive]}>
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
              <Pressable key={c.label} style={styles.activeChip} onPress={c.clear}>
                <Text style={styles.activeChipText}>{c.label}</Text>
                <Text style={styles.activeChipX}>×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : showEmptyNoRounds ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>⛳</Text>
            <Text style={styles.emptyTitle}>No rounds yet</Text>
            <Text style={styles.emptyBody}>
              Finished rounds will show up here, grouped by month. Score one to get started.
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => router.push('/(tabs)/(score)/new' as never)}>
              <Text style={styles.ctaText}>Score a round</Text>
            </Pressable>
          </View>
        ) : showEmptyNoMatch ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔎</Text>
            <Text style={styles.emptyTitle}>No rounds match</Text>
            <Text style={styles.emptyBody}>Try clearing the search or some filters.</Text>
          </View>
        ) : (
          grouped.map((group, gi) => (
            <View key={group.key ?? `flat-${gi}`}>
              {group.key ? <Text style={styles.monthLabel}>{group.key}</Text> : null}
              {group.rounds.map((round) => (
                <RoundListCard
                  key={round.id}
                  round={round}
                  detailRoutePrefix="/(tabs)/(score)/previous"
                  profileRoutePrefix="/(tabs)/(score)/profile"
                />
              ))}
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
      backgroundColor: colors.background
    },
    scroll: {
      flex: 1
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 32,
      flexGrow: 1
    },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8
    },
    searchIcon: {
      fontSize: 13,
      opacity: 0.6
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.textTitle,
      paddingVertical: 2
    },
    clearX: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700'
    },

    pillRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
      marginBottom: 8
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary
    },
    pillFocused: {
      borderColor: colors.primary
    },
    pillText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textTitle
    },
    pillTextActive: {
      color: '#ffffff'
    },
    pillChev: {
      fontSize: 10,
      color: colors.textMuted
    },
    pillChevActive: {
      color: '#ffffff'
    },

    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8
    },
    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border
    },
    activeChipText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textTitle
    },
    activeChipX: {
      color: colors.textMuted,
      fontSize: 12
    },

    monthLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 0.7,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginTop: 12,
      marginBottom: 8
    },

    card: {
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 9
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 8
    },
    courseName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
      marginRight: 8
    },
    date: {
      fontSize: 11.5,
      color: colors.textMuted,
      fontWeight: '700'
    },
    cardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    avatars: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    overflowChip: {
      marginLeft: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border
    },
    overflowChipText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textMuted
    },
    metaRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    tag: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border
    },
    tagText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textTitle
    },
    score: {
      fontSize: 16,
      fontWeight: '800',
      minWidth: 30,
      textAlign: 'right',
      color: colors.textTitle
    },
    scoreOver: {
      color: colors.accent
    },
    scoreUnder: {
      color: colors.primary
    },

    loading: {
      paddingTop: 40,
      alignItems: 'center'
    },
    empty: {
      alignItems: 'center',
      paddingTop: 40,
      paddingHorizontal: 16,
      gap: 10
    },
    emptyIcon: {
      fontSize: 38,
      opacity: 0.5
    },
    emptyTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center'
    },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 270
    },
    cta: {
      marginTop: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary
    },
    ctaText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13
    }
  });
}
