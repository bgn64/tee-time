/**
 * Confirm friend request screen.
 *
 * Reached from the search results. On send, dispatches `sendFriendRequest`
 * and pops back to the Friends list.
 *
 * Loads the target profile from `useProfileCache().profileCache`. The cache
 * is populated by the search step that preceded us; if that cache miss
 * happens (e.g., deep-linked route), we fall back to a fresh fetch.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFriends } from '@/state/FriendsContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useProfileCache } from '@/state/ProfileCacheContext';
import { supabase } from '@/state/supabaseClient';
import { useTheme } from '@/state/ThemeContext';
import { ProfileSummary } from '@/types/social';

export default function ConfirmRequestScreen() {
  const { colors } = useTheme();
  const { targetUserId } = useLocalSearchParams<{ targetUserId: string }>();
  const { sendFriendRequest } = useFriends();
  const { profileCache } = useProfileCache();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [target, setTarget] = useState<ProfileSummary | null>(
    targetUserId ? profileCache[targetUserId] ?? null : null
  );
  const [submitting, setSubmitting] = useState(false);

  useScreenHeader({
    left: { kind: 'back', label: 'Search', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  useEffect(() => {
    if (!targetUserId || target) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setTarget({
          userId: data.user_id,
          handle: data.handle,
          displayName: data.display_name,
          avatarColor: data.avatar_color,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetUserId, target]);

  if (!target) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundIcon}>👤</Text>
        <Text style={styles.notFoundTitle}>Loading…</Text>
        <Text style={styles.notFoundBody}>If this stalls, search again.</Text>
      </View>
    );
  }

  const initial = target.displayName[0]?.toUpperCase() ?? '?';

  const onSend = async () => {
    setSubmitting(true);
    await sendFriendRequest(target);
    setSubmitting(false);
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
        </View>
      </View>

      <Text style={styles.body}>
        We'll send <Text style={styles.bodyEm}>@{target.handle}</Text> a friend request. Once they
        accept, they'll show up in your Friends list and you'll be able to score rounds together.
      </Text>

      <Pressable
        style={[styles.primaryBtn, submitting && { opacity: 0.5 }]}
        onPress={onSend}
        disabled={submitting}>
        <Text style={styles.primaryBtnText}>{submitting ? 'Sending…' : 'Send friend request'}</Text>
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
        <Text style={styles.secondaryBtnText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 18, fontWeight: '800', color: colors.textTitle, marginBottom: 14 },
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
    avatarText: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
    previewInfo: { flex: 1, minWidth: 0 },
    previewName: { fontSize: 16, fontWeight: '800', color: colors.textTitle },
    previewHandle: { fontSize: 12, color: colors.primaryDark, fontWeight: '700', marginTop: 1 },
    body: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 18 },
    bodyEm: { fontWeight: '800', color: colors.primaryDark },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginBottom: 8,
    },
    primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
    secondaryBtn: { paddingVertical: 13, alignItems: 'center' },
    secondaryBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
    notFound: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: 32,
      gap: 8,
    },
    notFoundIcon: { fontSize: 36, opacity: 0.5, marginBottom: 4 },
    notFoundTitle: { fontSize: 16, fontWeight: '800', color: colors.textTitle },
    notFoundBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  });
}
