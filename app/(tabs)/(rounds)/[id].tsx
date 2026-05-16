/**
 * Round detail screen.
 *
 * The canonical view for inspecting and editing a completed Round. A Round
 * belongs solely to its scorer — only the owner can edit any scoreline or
 * delete the Round.
 *
 * Read-only view:
 *   - Tappable cells do nothing. Just shows the grid + final-totals box.
 *   - Owner sees a "Delete this round" button at the bottom.
 *
 * Edit mode (owner only):
 *   - "Edit" chip in the header toggles edit mode on. The screen flips to
 *     the same unified layout used by live scoring: HoleNavBar + per-
 *     scorer ScoreEntryRow + the same scorecard grid (now showing a
 *     current-hole highlight, with cell taps jumping to that hole) +
 *     final-totals box that updates live as edits are made.
 *   - "Save" chip flushes the pending edits via `commitScoreEdits`.
 *   - Tapping back exits without saving (matches today's behavior).
 *
 * Scramble rounds use team rows in both the entry block (edit mode) and
 * the grid. The standalone "Team Rosters" section that used to live
 * below the grid was dropped under the unified-scoring pass — the
 * final-totals box conveys the same info.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HoleNavBar } from '@/components/HoleNavBar';
import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { ScoreEntryRow } from '@/components/ScoreEntryRow';
import type { AvatarMember } from '@/components/TeamAvatarCluster';
import { TeePickerSheet } from '@/components/TeePickerSheet';
import { OPENGOLF_ATTRIBUTION } from '@/lib/attribution';
import { confirm, showAlert } from '@/lib/dialog';
import { resolveParticipantIdentity } from '@/lib/participantIdentity';
import { buildRoundTitle } from '@/lib/scoring';
import { buildTeamMembers } from '@/lib/scorerMembers';
import {
  buildNameSegments,
  flattenSegments,
  type NameSegment,
} from '@/lib/scorerNames';
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
  const { allPlayers, defaultPlayerId } = usePlayers();
  const { profileCache } = useSocial();
  const { completedRounds, deleteRound, commitScoreEdits } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [editMode, setEditMode] = useState(false);
  // The current hole shown in the entry block (only relevant in edit mode).
  const [editingHole, setEditingHole] = useState<number>(1);
  // Buffer of in-flight edits while in edit mode. Mirrored to a ref
  // because the header slot's onPress captures handleSave from the render
  // at which edit mode was entered; without the ref, the captured closure
  // sees an empty buffer no matter how many keypad presses happened since.
  const [pendingEdits, setPendingEdits] = useState<Record<string, number>>({});
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;
  // Parallel buffer of in-flight tee edits keyed by scorerId
  // (participantKey for stroke / teamId for scramble). `undefined` value
  // explicitly clears a previously-set tee on Save.
  const [pendingTeeEdits, setPendingTeeEdits] = useState<
    Record<string, string | undefined>
  >({});
  const pendingTeeEditsRef = useRef(pendingTeeEdits);
  pendingTeeEditsRef.current = pendingTeeEdits;
  // Scorer whose tee pill was tapped; null when the sheet is closed.
  const [teeEditTarget, setTeeEditTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(saving);
  savingRef.current = saving;

  const round = completedRounds.find((r) => r.id === id);
  const roundRef = useRef(round);
  roundRef.current = round;

  const myUserId = account?.userId;
  const isOwner = !!(round && myUserId && round.ownerUserId === myUserId);
  const isScramble = round?.scoringRule === 'scramble';

  // Per-scorer list used by the edit-mode entry rows. For scramble that's
  // the set of teams; for stroke it's resolved-identity participant rows
  // (live name/color from profileCache when available).
  type EditScorer = {
    id: string;
    name: string;
    color: string;
    members: AvatarMember[];
    nameSegments: NameSegment[];
  };
  const editableScorerList = useMemo<EditScorer[]>(() => {
    if (!round || !isOwner) return [];
    const nameDeps = {
      account,
      profileCache,
      allPlayers,
      defaultPlayerId,
    };
    if (isScramble && round.teams) {
      return round.teams.map((team) => {
        const teamParticipants = (round.participants ?? []).filter(
          (p) => p.teamId === team.id
        );
        const nameSegments = buildNameSegments(teamParticipants, nameDeps);
        return {
          id: team.id,
          name: flattenSegments(nameSegments) || team.name,
          color: team.color,
          members: buildTeamMembers(round, team.id, {
            account,
            profileCache,
            allPlayers,
            fallbackColor: colors.primary,
          }),
          nameSegments,
        };
      });
    }
    return (round.participants ?? []).map((p) => {
      const identity = resolveParticipantIdentity(p, {
        account,
        profileCache,
        allPlayers,
      });
      const color = identity.color ?? colors.primary;
      const nameSegments = buildNameSegments([p], nameDeps);
      const name = flattenSegments(nameSegments) || identity.displayName;
      return {
        id: p.participantKey,
        name,
        color,
        members: [{ id: p.participantKey, name, color }],
        nameSegments,
      };
    });
  }, [round, isOwner, isScramble, account, profileCache, allPlayers, defaultPlayerId, colors.primary]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    const currentRound = roundRef.current;
    const buffer = pendingEditsRef.current;
    const teeBuffer = pendingTeeEditsRef.current;
    const entries: Array<[string, number]> = Object.entries(buffer);
    const teeEntries: Array<[string, string | undefined]> = Object.entries(teeBuffer);
    if (entries.length === 0 && teeEntries.length === 0) {
      setEditMode(false);
      setPendingEdits({});
      setPendingTeeEdits({});
      return;
    }
    if (!currentRound) {
      setEditMode(false);
      setPendingEdits({});
      setPendingTeeEdits({});
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

    // Filter tee edits down to those that would actually change the
    // current round (scramble = compare against the team's most-common
    // teeId; stroke = compare against the matching participant's teeId).
    const isScrambleRound = currentRound.scoringRule === 'scramble';
    const dirtyTees = teeEntries
      .filter(([scorerId, teeId]) => {
        if (isScrambleRound) {
          const teamParticipants = (currentRound.participants ?? []).filter(
            (p) => p.teamId === scorerId
          );
          if (teamParticipants.length === 0) return false;
          return teamParticipants.some((p) => p.teeId !== teeId);
        }
        const p = (currentRound.participants ?? []).find(
          (q) => q.participantKey === scorerId
        );
        if (!p) return false;
        return p.teeId !== teeId;
      })
      .map(([scorerId, teeId]) => ({ scorerId, teeId }));

    const result = await commitScoreEdits(currentRound.id, dirty, dirtyTees);
    setSaving(false);
    if (!result.ok) {
      showAlert('Save failed', result.error);
      return;
    }
    setEditMode(false);
    setPendingEdits({});
    setPendingTeeEdits({});
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
              setEditingHole(1);
              setPendingEdits({});
              setPendingTeeEdits({});
            }
          },
        }
      : { kind: 'profile' },
  });

  // displayRound merges pendingEdits into round.scores AND pendingTeeEdits
  // into round.participants[].teeId so the scorecard, entry rows, and
  // Final-box pill all reflect unsaved edits while in edit mode. Returns
  // undefined when round is missing so the early-return below can short-
  // circuit without unbalancing hook count.
  const displayRound = useMemo(() => {
    if (!round) return undefined;
    const hasScoreEdits = editMode && Object.keys(pendingEdits).length > 0;
    const hasTeeEdits = editMode && Object.keys(pendingTeeEdits).length > 0;
    if (!hasScoreEdits && !hasTeeEdits) return round;

    let nextScores = round.scores;
    if (hasScoreEdits) {
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
      nextScores = merged;
    }

    let nextParticipants = round.participants;
    if (hasTeeEdits && round.participants) {
      const isScrambleRound = round.scoringRule === 'scramble';
      nextParticipants = round.participants.map((p) => {
        let nextTeeId: string | undefined = p.teeId;
        let touched = false;
        for (const [scorerId, teeId] of Object.entries(pendingTeeEdits)) {
          const matches = isScrambleRound
            ? p.teamId === scorerId
            : p.participantKey === scorerId;
          if (matches) {
            nextTeeId = teeId;
            touched = true;
          }
        }
        if (!touched) return p;
        if (nextTeeId == null) {
          const { teeId: _drop, ...rest } = p;
          return rest;
        }
        return { ...p, teeId: nextTeeId };
      });
    }

    return { ...round, scores: nextScores, participants: nextParticipants };
  }, [round, editMode, pendingEdits, pendingTeeEdits]);

  const setEntryScore = useCallback(
    (scorerId: string, holeNumber: number, strokes: number) => {
      const key = `${scorerId}::${holeNumber}`;
      setPendingEdits((prev) => ({ ...prev, [key]: strokes }));
    },
    []
  );

  const handleEditTee = useCallback((scorerId: string) => {
    setTeeEditTarget(scorerId);
  }, []);

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
  const currentEditHole = editMode
    ? round.course.holes.find((h) => h.number === editingHole)
    : undefined;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {round.course.name}
        </Text>
        <View style={styles.pillRow}>
          <View style={styles.formatPill}>
            <Text style={styles.formatPillText}>
              {isScramble ? 'SCRAMBLE' : 'STROKE'}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.subtitle}>
        {buildRoundTitle(round, myUserId, (uid) => {
          if (uid === account?.userId) return account.displayName;
          const prof = profileCache[uid];
          if (prof) return prof.displayName;
          const local = allPlayers.find((p) => p.userId === uid);
          return local?.displayName ?? local?.nickname;
        })}{' '}· {formatDate(round.completedAt ?? round.startedAt)}
        {editMode ? '  ·  editing' : ''}
      </Text>

      {editMode && currentEditHole && (
        <>
          <HoleNavBar
            holeNumber={currentEditHole.number}
            par={currentEditHole.par}
            yardage={currentEditHole.yardage}
            maxHole={maxHole}
            onChange={setEditingHole}
          />
          <View style={styles.entryCard}>
            {editableScorerList.map((s, i) => {
              const score = displayRound.scores.find(
                (sc) =>
                  sc.scorerId === s.id && sc.holeNumber === currentEditHole.number
              );
              return (
                <View key={s.id} style={i > 0 ? styles.entryRowSep : undefined}>
                  <ScoreEntryRow
                    members={s.members}
                    name={isScramble ? undefined : s.name}
                    nameSegments={isScramble ? undefined : s.nameSegments}
                    onPressLinkedName={(linkId) =>
                      router.push({
                        pathname: '/(tabs)/(rounds)/player/[id]',
                        params: { id: linkId },
                      })
                    }
                    holeNumber={currentEditHole.number}
                    par={currentEditHole.par}
                    strokes={score ? score.strokes : null}
                    onChange={(strokes) =>
                      setEntryScore(s.id, currentEditHole.number, strokes)
                    }
                  />
                </View>
              );
            })}
          </View>
          <Text style={styles.gridHint}>Tap any hole to jump</Text>
        </>
      )}

      <ReadOnlyScorecard
        round={displayRound}
        currentHoleNumber={editMode ? editingHole : undefined}
        onHolePress={editMode ? setEditingHole : undefined}
        onPressLinkedName={(linkId) =>
          router.push({
            pathname: '/(tabs)/(rounds)/player/[id]',
            params: { id: linkId },
          })
        }
        onEditTee={editMode ? handleEditTee : undefined}
      />

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

      <TeePickerSheet
        visible={teeEditTarget != null}
        scorerName={
          (teeEditTarget &&
            editableScorerList.find((s) => s.id === teeEditTarget)?.name) ||
          ''
        }
        tees={round.course.tees ?? []}
        selectedTeeId={
          teeEditTarget
            ? (() => {
                if (teeEditTarget in pendingTeeEdits) {
                  return pendingTeeEdits[teeEditTarget];
                }
                if (isScramble) {
                  // Same most-common-teeId convention as ReadOnlyScorecard.
                  const counts = new Map<string, number>();
                  for (const p of round.participants ?? []) {
                    if (p.teamId === teeEditTarget && p.teeId) {
                      counts.set(p.teeId, (counts.get(p.teeId) ?? 0) + 1);
                    }
                  }
                  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
                  return sorted[0]?.[0];
                }
                return (round.participants ?? []).find(
                  (p) => p.participantKey === teeEditTarget
                )?.teeId;
              })()
            : undefined
        }
        onCancel={() => setTeeEditTarget(null)}
        onPick={(teeId) => {
          if (!teeEditTarget) return;
          const target = teeEditTarget;
          setPendingTeeEdits((prev) => ({ ...prev, [target]: teeId }));
          setTeeEditTarget(null);
        }}
      />
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 60 },
    titleBlock: {
      marginBottom: 4,
    },
    title: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.textTitle,
      lineHeight: 22,
      marginBottom: 6,
    },
    pillRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    formatPill: {
      backgroundColor: colors.chipBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    formatPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: colors.primaryDark,
    },
    subtitle: { fontSize: 11.5, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
    entryCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 12,
    },
    entryRowSep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 3,
      paddingTop: 3,
    },
    gridHint: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
      marginBottom: 6,
      marginLeft: 4,
    },
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
