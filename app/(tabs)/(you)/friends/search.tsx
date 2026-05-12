/**
 * Friend search by @handle.
 *
 * Launched from the Friends list's "+ Find friends" CTA inside the You
 * tab. Search results lead to confirm-request, which calls
 * `sendFriendRequest`. Roster entries for accepted friends are
 * auto-created on accept; local players (the entity formerly known as
 * "unlinked players") are tracked in the backend for stats continuity
 * but no longer have any merge-to-friend flow or user-facing list (see
 * plan.md, Path 3a).
 *
 * Search calls `useSocial().searchHandle(q)` which queries the `profiles`
 * table for a case-insensitive prefix match on `handle`.
 */

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useScreenHeader } from '@/state/HeaderContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { ProfileSummary } from '@/types/social';

const DEBOUNCE_MS = 200;

export default function FriendSearchScreen() {
  const { colors } = useTheme();
  const { searchHandle, friends, outgoingRequests } = useSocial();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<ProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useScreenHeader({
    left: { kind: 'back', label: 'Friends', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const friendsSet = useMemo(() => new Set(friends), [friends]);
  const pendingTargets = useMemo(
    () => new Set(outgoingRequests.filter((r) => r.status === 'pending').map((r) => r.toUserId)),
    [outgoingRequests]
  );

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
      results.filter(
        (d) => !friendsSet.has(d.userId) && !pendingTargets.has(d.userId)
      ),
    [results, friendsSet, pendingTargets]
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Find a friend</Text>
        <Text style={styles.subtitle}>
          Search by <Text style={styles.codeChip}>@handle</Text>. Once they accept, they'll show up
          in your Friends list.
        </Text>

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
                      pathname: '/(tabs)/(you)/friends/confirm-request',
                      params: { targetUserId: entry.userId },
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
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textTitle, marginBottom: 8 },
    subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 14 },
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
    searchAt: { fontSize: 16, fontWeight: '700', color: colors.textMuted, marginRight: 4 },
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
    empty: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', paddingVertical: 12 },
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
    resultAvatarText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
    resultInfo: { flex: 1, minWidth: 0 },
    resultName: { fontSize: 14, fontWeight: '700', color: colors.textTitle },
    resultHandle: { fontSize: 11, color: colors.primaryDark, fontWeight: '600', marginTop: 1 },
    resultChev: { fontSize: 18, color: colors.textMuted, opacity: 0.5 },
  });
}

