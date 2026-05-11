/**
 * Round detail screen (v7).
 *
 * The canonical view for inspecting and editing a Round. The Round belongs
 * solely to its scorer — only the owner can edit any scoreline or delete
 * the Round.
 *
 * Behavior:
 *   - Owner: header "Edit" chip toggles edit mode on every scoreline. A
 *     "Delete this round" button sits at the bottom of the screen.
 *   - Non-owner (friend-of-owner viewer): pure read-only.
 *
 * Editing UX:
 *   - "Edit" chip in the header's right slot toggles edit mode on/off.
 *   - In edit mode every scoreline's cells get a green tint and become
 *     tappable. Tap a cell to select it (dashed outline). The inline
 *     keypad below the scorecard becomes active; quick-pick chips or the
 *     stepper change the selected cell's score. Tap "Save" to flush.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { InlineScoreKeypad } from '@/components/InlineScoreKeypad';
import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { OPENGOLF_ATTRIBUTION } from '@/lib/attribution';
import { confirm, showAlert } from '@/lib/dialog';
import { resolveParticipantIdentity } from '@/lib/participantIdentity';
import { buildRoundTitle } from '@/lib/scoring';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function RoundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { account } = useAccount();
  const { allPlayers } = usePlayers();
  const { profileCache } = useSocial();
  const { completedRounds, deleteRound, commitScoreEdits } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<{ scorerId: string; holeNumber: number } | null>(null);
  // Buffer of in-flight edits while in edit mode. Mirrored to a ref
  // because the header slot's onPress captures handleSave from the render
  // at which edit mode was entered; without the ref, the captured closure
  // sees an empty buffer no matter how many keypad presses happened since.
  const [pendingEdits, setPendingEdits] = useState<Record<string, number>>({});
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(saving);
  savingRef.current = saving;

  const round = completedRounds.find((r) => r.id === id);
  const roundRef = useRef(round);
  roundRef.current = round;

  const myUserId = account?.userId;
  const isOwner = !!(round && myUserId && round.ownerUserId === myUserId);
  const isScramble = round?.scoringRule === 'scramble';

  // Owner-only edit-rights: the full list of scorer IDs is editable. For
  // scramble that's the set of team IDs; for stroke it's the set of
  // participantKeys. Computed via useMemo so the useEffect below (which
  // reads it on editMode transitions) sees a stable value.
  const editableScorerList = useMemo<Array<{ id: string; name: string; color: string }>>(() => {
    if (!round || !isOwner) return [];
    if (isScramble && round.teams) {
      return round.teams.map((team) => ({
        id: team.id,
        name: team.name,
        color: team.color,
      }));
    }
    return (round.participants ?? []).map((p) => {
      const identity = resolveParticipantIdentity(p, {
        account,
        profileCache,
        allPlayers,
      });
      return {
        id: p.participantKey,
        name: identity.displayName,
        color: identity.color ?? colors.primary,
      };
    });
  }, [round, isOwner, isScramble, account, profileCache, allPlayers, colors.primary]);

  const editableScorerIds = useMemo(
    () => new Set(editableScorerList.map((s) => s.id)),
    [editableScorerList]
  );

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    const currentRound = roundRef.current;
    const buffer = pendingEditsRef.current;
    const entries: Array<[string, number]> = Object.entries(buffer);
    if (entries.length === 0 || !currentRound) {
      setEditMode(false);
      setSelected(null);
      setPendingEdits({});
      return;
    }
    setSaving(true);
    const dirty = entries
      .filter(([key, strokes]) => {
        const [scorerId, holeStr] = key.split('::');
        const holeNumber = Number(holeStr);
        const existing = currentRound.scores.find(
          (s) => s.scorerId === scorerId && s.holeNumber === holeNumber
        );
        return !existing || existing.strokes !== strokes;
      })
      .map(([key, strokes]) => {
        const [scorerId, holeStr] = key.split('::');
        return { scorerId, holeNumber: Number(holeStr), strokes };
      });

    const result = await commitScoreEdits(currentRound.id, dirty);
    setSaving(false);
    if (!result.ok) {
      showAlert('Save failed', result.error);
      return;
    }
    setEditMode(false);
    setSelected(null);
    setPendingEdits({});
  }, [commitScoreEdits]);

  useScreenHeader({
    left: { kind: 'back', label: 'Rounds', onPress: () => router.back() },
    right: isOwner
      ? {
          kind: 'action',
          label: editMode ? (saving ? 'Saving…' : 'Save') : 'Edit',
          active: editMode,
          onPress: () => {
            if (editMode) {
              handleSave();
            } else {
              setEditMode(true);
              setPendingEdits({});
            }
          },
        }
      : { kind: 'profile' },
  });

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

  // displayRound merges pendingEdits into round.scores so the scorecard
  // and selectedScore lookup both reflect unsaved edits while in edit
  // mode. Returns undefined when round is missing so the early-return
  // below can short-circuit without unbalancing hook count.
  const displayRound = useMemo(() => {
    if (!round) return undefined;
    if (!editMode || Object.keys(pendingEdits).length === 0) return round;
    const overrideMap = new Map<string, number>();
    for (const [key, strokes] of Object.entries(pendingEdits)) overrideMap.set(key, strokes);
    const merged = round.scores.map((s) => {
      const key = `${s.scorerId}::${s.holeNumber}`;
      if (overrideMap.has(key)) return { ...s, strokes: overrideMap.get(key)! };
      return s;
    });
    for (const [key, strokes] of overrideMap.entries()) {
      const [scorerId, holeStr] = key.split('::');
      const holeNumber = Number(holeStr);
      if (!merged.find((s) => s.scorerId === scorerId && s.holeNumber === holeNumber)) {
        merged.push({ scorerId, holeNumber, strokes });
      }
    }
    return { ...round, scores: merged };
  }, [round, editMode, pendingEdits]);

  const handleHoleChange = useCallback(
    (next: number) => {
      if (!selected) return;
      setSelected({ scorerId: selected.scorerId, holeNumber: next });
    },
    [selected]
  );

  const handleScorerSelect = useCallback((sid: string) => {
    setSelected((prev) =>
      prev ? { scorerId: sid, holeNumber: prev.holeNumber } : { scorerId: sid, holeNumber: 1 }
    );
  }, []);

  const handleKeypadChange = useCallback(
    (strokes: number) => {
      if (!selected) return;
      const key = `${selected.scorerId}::${selected.holeNumber}`;
      setPendingEdits((prev) => ({ ...prev, [key]: strokes }));
    },
    [selected]
  );

  // -- Early return AFTER every hook so React's hook-order invariant
  // holds even when the round disappears mid-screen (e.g., during a
  // delete navigation).
  if (!round || !displayRound) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundIcon}>⛳</Text>
        <Text style={styles.notFoundTitle}>Round not found</Text>
        <Text style={styles.notFoundBody}>It may have been deleted or the link is stale.</Text>
      </View>
    );
  }

  const maxHole = round.course.holes.length;
  const selectedHole = selected
    ? round.course.holes.find((h) => h.number === selected.holeNumber)
    : undefined;
  const selectedScore = selected
    ? displayRound.scores.find(
        (s) => s.scorerId === selected.scorerId && s.holeNumber === selected.holeNumber
      )
    : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{round.course.name}</Text>
      <Text style={styles.subtitle}>
        {isScramble ? 'Scramble' : 'Stroke'} ·{' '}
        {buildRoundTitle(round, myUserId, (uid) => {
          if (uid === account?.userId) return account.displayName;
          const prof = profileCache[uid];
          if (prof) return prof.displayName;
          const local = allPlayers.find((p) => p.userId === uid);
          return local?.displayName ?? local?.nickname;
        })}{' '}· {formatDate(round.completedAt ?? round.startedAt)}
      </Text>

      <ReadOnlyScorecard
        round={displayRound}
        editableScorerIds={editMode ? editableScorerIds : undefined}
        editingScorerId={editMode ? selected?.scorerId : undefined}
        editingHoleNumber={editMode ? selected?.holeNumber : undefined}
        onCellPress={editMode ? handleCellPress : undefined}
      />

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
                  {members
                    .map((m) =>
                      resolveParticipantIdentity(m, { account, profileCache, allPlayers })
                        .displayName
                    )
                    .join(' · ')}
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
          scorers={editableScorerList}
          selectedScorerId={selected?.scorerId}
          onScorerSelect={handleScorerSelect}
          onChange={handleKeypadChange}
        />
      )}

      {!editMode && isOwner ? (
        <Pressable
          style={styles.dangerBtn}
          onPress={async () => {
            const ok = await confirm({
              title: 'Delete this round?',
              message:
                "The round will be permanently deleted from your history and from every friend's feed.",
              confirmLabel: 'Delete',
              destructive: true,
            });
            if (!ok) return;
            // Pop first so the screen is unmounted before the round
            // disappears from local state. The deleteRound call is
            // fire-and-forget; the optimistic local removal happens
            // synchronously inside it.
            router.back();
            void deleteRound(round.id);
          }}>
          <Text style={styles.dangerBtnText}>Delete this round</Text>
        </Pressable>
      ) : null}

      {round.course.source === 'opengolf' && (
        <Text style={styles.attribution}>{OPENGOLF_ATTRIBUTION}</Text>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 60 },
    title: { fontSize: 18, fontWeight: '800', color: colors.textTitle },
    subtitle: { fontSize: 11.5, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
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
    dangerBtn: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: '#f5cccc',
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
    },
    dangerBtnText: { color: '#d54848', fontWeight: '800', fontSize: 12 },
    attribution: {
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 16,
      fontStyle: 'italic',
    },
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
