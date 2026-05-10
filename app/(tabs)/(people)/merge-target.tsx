/**
 * Merge target picker.
 *
 * Pushed from the Unlinked-player detail's "Merge into a friend" action.
 * Shows the user's friend list; tapping a friend opens an in-screen
 * confirmation modal spelling out the deny-erase risk; on confirm calls
 * `mergeUnlinkedToFriend` and pops back to the People tab.
 *
 * Errors out (alert + stay on screen) if the merge would create a duplicate
 * participant on a round.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

export default function MergeTargetScreen() {
  const { unlinkedId } = useLocalSearchParams<{ unlinkedId: string }>();
  const { colors } = useTheme();
  const { allPlayers, getPlayer, mergeUnlinkedToFriend } = usePlayers();
  const { friends, profileCache } = useSocial();
  const { completedRounds } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useScreenHeader({
    left: { kind: 'back', label: 'Player', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const unlinked = unlinkedId ? getPlayer(unlinkedId) : undefined;

  const friendOptions = useMemo(() => {
    return friends
      .map((userId) => {
        const profile = profileCache[userId];
        const localRoster = allPlayers.find((p) => p.userId === userId);
        return {
          userId,
          displayName: profile?.displayName ?? localRoster?.displayName ?? 'Friend',
          handle: profile?.handle ?? localRoster?.handle ?? '',
          avatarColor: profile?.avatarColor ?? localRoster?.color,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [friends, profileCache, allPlayers]);

  const sharedRoundCount = unlinked
    ? completedRounds.filter((r) => r.playerIds.includes(unlinked.id)).length
    : 0;

  if (!unlinked) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundIcon}>👤</Text>
        <Text style={styles.notFoundTitle}>Player not found</Text>
      </View>
    );
  }

  const target = selectedUserId ? friendOptions.find((f) => f.userId === selectedUserId) : null;

  const onConfirmMerge = async () => {
    if (!target) return;
    setSubmitting(true);
    const result = await mergeUnlinkedToFriend(unlinked.id, target.userId);
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert('Merge failed', result.error);
      setSelectedUserId(null);
      return;
    }
    // Pop merge-target + the unlinked detail under it, landing back on the
    // People tab.
    router.back();
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Merge "{unlinked.nickname}" into…</Text>
        <Text style={styles.subtitle}>
          Pick a friend. We'll send them confirmation requests for any past rounds.
        </Text>

        {friendOptions.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No friends to merge into</Text>
            <Text style={styles.emptyBody}>
              You need to friend the person first. Find them by @handle from the People tab.
            </Text>
          </View>
        ) : (
          friendOptions.map((f) => (
            <Pressable
              key={f.userId}
              onPress={() => setSelectedUserId(f.userId)}
              style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: f.avatarColor || colors.primary }]}>
                <Text style={styles.avatarText}>{f.displayName[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {f.displayName}
                </Text>
                {f.handle ? <Text style={styles.rowHandle}>@{f.handle}</Text> : null}
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Confirmation modal — implemented inline so it sits over the picker. */}
      {target && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              Merge "{unlinked.nickname}" into {target.displayName}?
            </Text>
            <Text style={styles.modalBody}>
              This will request {target.displayName}'s confirmation for{' '}
              <Text style={styles.modalEm}>
                {sharedRoundCount} past {sharedRoundCount === 1 ? 'round' : 'rounds'}
              </Text>
              . If they deny any round, those scores will be removed from your history.{' '}
              <Text style={styles.modalEm}>This can't be undone.</Text>
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.ghostBtn]}
                onPress={() => setSelectedUserId(null)}
                disabled={submitting}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.primaryBtn, submitting && { opacity: 0.5 }]}
                onPress={onConfirmMerge}
                disabled={submitting}>
                <Text style={styles.primaryBtnText}>{submitting ? 'Merging…' : 'Merge'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 18, fontWeight: '800', color: colors.textTitle, marginBottom: 6 },
    subtitle: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: 14 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 11,
      marginBottom: 7,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    rowBody: { flex: 1, minWidth: 0 },
    rowName: { fontSize: 14, fontWeight: '700', color: colors.textTitle },
    rowHandle: { fontSize: 11, color: colors.primaryDark, fontWeight: '600', marginTop: 1 },
    chev: { fontSize: 18, fontWeight: '700', color: colors.textMuted, opacity: 0.5 },
    emptyWrap: { alignItems: 'center', paddingTop: 40, gap: 6 },
    emptyIcon: { fontSize: 30, opacity: 0.5 },
    emptyTitle: { fontSize: 13, fontWeight: '800', color: colors.textTitle },
    emptyBody: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 17,
      maxWidth: 260,
    },
    modalOverlay: {
      position: 'absolute',
      inset: 0 as any,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 20,
    },
    modalTitle: { fontSize: 15, fontWeight: '800', color: colors.textTitle, marginBottom: 8 },
    modalBody: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 16 },
    modalEm: { fontWeight: '800', color: colors.textTitle },
    modalActions: { flexDirection: 'row', gap: 10 },
    modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    ghostBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    ghostBtnText: { color: colors.textMuted, fontWeight: '800', fontSize: 13 },
    primaryBtn: { backgroundColor: colors.primary },
    primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
    notFound: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 8,
      backgroundColor: colors.background,
    },
    notFoundIcon: { fontSize: 36, opacity: 0.5, marginBottom: 4 },
    notFoundTitle: { fontSize: 16, fontWeight: '800', color: colors.textTitle },
  });
}
