/**
 * ScorerStack — iterates a round's scorers and renders one
 * <ScorerRow /> per scorer. Owns the stroke-vs-scramble
 * derivation (one row per team in scramble, one per participant
 * in stroke), identity resolution via `useParticipantResolver`,
 * and the per-scorer running / final score computation.
 *
 * Used by every detail-view state: feed-view (① ④),
 * scoring (②), and the future edit-completed flow (③).
 * Behavior is identical across surfaces — only `isEditing`
 * toggles whether score buttons + interactive tee pills appear.
 *
 * Score text rules:
 *   - Round in-progress: `runningText` = current ±total, with a
 *     `THRU N` sub-label when the scorer has at least one entered
 *     hole.
 *   - Round completed: `runningText` = final ±total (no THRU).
 *   - No scores yet (e.g. a brand-new round): `runningText = 'E'`,
 *     tone = 'even', no THRU.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScorerRow } from './ScorerRow';
import { findTee } from '@/library/golf/courseHelpers';
import { formatScore, playerProgress } from '@/library/golf/scoring';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import type { AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import type { Round, Tee } from '@/types/golf';

type Props = {
  round: Round;
  /** True when score-entry affordances should be visible. */
  isEditing: boolean;
  /** Required when isEditing; the hole the score buttons target. */
  currentHoleNumber?: number;
  /** Fires when a quick-pick / custom score is committed. Required in editing. */
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
  /** Fires when the tee pill is tapped. Required in editing. */
  onPressTeeForScorer?: (scorerId: string) => void;
};

type Scorer = {
  id: string;
  name: string;
  members: AvatarMember[];
};

export function ScorerStack({
  round,
  isEditing,
  currentHoleNumber,
  onChangeScore,
  onPressTeeForScorer,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Resolve participant display info via PowerSync local (profiles +
  // custom_players) with a Supabase fallback for unfriended
  // ex-friends. Calling unconditionally keeps the hook order stable
  // even on rounds with empty playerIds.
  const resolver = useParticipantResolver(round.playerIds ?? []);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const isCompleted = !!round.completedAt;

  // Stroke vs scramble: build one Scorer per team in scramble, one
  // per participant in stroke. Mirror the derivation that lived in
  // scoring.tsx + ReadOnlyScorecard so the visual is consistent.
  const scorers: Scorer[] = useMemo(() => {
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
        return { id: team.id, name: team.name, members };
      });
    }
    return (round.playerIds ?? []).map((pid) => {
      const r = resolver.get(pid);
      const name = r?.displayName || 'Player';
      const color = r?.avatarColor || colors.primary;
      return {
        id: pid,
        name,
        members: [{ id: pid, name, color }],
      };
    });
  }, [isScramble, round.teams, round.playerIds, resolver, colors.primary]);

  // Resolve each scorer's tee for the row's tee pill. In stroke each
  // scorer is one participant; in scramble all team members share a
  // tee so we read from the first member's participant entry.
  function resolveScorerTee(scorerId: string): Tee | undefined {
    if (isScramble) {
      const team = round.teams?.find((t) => t.id === scorerId);
      const firstMember = team?.playerIds[0];
      if (!firstMember) return undefined;
      const p = round.participants.find(
        (q) => q.participantKey === firstMember
      );
      return findTee(round.course, p?.teeId);
    }
    const p = round.participants.find((q) => q.participantKey === scorerId);
    return findTee(round.course, p?.teeId);
  }

  return (
    <View style={styles.card}>
      {scorers.map((s, i) => {
        const progress = playerProgress(round, s.id);
        const hasScores = progress.thru > 0;

        // Score text: final when completed, running when in-progress.
        // Running mode shows THRU sub-label when the scorer has any
        // entered hole; completed mode never shows THRU.
        const runningText = hasScores ? formatScore(progress.rel) : 'E';
        const tone: 'over' | 'under' | 'even' = !hasScores
          ? 'even'
          : progress.rel > 0
            ? 'over'
            : progress.rel < 0
              ? 'under'
              : 'even';
        const thruText =
          !isCompleted && hasScores ? `THRU ${progress.thru}` : undefined;

        // Current-hole strokes — only meaningful for editing (the
        // score chips highlight the active value). Ignored when
        // viewing.
        const currentHoleScore =
          isEditing && currentHoleNumber != null
            ? round.scores.find(
                (sc) =>
                  sc.scorerId === s.id && sc.holeNumber === currentHoleNumber
              )
            : undefined;
        const currentHole = round.course.holes.find(
          (h) => h.number === currentHoleNumber
        );

        return (
          <View key={s.id} style={i > 0 ? styles.sep : undefined}>
            <ScorerRow
              members={s.members}
              name={s.name}
              runningText={runningText}
              runningTone={tone}
              thruText={thruText}
              tee={resolveScorerTee(s.id)}
              onPressTee={
                isEditing && onPressTeeForScorer
                  ? () => onPressTeeForScorer(s.id)
                  : undefined
              }
              isEditing={isEditing}
              holeNumber={currentHoleNumber ?? 0}
              par={currentHole?.par ?? 0}
              strokes={currentHoleScore ? currentHoleScore.strokes : null}
              onChange={
                isEditing && onChangeScore && currentHoleNumber != null
                  ? (strokes) => onChangeScore(s.id, currentHoleNumber, strokes)
                  : undefined
              }
            />
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
    },
    sep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 3,
      paddingTop: 3,
    },
  });
}
