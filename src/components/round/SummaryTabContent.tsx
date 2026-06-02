/**
 * SummaryTabContent — Phase 1 baseline for the Summary tab body.
 *
 * Renders one row per scorer with avatar(s), name, tee chip, and the
 * scorer's hero score on the right (current ±total + `THRU N`
 * sub-label while in-flight). No accordion, no aggregate tiles yet —
 * Phase 5 grows this with inline per-scorer aggregate metrics
 * (Fairways / GIR / OB / Sand) and scramble team-contribution rows.
 *
 * Derivations match `ScorerStack`: stroke rounds get one row per
 * participant; scramble rounds get one row per team. Display
 * identity comes from `useParticipantResolver`; running totals come
 * from `playerProgress` so the row matches every other surface.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { teeSwatch } from '@/components/scoring/TeePickerSheet';
import { findTee } from '@/library/golf/courseHelpers';
import { formatScore, playerProgress } from '@/library/golf/scoring';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round, Tee } from '@/types/golf';

type Props = {
  round: Round;
};

type Scorer = {
  id: string;
  name: string;
  members: AvatarMember[];
};

export function SummaryTabContent({ round }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const resolver = useParticipantResolver(round.playerIds ?? []);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const isCompleted = !!round.completedAt;

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
    <View style={styles.list}>
      {scorers.map((s, i) => {
        const progress = playerProgress(round, s.id);
        const hasScores = progress.thru > 0;
        const scoreText = hasScores ? formatScore(progress.rel) : 'E';
        const tone: 'over' | 'under' | 'even' = !hasScores
          ? 'even'
          : progress.rel > 0
            ? 'over'
            : progress.rel < 0
              ? 'under'
              : 'even';
        const thruText =
          !isCompleted && hasScores
            ? `THRU ${progress.thru}`
            : isCompleted
              ? 'FINAL'
              : undefined;

        const tee = resolveScorerTee(s.id);
        const teeColor = tee ? teeSwatch(tee) : undefined;
        const teeLabel = tee
          ? tee.totalYardage
            ? `${tee.name} · ${tee.totalYardage.toLocaleString()}`
            : tee.name
          : null;

        return (
          <View key={s.id} style={i > 0 ? styles.rowSep : styles.row}>
            {i > 0 ? <View style={styles.row} /> : null}
            <View style={styles.rowInner}>
              <TeamAvatarCluster members={s.members} size="lg" />
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {s.name}
                </Text>
                {tee && teeColor && teeLabel ? (
                  <View style={styles.teeChip}>
                    <View
                      style={[styles.teeDot, { backgroundColor: teeColor }]}
                    />
                    <Text style={styles.teeLabel} numberOfLines={1}>
                      {teeLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.scoreCol}>
                <Text
                  style={[
                    styles.scoreText,
                    tone === 'over' ? styles.scoreOver : null,
                    tone === 'even' ? styles.scoreEven : null,
                  ]}>
                  {scoreText}
                </Text>
                {thruText ? (
                  <Text style={styles.thruText}>{thruText}</Text>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 8,
    },
    row: {
      paddingVertical: 10,
    },
    rowSep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      paddingTop: 10,
      paddingBottom: 10,
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    teeChip: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    teeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    teeLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.textTitle,
    },
    scoreCol: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    scoreText: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.primaryDark,
      lineHeight: 30,
    },
    scoreEven: {
      color: colors.textBody,
    },
    scoreOver: {
      color: colors.textTitle,
    },
    thruText: {
      marginTop: 3,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
  });
}
