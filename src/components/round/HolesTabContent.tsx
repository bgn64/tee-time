/**
 * HolesTabContent — read-only per-hole viewer that composes the
 * Phase 3 primitives for both surfaces:
 *
 *   [ScorerPickPill]  [HoleStepperCombo]
 *   [HoleContextSummary]
 *   [body slot]   ← Phase 4 mounts `<AchievementTagRow read>` here.
 *                   In Phase 3 this is a "Coming soon" stand-in.
 *
 * Focused-scorer state is owned locally. The feed initialises it to
 * the round owner; the scoring surface uses this read-only component
 * only in non-editing mode (Phase 1 + Phase 2 surfaces), so the
 * default behaviour is fine.
 *
 * Focused-hole state is local too in Phase 3. Phase 4+ may extract
 * it into a context if achievement-tag edits should share the focus
 * with adjacent surfaces.
 *
 * Stroke / scramble derivation mirrors `SummaryTabContent` +
 * `HorizontalScorecard` — one entry per participant (stroke) or one
 * per team (scramble).
 */

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AchievementTagRow } from './AchievementTagRow';
import { HoleContextSummary } from './HoleContextSummary';
import { ScorerPickPill, type ScorerPickOption } from './ScorerPickPill';
import { HoleStepperCombo } from '@/components/scoring/HoleStepperCombo';
import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { findTee } from '@/library/golf/courseHelpers';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useRoundAchievementTags } from '@/library/golf/useRoundAchievementTags';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
};

export function HolesTabContent({ round }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resolver = useParticipantResolver(round.playerIds ?? []);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  const options: ScorerPickOption[] = useMemo(() => {
    if (isScramble) {
      return (round.teams ?? []).map((team) => {
        const members: AvatarMember[] = team.playerIds.map((pid) => {
          const r = resolver.get(pid);
          return {
            id: pid,
            name: r?.displayName || 'Player',
            color: r?.avatarColor || colors.primary,
          };
        });
        const label = members
          .map((m) => m.name.split(' ')[0])
          .slice(0, 2)
          .join(' & ');
        return { id: team.id, label, members };
      });
    }
    return (round.playerIds ?? []).map((pid) => {
      const r = resolver.get(pid);
      const name = r?.displayName || 'Player';
      const color = r?.avatarColor || colors.primary;
      return {
        id: pid,
        label: name.split(' ')[0],
        members: [{ id: pid, name, color }],
      };
    });
  }, [
    isScramble,
    round.teams,
    round.playerIds,
    resolver,
    colors.primary,
  ]);

  // Default focus to the round owner's scorer, or the first option
  // if the owner isn't a scorer (live shared rounds where the round
  // creator is just a viewer).
  const initialScorerId = useMemo(() => {
    if (options.length === 0) return null;
    const ownerKey = `user:${round.ownerUserId ?? ''}`;
    if (isScramble) {
      const ownerTeam = (round.teams ?? []).find((t) =>
        t.playerIds.includes(ownerKey)
      );
      if (ownerTeam) return ownerTeam.id;
    } else if (round.playerIds.includes(ownerKey)) {
      return ownerKey;
    }
    return options[0].id;
  }, [options, round.ownerUserId, round.playerIds, round.teams, isScramble]);

  const [focusedScorerId, setFocusedScorerId] = useState<string | null>(
    initialScorerId
  );
  const [focusedHole, setFocusedHole] = useState<number>(
    round.currentHoleNumber || round.course.holes[0]?.number || 1
  );

  const focused = options.find((o) => o.id === focusedScorerId) ?? options[0];

  // Resolve focused scorer's tee + hole context.
  // Hooks must run unconditionally; we guard against an empty focused
  // scorer inside the memo bodies and at the render branch below.
  const tee = useMemo(() => {
    if (!focused) return null;
    const teamMember = isScramble
      ? round.teams?.find((t) => t.id === focused.id)?.playerIds[0]
      : focused.id;
    const teeId = round.participants.find(
      (p) => p.participantKey === teamMember
    )?.teeId;
    return findTee(round.course, teeId) ?? null;
  }, [focused, isScramble, round.teams, round.participants, round.course]);

  const hole = round.course.holes.find((h) => h.number === focusedHole);

  // Per-hole strokes for the focused scorer (drives the jump-sheet
  // mini-grid).
  const strokesByHole = useMemo(() => {
    const m = new Map<number, number>();
    if (!focused) return m;
    for (const s of round.scores) {
      if (s.scorerId === focused.id) m.set(s.holeNumber, s.strokes);
    }
    return m;
  }, [round.scores, focused]);
  const focusedStrokes = strokesByHole.get(focusedHole) ?? null;

  // Read-only achievement tags for the focused (scorer, hole). The
  // hook returns getTags() so we don't re-derive on every render.
  const { getTags } = useRoundAchievementTags(round.id);
  const tappedTags = focused ? getTags(focused.id, focusedHole) : [];

  if (!focused) return null;

  return (
    <View>
      <View style={styles.controls}>
        <ScorerPickPill
          selectedId={focused.id}
          options={options}
          onChange={setFocusedScorerId}
        />
        <HoleStepperCombo
          current={focusedHole}
          range={round.holeRange}
          allHoles={round.course.holes}
          strokesByHole={strokesByHole}
          onPickHole={setFocusedHole}
        />
      </View>

      {hole ? (
        <HoleContextSummary
          members={focused.members}
          name={focused.label}
          tee={tee}
          allTees={round.course.tees ?? []}
          hole={hole}
          strokes={focusedStrokes}
        />
      ) : null}

      <View style={styles.body}>
        <AchievementTagRow
          mode="read"
          tags={tappedTags}
          isScramble={isScramble}
        />
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 10,
    },
    body: {
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 18,
    },
  });
}
