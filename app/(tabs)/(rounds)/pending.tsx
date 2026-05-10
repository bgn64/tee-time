/**
 * Pending confirmations drilldown.
 *
 * Pushed when the Rounds-tab amber drawer-link is tapped. Lists every round
 * where the current user has a `pending` participant row. Each row has
 * inline Confirm / Deny buttons; the row body taps through to the full
 * round detail (which also shows a confirmation banner above the scorecard).
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function getDate(round: Round): string {
  return round.completedAt ?? round.startedAt;
}

export default function PendingRoundsScreen() {
  const { colors } = useTheme();
  const { pendingRoundsForMe, confirmParticipation, denyParticipation } = useGolfRound();
  const { profileCache } = useSocial();
  const { account } = useAccount();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Rounds', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Pending confirmations</Text>
        <Text style={styles.subtitle}>
          Friends have said you played these rounds. Confirm to add to your history.
        </Text>

        {pendingRoundsForMe.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyBody}>No rounds awaiting your confirmation.</Text>
          </View>
        ) : (
          pendingRoundsForMe.map((round) => {
            const ownerProfile = round.ownerUserId ? profileCache[round.ownerUserId] : undefined;
            const ownerName = ownerProfile?.displayName ?? 'A friend';
            const ownerInitial = ownerName[0]?.toUpperCase() ?? '?';
            const ownerColor = ownerProfile?.avatarColor ?? colors.primary;
            return (
              <View key={round.id} style={styles.row}>
                <Pressable
                  style={styles.rowTop}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/(rounds)/[id]',
                      params: { id: round.id },
                    })
                  }>
                  <View style={[styles.avatar, { backgroundColor: ownerColor }]}>
                    <Text style={styles.avatarText}>{ownerInitial}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {round.course.name} · {formatDate(getDate(round))}
                    </Text>
                    <Text style={styles.rowSubtext}>{ownerName} says you played</Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
                <View style={styles.rowActions}>
                  <Pressable
                    style={[styles.btn, styles.btnDanger]}
                    onPress={() => denyParticipation(round.id)}>
                    <Text style={styles.btnDangerText}>Deny</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => confirmParticipation(round.id)}>
                    <Text style={styles.btnPrimaryText}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textTitle, marginBottom: 6 },
    subtitle: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: 14 },
    row: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 11,
      marginBottom: 8,
      gap: 8,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 13, fontWeight: '700', color: colors.textTitle },
    rowSubtext: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
    chev: { fontSize: 16, color: colors.textMuted, opacity: 0.5 },
    rowActions: { flexDirection: 'row', gap: 6 },
    btn: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
    btnDanger: {
      flex: 1,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: '#f5cccc',
    },
    btnDangerText: { color: '#d54848', fontWeight: '800', fontSize: 12 },
    btnPrimary: { flex: 2, backgroundColor: colors.primary },
    btnPrimaryText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
    emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 6 },
    emptyIcon: { fontSize: 36, opacity: 0.7 },
    emptyTitle: { fontSize: 14, fontWeight: '800', color: colors.textTitle },
    emptyBody: { fontSize: 12, color: colors.textMuted, textAlign: 'center', maxWidth: 240 },
  });
}
