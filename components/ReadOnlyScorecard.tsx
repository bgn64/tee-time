/**
 * Read-only scorecard grid (holes × scorers). Used by:
 *   - app/(tabs)/(rounds)/[id].tsx for completed-round history
 *   - app/(tabs)/(score)/scorecard.tsx for the in-progress locked round
 *
 * Layout: Front 9 section + Back 9 section, each with hole numbers, par
 * row, and per-scorer rows (strokes per hole) plus an OUT / IN total per
 * scorer. A final TOTAL row shows aggregate strokes and relative-to-par
 * per scorer.
 *
 * Stroke rounds: scorers are players resolved live via
 * `resolveParticipantIdentity` (profileCache / account / roster fallback).
 * Unlinked entries snapshot their name/color on the participant row.
 *
 * Scramble rounds: scorers are teams (taken directly from round.teams).
 *
 * Edit overlay (v7):
 *   - editableScorerIds — score cells become tappable; calls `onCellPress`.
 *   The (editingScorerId, editingHoleNumber) cell renders with a dashed
 *   outline.
 */

import { Fragment, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveParticipantIdentity } from '@/lib/participantIdentity';
import { formatScore } from '@/lib/scoring';
import { useAccount } from '@/state/AccountContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Hole, Round, RoundScore } from '@/types/golf';

type Scorer = { id: string; name: string; color: string };

type Props = {
  round: Round;
  editableScorerIds?: Set<string>;
  /** When set, the (editingScorerId, editingHoleNumber) cell renders with a dashed outline. */
  editingScorerId?: string;
  editingHoleNumber?: number;
  onCellPress?: (scorerId: string, holeNumber: number) => void;
};

export function ReadOnlyScorecard({
  round,
  editableScorerIds,
  editingScorerId,
  editingHoleNumber,
  onCellPress,
}: Props) {
  const { colors } = useTheme();
  const { allPlayers } = usePlayers();
  const { account } = useAccount();
  const { profileCache } = useSocial();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isScramble = round.scoringRule === 'scramble';

  const scorers: Scorer[] = useMemo(() => {
    if (isScramble && round.teams) {
      return round.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
    }
    return (round.participants ?? []).map((p) => {
      const identity = resolveParticipantIdentity(p, {
        account,
        profileCache,
        allPlayers,
      });
      const isMe = !!account?.userId && p.linkedUserId === account.userId;
      return {
        id: p.participantKey,
        name: isMe ? 'You' : identity.displayName,
        color: identity.color ?? colors.primary,
      };
    });
  }, [round, isScramble, account, profileCache, allPlayers, colors.primary]);

  const front9 = useMemo(
    () => round.course.holes.filter((h) => h.number <= 9),
    [round.course.holes]
  );
  const back9 = useMemo(
    () => round.course.holes.filter((h) => h.number > 9),
    [round.course.holes]
  );

  return (
    <View>
      <NineSection
        styles={styles}
        holes={front9}
        scorers={scorers}
        scores={round.scores}
        totalLabel="OUT"
        editableScorerIds={editableScorerIds}
        editingScorerId={editingScorerId}
        editingHoleNumber={editingHoleNumber}
        onCellPress={onCellPress}
      />
      {back9.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <NineSection
            styles={styles}
            holes={back9}
            scorers={scorers}
            scores={round.scores}
            totalLabel="IN"
            editableScorerIds={editableScorerIds}
            editingScorerId={editingScorerId}
            editingHoleNumber={editingHoleNumber}
            onCellPress={onCellPress}
          />
        </View>
      )}
      <View style={{ marginTop: 14 }}>
        <FinalTotals
          styles={styles}
          allHoles={round.course.holes}
          scorers={scorers}
          scores={round.scores}
        />
      </View>
    </View>
  );
}

type SectionProps = {
  styles: ReturnType<typeof makeStyles>;
  holes: Hole[];
  scorers: Scorer[];
  scores: RoundScore[];
  totalLabel: string;
  editableScorerIds?: Set<string>;
  editingScorerId?: string;
  editingHoleNumber?: number;
  onCellPress?: (scorerId: string, holeNumber: number) => void;
};

