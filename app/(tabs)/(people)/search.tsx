/**
 * Friend search by @handle.
 *
 * Two entry points share this screen:
 *   1. Source-rooted — launched from a roster row's "Connect to a friend"
 *      CTA. The header keeps the source roster entry's name visible so the
 *      user remembers what they're linking. `sourcePlayerId` is forwarded
 *      to the confirm screen, which forwards it to `sendFriendRequest`,
 *      which the RPC uses to link that exact roster Player to the new
 *      friend's userId on accept.
 *   2. Sourceless — launched from the Friends segment "+ Find friends"
 *      CTA. No source param. On accept, a fresh roster Player is created
 *      from the directory entry rather than linking an existing row.
 *
 * Search calls `useSocial().searchHandle(q)` which queries the `profiles`
 * table for a case-insensitive prefix match on `handle`. Results stream
 * back as the user types (debounced lightly). Empty query renders an
 * informational empty-state — we don't surface "people you might know"
 * suggestions until we have signal for that (mutual friends, etc.).
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { ProfileSummary } from '@/types/social';

const DEBOUNCE_MS = 200;

export default function FriendSearchScreen() {
  const { colors } = useTheme();
  const { sourcePlayerId } = useLocalSearchParams<{ sourcePlayerId?: string }>();
  const { searchHandle, friends, outgoingRequests } = useSocial();
  const { getPlayer } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<ProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);

  const sourcePlayer = sourcePlayerId ? getPlayer(sourcePlayerId) : undefined;

  useScreenHeader({
    left: { kind: 'back', label: sourcePlayer?.nickname ?? 'People', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const friendsSet = useMemo(() => new Set(friends), [friends]);
  const pendingTargets = useMemo(
    () => new Set(outgoingRequests.filter((r) => r.status === 'pending').map((r) => r.toUserId)),
    [outgoingRequests]
  );

  // Debounced server-side search. Empty query -> empty results.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const matches = await searchHandle(trimmed);
      if (cancelled) return;
      setResults(matches);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchHandle]);

  const visible = useMemo(
    () =>
      // Only filter out people you're already friends with or have a
      // pending request to. A roster Player having `userId` set doesn't
      // imply a friendship — it can be stale state from a previous
      // friendship that was removed. Search needs to surface them again
      // so the user can re-send a request.
      results.filter(
        (d) => !friendsSet.has(d.userId) && !pendingTargets.has(d.userId)
      ),
    [results, friendsSet, pendingTargets]
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Find a friend</Text>
        {sourcePlayer ? (
          <Text style={styles.subtitle}>
            Sending a friend request from{' '}
            <Text style={styles.subtitleEm}>{sourcePlayer.nickname}</Text>'s entry. Their account
            will auto-link on acceptance. Search by{' '}
            <Text style={styles.codeChip}>@handle</Text>.
          </Text>
        ) : (
          <Text style={styles.subtitle}>
            Search by <Text style={styles.codeChip}>@handle</Text>. Once they accept, we'll add
            them to your roster.
          </Text>
        )}

        <View style={styles.searchField}>
          <Text style={styles.searchAt}>@</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={(t) => setQuery(t.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            autoFocus
            maxLength={20}
            placeholder="search by handle"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {query.trim() ? (
          <>
            <Text style={styles.resultsHead}>RESULTS</Text>
            {searching ? (
              <Text style={styles.empty}>Searching…</Text>
            ) : visible.length === 0 ? (
              <Text style={styles.empty}>
                No matches. Double-check the handle spelling — or maybe they don't have an account
                yet.
              </Text>
            ) : (
              visible.map((entry) => (
                <Pressable
                  key={entry.userId}
                  style={styles.resultRow}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/(people)/confirm-request',
                      params: {
                        targetUserId: entry.userId,
                        sourcePlayerId: sourcePlayerId,
                      },
                    })
                  }>
                  <View style={[styles.resultAvatar, { backgroundColor: entry.avatarColor }]}>
                    <Text style={styles.resultAvatarText}>
                      {entry.displayName[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {entry.displayName}
                    </Text>
                    <Text style={styles.resultHandle}>@{entry.handle}</Text>
                  </View>
                  <Text style={styles.resultChev}>›</Text>
                </Pressable>
              ))
            )}
          </>
        ) : (
          <Text style={styles.empty}>Start typing a handle to find someone.</Text>
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
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 14,
    },
    subtitleEm: {
      fontWeight: '800',
      color: colors.textTitle,
    },
    codeChip: {
      fontFamily: 'SpaceMono',
      fontSize: 12,
      color: colors.primaryDark,
      backgroundColor: colors.cardBg,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 3,
    },
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginBottom: 18,
    },
    searchAt: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textMuted,
      marginRight: 4,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textTitle,
      padding: 0,
    },
    resultsHead: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textMuted,
      marginBottom: 8,
    },
    empty: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      paddingVertical: 12,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 6,
    },
    resultAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultAvatarText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13,
    },
    resultInfo: {
      flex: 1,
      minWidth: 0,
    },
    resultName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    resultHandle: {
      fontSize: 11,
      color: colors.primaryDark,
      fontWeight: '600',
      marginTop: 1,
    },
    resultChev: {
      fontSize: 18,
      color: colors.textMuted,
      opacity: 0.5,
    },
  });
}
