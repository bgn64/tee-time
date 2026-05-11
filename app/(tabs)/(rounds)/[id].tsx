/**
 * Round detail screen.
 *
 * The canonical view for inspecting and editing a completed round. Renders
 * a full hole-by-hole scorecard (Front 9 + Back 9 + Final).
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
 * Editing UX:
 *   - "Edit" chip in the header's right slot toggles edit mode on/off.
 *   - In read mode the scorecard is pure read-only — no green tints.
 *   - In edit mode, every editable row's cells get a green tint and become
 *     tappable. Tap a cell to select it (dashed outline). The inline
 *     keypad below the scorecard becomes active; quick-pick chips or the
 *     stepper change the selected cell's score. Tap another tinted cell
 *     (any row, any hole) to switch instantly. Tap "Done" to leave edit.
 *
 * Bottom of screen: "Remove this round from my history" — leaveRound RPC.
 * The round persists for any remaining confirmed participants.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { InlineScoreKeypad } from '@/components/InlineScoreKeypad';
import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { buildRoundTitle } from '@/lib/scoring';
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

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<{ scorerId: string; holeNumber: number } | null>(null);

  const round = completedRounds.find((r) => r.id === id);

  // Resolve "can the viewer edit anything?" so the Edit chip only renders
  // when there's something to edit. Computed before the header registration.
  const myUserId = account?.userId;
  const myParticipant = round?.participants?.find((p) => p.linkedUserId === myUserId);
  const isOwner = !!(round && myUserId && round.ownerUserId === myUserId);
  const canEditAnything = useMemo(() => {
    if (!round) return false;
    if (round.scoringRule === 'scramble') {
      // Owner pre-any-confirm OR any confirmed team member I'm on.
      for (const team of round.teams ?? []) {
        const members = (round.participants ?? []).filter((p) => p.teamId === team.id);
        const anyConfirmed = members.some(
          (m) => m.linkedUserId && m.status === 'confirmed'
        );
        const meConfirmed = members.some(
          (m) => m.linkedUserId === myUserId && m.status === 'confirmed'
        );
        if (meConfirmed || (!anyConfirmed && isOwner)) return true;
      }
      return false;
    }
    if (myParticipant?.status === 'confirmed') return true;
    if (isOwner) {
      for (const p of round.participants ?? []) {
        if (!p.linkedUserId) return true;
        if (p.linkedUserId && p.status === 'pending') return true;
      }
    }
    return false;
  }, [round, isOwner, myParticipant, myUserId]);

  useScreenHeader({
    left: { kind: 'back', label: 'Rounds', onPress: () => router.back() },
    right: canEditAnything
      ? {
          kind: 'action',
          label: editMode ? 'Done' : 'Edit',
          active: editMode,
          onPress: () => {
            setEditMode((m) => !m);
            setSelected(null);
          },
        }
      : { kind: 'profile' },
  });

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
  const iAmPending = myParticipant?.status === 'pending';

  // ---- Stroke edit-rights / blur sets ----
  // Default empty sets, populated below per scoring rule.
  let editableScorerIds = new Set<string>();
  let blurredScorerIds = new Set<string>();
  let pendingScorerIds = new Set<string>();
  // Ordered editable-scorer list, used to drive the keypad's player nav.
  const editableScorerList: Array<{ id: string; name: string; color: string }> = [];

  if (!isScramble) {
    for (const p of round.participants ?? []) {
      if (p.status === 'pending') {
        pendingScorerIds.add(p.participantKey);
        const viewerIsTheParticipant =
          myParticipant && myParticipant.participantKey === p.participantKey;
        if (!viewerIsTheParticipant && !isOwner) {
          blurredScorerIds.add(p.participantKey);
        }
      }
    }
    if (myParticipant && myParticipant.status === 'confirmed') {
      editableScorerIds.add(myParticipant.participantKey);
    }
    if (isOwner) {
      for (const p of round.participants ?? []) {
        if (!p.linkedUserId) editableScorerIds.add(p.participantKey);
        if (p.linkedUserId && p.status === 'pending') {
          editableScorerIds.add(p.participantKey);
        }
      }
    }
    for (const p of round.participants ?? []) {
      if (editableScorerIds.has(p.participantKey)) {
        editableScorerList.push({
          id: p.participantKey,
          name: p.displayName,
          color: p.displayColor ?? colors.primary,
        });
      }
    }
  } else {
    const teams = round.teams ?? [];
    for (const team of teams) {
      const members = (round.participants ?? []).filter((p) => p.teamId === team.id);
      const anyConfirmed = members.some((m) => m.status === 'confirmed' && m.linkedUserId);
      const iAmConfirmedMember = members.some(
        (m) => m.status === 'confirmed' && m.linkedUserId === myUserId
      );
      if (!anyConfirmed) {
        pendingScorerIds.add(team.id);
        if (!isOwner) {
          blurredScorerIds.add(team.id);
        }
      }
      if (iAmConfirmedMember || (!anyConfirmed && isOwner)) {
        editableScorerIds.add(team.id);
        editableScorerList.push({ id: team.id, name: team.name, color: team.color });
      }
    }
    for (const p of round.participants ?? []) {
      if (p.status === 'pending') pendingScorerIds.add(p.participantKey);
    }
  }

  const maxHole = round.course.holes.length;

  // Seed selection when entering edit mode; clear it on exit.
  useEffect(() => {
    if (editMode) {
      if (!selected && editableScorerList.length > 0) {
        setSelected({ scorerId: editableScorerList[0].id, holeNumber: 1 });
      }
    } else if (selected) {
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  const handleCellPress = useCallback(
    (scorerId: string, holeNumber: number) => {
      if (!editMode) return;
      setSelected({ scorerId, holeNumber });
    },
    [editMode]
  );

  const selectedHole = selected
    ? round.course.holes.find((h) => h.number === selected.holeNumber)
    : undefined;
  const selectedScore = selected
    ? round.scores.find(
        (s) => s.scorerId === selected.scorerId && s.holeNumber === selected.holeNumber
      )
    : undefined;
  const selectedScorerIdx = selected
    ? editableScorerList.findIndex((s) => s.id === selected.scorerId)
    : -1;
  const selectedScorer = selectedScorerIdx >= 0 ? editableScorerList[selectedScorerIdx] : null;

  const handleHoleChange = useCallback(
    (next: number) => {
      if (!selected) return;
      setSelected({ scorerId: selected.scorerId, holeNumber: next });
    },
    [selected]
  );

  const handleScorerChange = useCallback(
    (delta: 1 | -1) => {
      if (!selected || editableScorerList.length === 0) return;
      const idx = editableScorerList.findIndex((s) => s.id === selected.scorerId);
      if (idx < 0) return;
      const nextIdx =
        (idx + delta + editableScorerList.length) % editableScorerList.length;
      setSelected({
        scorerId: editableScorerList[nextIdx].id,
        holeNumber: selected.holeNumber,
      });
    },
    [selected, editableScorerList]
  );

  const handleKeypadChange = useCallback(
    async (strokes: number) => {
      if (!selected) return;
      const result = await editHoleScore(
        round.id,
        selected.scorerId,
        selected.holeNumber,
        strokes
      );
      if (!result.ok) {
        Alert.alert('Edit failed', result.error);
      }
    },
    [selected, editHoleScore, round.id]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{round.course.name}</Text>
      <Text style={styles.subtitle}>
        {isScramble ? 'Scramble' : 'Stroke'} · {buildRoundTitle(round, myUserId)} ·{' '}
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
        editableScorerIds={editMode ? editableScorerIds : undefined}
        blurredScorerIds={blurredScorerIds}
        pendingScorerIds={pendingScorerIds}
        editingScorerId={editMode ? selected?.scorerId : undefined}
        editingHoleNumber={editMode ? selected?.holeNumber : undefined}
        onCellPress={editMode ? handleCellPress : undefined}
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

      {editMode && (
        <InlineScoreKeypad
          par={selectedHole?.par ?? 4}
          strokes={selectedScore?.strokes ?? null}
          holeNumber={selected?.holeNumber ?? 1}
          maxHole={maxHole}
          onHoleChange={handleHoleChange}
          scorer={
            selectedScorer
              ? {
                  name: selectedScorer.name,
                  color: selectedScorer.color,
                  index: selectedScorerIdx,
                  total: editableScorerList.length,
                }
              : undefined
          }
          onScorerChange={editableScorerList.length > 1 ? handleScorerChange : undefined}
          onChange={handleKeypadChange}
        />
      )}

      {!editMode && ((myParticipant && myParticipant.status === 'confirmed') || isOwner) ? (
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