function NineSection({
  styles,
  holes,
  scorers,
  scores,
  totalLabel,
  editableScorerIds,
  editingScorerId,
  editingHoleNumber,
  onCellPress,
}: SectionProps) {
  const parTotal = holes.reduce((t, h) => t + h.par, 0);

  return (
    <View style={styles.section}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.cellName, styles.headText]}>Hole</Text>
        {holes.map((h) => (
          <Text key={h.number} style={[styles.cellNum, styles.headText]}>
            {h.number}
          </Text>
        ))}
        <Text style={[styles.cellTotal, styles.headText]}>{totalLabel}</Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.cellName, styles.parText]}>Par</Text>
        {holes.map((h) => (
          <Text key={h.number} style={[styles.cellNum, styles.parText]}>
            {h.par}
          </Text>
        ))}
        <Text style={[styles.cellTotal, styles.parText]}>{parTotal}</Text>
      </View>

      {scorers.map((scorer) => {
        const isEditable = !!editableScorerIds?.has(scorer.id);
        let nineRel = 0;
        let holesScored = 0;
        const cells = holes.map((h) => {
          const score = scores.find(
            (s) => s.scorerId === scorer.id && s.holeNumber === h.number
          );
          if (!score) return { strokes: null as number | null, rel: null as number | null };
          const rel = score.strokes - h.par;
          nineRel += rel;
          holesScored++;
          return { strokes: score.strokes, rel };
        });

        const hasAnyScore = holesScored > 0;
        const sectionTotalText = hasAnyScore
          ? holesScored === holes.length
            ? formatScore(nineRel)
            : `${formatScore(nineRel)}*`
          : '—';

        return (
          <View key={scorer.id} style={styles.row}>
            <View style={styles.cellName}>
              <Text
                style={{ color: scorer.color, fontSize: 11, fontWeight: '700' }}
                numberOfLines={1}>
                {scorer.name}
              </Text>
            </View>
            {cells.map((c, i) => {
              const isThisCellEditing =
                editingScorerId === scorer.id && editingHoleNumber === holes[i].number;
              const cellContent = (
                <Text
                  style={[
                    styles.cellNum,
                    c.rel !== null && c.rel > 0 && styles.cellOver,
                    c.rel !== null && c.rel < 0 && styles.cellUnder,
                    c.strokes === null && styles.cellEmpty,
                  ]}>
                  {c.rel !== null ? formatScore(c.rel) : '—'}
                </Text>
              );

              if (isEditable && onCellPress) {
                return (
                  <Pressable
                    key={holes[i].number}
                    onPress={() => onCellPress(scorer.id, holes[i].number)}
                    style={[styles.editableCell, isThisCellEditing && styles.editingCell]}>
                    {cellContent}
                  </Pressable>
                );
              }
              return <Fragment key={holes[i].number}>{cellContent}</Fragment>;
            })}
            <Text
              style={[
                styles.cellTotal,
                hasAnyScore && nineRel > 0 && styles.cellOver,
                hasAnyScore && nineRel < 0 && styles.cellUnder,
              ]}>
              {sectionTotalText}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

type FinalProps = {
  styles: ReturnType<typeof makeStyles>;
  allHoles: Hole[];
  scorers: Scorer[];
  scores: RoundScore[];
};

function FinalTotals({ styles, allHoles, scorers, scores }: FinalProps) {
  const parTotal = allHoles.reduce((t, h) => t + h.par, 0);

  return (
    <View style={styles.section}>
      <View style={[styles.row, styles.totalHead]}>
        <Text style={styles.totalHeadText}>FINAL · Par {parTotal}</Text>
      </View>
      {scorers.map((scorer) => {
        let totalRel = 0;
        let holesScored = 0;
        for (const h of allHoles) {
          const s = scores.find(
            (sc) => sc.scorerId === scorer.id && sc.holeNumber === h.number
          );
          if (s) {
            totalRel += s.strokes - h.par;
            holesScored++;
          }
        }
        const hasAnyScore = holesScored > 0;
        const status = !hasAnyScore
          ? 'No scores yet'
          : holesScored === allHoles.length
          ? formatScore(totalRel)
          : `${formatScore(totalRel)} · ${holesScored}/${allHoles.length}`;
        return (
          <View key={scorer.id} style={styles.totalRow}>
            <View style={[styles.scorerSwatch, { backgroundColor: scorer.color }]} />
            <Text style={styles.totalName}>{scorer.name}</Text>
            <Text
              style={[
                styles.totalScore,
                hasAnyScore && totalRel > 0 && styles.cellOver,
                hasAnyScore && totalRel < 0 && styles.cellUnder,
              ]}>
              {status}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    section: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      padding: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headRow: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
    },
    cellName: {
      width: 54,
      flexDirection: 'row',
      alignItems: 'center',
    },
    editableCell: {
      flex: 1,
      backgroundColor: 'rgba(124,179,66,0.12)',
      borderRadius: 4,
    },
    editingCell: {
      backgroundColor: 'rgba(124,179,66,0.40)',
      borderWidth: 1.5,
      borderColor: colors.primaryDark,
      borderStyle: 'dashed',
      borderRadius: 4,
    },
    cellNum: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      color: colors.textBody,
    },
    cellEmpty: {
      color: colors.textMuted,
      opacity: 0.55,
    },
    cellOver: {
      color: colors.accent,
      fontWeight: '800',
    },
    cellUnder: {
      color: colors.primaryDark,
      fontWeight: '800',
    },
    cellTotal: {
      width: 36,
      textAlign: 'right',
      fontSize: 11,
      fontWeight: '800',
      color: colors.textTitle,
    },
    headText: {
      color: colors.textMuted,
      fontWeight: '800',
      fontSize: 10,
      letterSpacing: 0.4,
    },
    parText: {
      color: colors.textMuted,
      fontWeight: '700',
    },
    totalHead: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      paddingVertical: 5,
    },
    totalHeadText: {
      flex: 1,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: colors.textMuted,
    },
    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    scorerSwatch: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    totalName: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: colors.textTitle,
    },
    totalScore: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
  });
}
