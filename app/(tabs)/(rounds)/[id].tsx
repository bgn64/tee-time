/**
 * Round detail screen.
 *
 * The canonical view for inspecting and editing a completed round. Renders
 * a full hole-by-hole scorecard (Front 9 + Back 9 + Final). Tapping any of
 * the viewer's editable cells opens a HoleEditSheet.
 *
 * Behavior by viewer role:
 *   - Pending participant: a confirmation banner sits above the scorecard.
 *     The viewer's row is shown but not yet editable. Confirm/Deny actions.
 *   - Confirmed participant: the viewer's own row is editable per-hole.
 *     Other participants' rows are read-only.
 *   - Owner of the round (also confirmed): can edit own row + any unlinked-
 *     player rows. Linked-confirmed rows belong to that linked user.
 *   - Observer (round visible because of friend-of-participant): pending
 *     rows are blurred; everything else is read-only.
 *
 * Bottom of screen: "Remove this round from my history" — leaveRound RPC.
 * The round persists for any remaining confirmed participants.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HoleEditSheet } from '@/components/HoleEditSheet';
import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';
import { Round, RoundParticipant } from '@/types/golf';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function buildTitle(round: Round, myUserId?: string): string {
  const isScramble = round.scoringRule === 'scramble';
  if (isScramble) {
    if (!round.teams || round.teams.length === 0) return 'Round';
    return round.teams.map((t) => t.name).join(' vs ');
  }
  // Stroke: list confirmed linked participants by displayName, replacing
  // own name with "you" when the current viewer is one of them.
  const confirmed =
    round.participants
      ?.filter((p) => p.linkedUserId && p.status === 'confirmed')
      .map((p) => (p.linkedUserId === myUserId ? 'you' : p.displayName)) ?? [];
  if (confirmed.length === 0) return 'Round';
  if (confirmed.length === 1) return `${confirmed[0]} played`;
  if (confirmed.length === 2) return `${confirmed[0]} and ${confirmed[1]} played`;
  return `${confirmed.slice(0, -1).join(', ')}, and ${confirmed[confirmed.length - 1]} played`;
}

export default function RoundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { account } = useAccount();
  const {
    completedRounds,
    confirmParticipation,
    denyParticipation,
    leaveRound,
    editHoleScore,
  } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [editing, setEditing] = useState<{ scorerId: string; holeNumber: number } | null>(null);

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
        <Text style={styles.notFoundBody}>It may have been abandoned or the link is stale.</Text>
      </View>
    );
  }

  const isScramble = round.scoringRule === 'scramble';
  const myUserId = account?.userId;
  const myParticipant = round.participants?.find((p) => p.linkedUserId === myUserId);
  const isOwner = myUserId && round.ownerUserId === myUserId;
  const iAmPending = myParticipant?.status === 'pending';

  // ---- Stroke edit-rights / blur sets ----
  // Default empty sets, populated below per scoring rule.
  let editableScorerIds = new Set<string>();
  let blurredScorerIds = new Set<string>();
  let pendingScorerIds = new Set<string>();

  if (!isScramble) {
    for (const p of round.participants ?? []) {
      if (p.status === 'pending') {
        pendingScorerIds.add(p.participantKey);
        // Blur only for observers. The pending participant sees their own
        // row un-blurred (they're learning what's been claimed), and the
        // round owner sees it un-blurred so they can review/edit before
        // the friend confirms.
        const viewerIsTheParticipant =
          myParticipant && myParticipant.participantKey === p.participantKey;
        if (!viewerIsTheParticipant && !isOwner) {
          blurredScorerIds.add(p.participantKey);
        }
      }
    }
    // Editable rows for the viewer.
    if (myParticipant && myParticipant.status === 'confirmed') {
      editableScorerIds.add(myParticipant.participantKey);
    }
    // Owner can also edit any unlinked rows on their round.
    if (isOwner) {
      for (const p of round.participants ?? []) {
        if (!p.linkedUserId) editableScorerIds.add(p.participantKey);
        // And edit pending linked rows (not yet confirmed).
        if (p.linkedUserId && p.status === 'pending') {
          editableScorerIds.add(p.participantKey);
        }
      }
    }
  } else {
    // Scramble: per-team. A team is blurred for observers iff no team member
    // is confirmed. A team is editable by the viewer iff (viewer is a
    // confirmed member) OR (viewer is owner AND no team member is confirmed).
    const teams = round.teams ?? [];
    for (const team of teams) {
      const members = (round.participants ?? []).filter((p) => p.teamId === team.id);
      const anyConfirmed = members.some((m) => m.status === 'confirmed' && m.linkedUserId);
      const iAmConfirmedMember = members.some(
        (m) => m.status === 'confirmed' && m.linkedUserId === myUserId
      );
      if (!anyConfirmed) {
        // Team's score is the work of an as-yet-unconfirmed group; mark
        // pending (so name shows ?) and blur for everyone except the owner.
        pendingScorerIds.add(team.id);
        if (!isOwner) {
          blurredScorerIds.add(team.id);
        }
      }
      if (iAmConfirmedMember || (!anyConfirmed && isOwner)) {
        editableScorerIds.add(team.id);
      }
    }
    // For the team-roster card (rendered separately below) we still want to
    // surface ? chips next to individual pending members.
    for (const p of round.participants ?? []) {
      if (p.status === 'pending') pendingScorerIds.add(p.participantKey);
    }
  }

  const handleCellPress = (scorerId: string, holeNumber: number) => {
    setEditing({ scorerId, holeNumber });
  };

  const handleSaveScore = async (strokes: number) => {
    if (!editing) return;
    const result = await editHoleScore(round.id, editing.scorerId, editing.holeNumber, strokes);
    setEditing(null);
    if (!result.ok) {
      Alert.alert('Edit failed', result.error);
    }
  };

  const editingHole = editing
    ? round.course.holes.find((h) => h.number === editing.holeNumber)
    : undefined;
  const editingScore = editing
    ? round.scores.find(
        (s) => s.scorerId === editing.scorerId && s.holeNumber === editing.holeNumber
      )
    : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{round.course.name}</Text>
      <Text style={styles.subtitle}>
        {isScramble ? 'Scramble' : 'Stroke'} · {buildTitle(round, myUserId)} ·{' '}
        {formatDate(round.completedAt ?? round.startedAt)}
      </Text>

      {iAmPending && myParticipant && (
        <View style={styles.banner}>
          <Text style={styles.bannerHead}>⏳  AWAITING YOUR CONFIRMATION</Text>
          <Text style={styles.bannerBody}>
            This round is in your pending list. Confirm to add it to your history and gain edit
            rights over your score. Deny to remove your line entirely.
          </Text>
          <View style={styles.bannerActions}>
            <Pressable
              style={[styles.bannerBtn, styles.bannerBtnGhost]}
              onPress={() => {
                denyParticipation(round.id);
                router.back();
              }}>
              <Text style={styles.bannerBtnGhostText}>Deny</Text>
            </Pressable>
            <Pressable
              style={[styles.bannerBtn, styles.bannerBtnPrimary]}
              onPress={() => confirmParticipation(round.id)}>
              <Text style={styles.bannerBtnPrimaryText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ReadOnlyScorecard
        round={round}
        editableScorerIds={editableScorerIds}
        blurredScorerIds={blurredScorerIds}
        pendingScorerIds={pendingScorerIds}
        onCellPress={handleCellPress}
      />

      {/* Scramble team rosters card. */}
      {isScramble && round.teams && (
        <View style={styles.rosterCard}>
          <Text style={styles.rosterHead}>TEAM ROSTERS</Text>
          {round.teams.map((team) => {
            const members = (round.participants ?? []).filter((p) => p.teamId === team.id);
            return (
              <View key={team.id} style={styles.rosterRow}>
                <View style={[styles.teamDot, { backgroundColor: team.color }]} />
                <Text style={styles.rosterTeam}>{team.name}</Text>
                <Text style={styles.rosterMembers}>
                  {members.map(formatMember).join(' · ')}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {editableScorerIds.size > 0 && (
        <Text style={styles.hint}>
          Tap any of <Text style={styles.hintBold}>your</Text> cells to edit that hole.
        </Text>
      )}

      {(myParticipant && myParticipant.status === 'confirmed') || isOwner ? (
        <Pressable
          style={styles.dangerBtn}
          onPress={() => {
            Alert.alert(
              'Remove from your history?',
              'The round will stay alive for any remaining confirmed participants.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: async () => {
                    await leaveRound(round.id);
                    router.back();
                  },
                },
              ]
            );
          }}>
          <Text style={styles.dangerBtnText}>Remove this round from my history</Text>
        </Pressable>
      ) : null}

      <HoleEditSheet
        visible={!!editing}
        holeNumber={editing?.holeNumber ?? null}
        par={editingHole?.par ?? 4}
        initialStrokes={editingScore?.strokes ?? null}
        onCancel={() => setEditing(null)}
        onSave={handleSaveScore}
      />
    </ScrollView>
  );
}

function formatMember(p: RoundParticipant): string {
  const name = p.displayName;
  if (p.linkedUserId && p.status === 'pending') return `${name} ?`;
  return name;
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 60 },
    title: { fontSize: 18, fontWeight: '800', color: colors.textTitle },
    subtitle: { fontSize: 11.5, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
    banner: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
      borderWidth: 1,
      borderRadius: 11,
      padding: 12,
      marginBottom: 12,
    },
    bannerHead: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    bannerBody: { fontSize: 12, color: '#6b5a3a', lineHeight: 17, marginBottom: 10 },
    bannerActions: { flexDirection: 'row', gap: 8 },
    bannerBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 8,
      alignItems: 'center',
    },
    bannerBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e0d0a8' },
    bannerBtnGhostText: { color: '#7c6b4f', fontWeight: '800', fontSize: 12 },
    bannerBtnPrimary: { backgroundColor: colors.primary },
    bannerBtnPrimaryText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
    rosterCard: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 11,
      padding: 11,
      marginTop: 8,
    },
    rosterHead: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textMuted,
      marginBottom: 6,
    },
    rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    teamDot: { width: 10, height: 10, borderRadius: 5 },
    rosterTeam: { fontSize: 11.5, fontWeight: '800', color: colors.textTitle, minWidth: 50 },
    rosterMembers: { flex: 1, fontSize: 11.5, color: colors.textMuted },
    hint: {
      fontSize: 10.5,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 10,
      fontStyle: 'italic',
    },
    hintBold: { fontWeight: '800', color: colors.textBody },
    dangerBtn: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: '#f5cccc',
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
    },
    dangerBtnText: { color: '#d54848', fontWeight: '800', fontSize: 12 },
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
    notFoundBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  });
}
