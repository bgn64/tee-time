/**
 * Read-only scorecard grid (holes × scorers). Used by:
 *   - app/(tabs)/(rounds)/[id].tsx for completed-round history
 *   - app/(tabs)/(score)/scorecard.tsx for the in-progress locked round
 *
 * Layout: Front 9 section + Back 9 section, each with hole numbers, par row,
 * and per-scorer rows (strokes per hole) plus an OUT / IN total per scorer.
 * A final TOTAL row shows aggregate strokes and relative-to-par per scorer.
 *
 * Stroke rounds: scorers are players (resolved via PlayerContext).
 * Scramble rounds: scorers are teams (taken directly from round.teams).
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Hole, Round, RoundScore } from '@/types/golf';

type Scorer = { id: string; name: string; color: string };

type Props = {
  round: Round;
};

function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

export function ReadOnlyScorecard({ round }: Props) {
  const { colors } = useTheme();
  const { getPlayer } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isScramble = round.scoringRule === 'scramble';

  const scorers: Scorer[] = useMemo(() => {
    if (isScramble && round.teams) {
      return round.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
    }
    return round.playerIds
      .map((pid) => {
        const p = getPlayer(pid);
        return p ? { id: p.id, name: p.name, color: p.color || colors.primary } : null;
      })
      .filter((s): s is Scorer => s !== null);
  }, [round, isScramble, getPlayer, colors.primary]);

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
      />
      {back9.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <NineSection
            styles={styles}
            holes={back9}
            scorers={scorers}
            scores={round.scores}
            totalLabel="IN"
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
};

function NineSection({ styles, holes, scorers, scores, totalLabel }: SectionProps) {
  const parTotal = holes.reduce((t, h) => t + h.par, 0);

  return (
    <View style={styles.section}>
      {/* Hole numbers row */}
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.cellName, styles.headText]}>Hole</Text>
        {holes.map((h) => (
          <Text key={h.number} style={[styles.cellNum, styles.headText]}>
            {h.number}
          </Text>
        ))}
        <Text style={[styles.cellTotal, styles.headText]}>{totalLabel}</Text>
      </View>

      {/* Par row */}
      <View style={styles.row}>
        <Text style={[styles.cellName, styles.parText]}>Par</Text>
        {holes.map((h) => (
          <Text key={h.number} style={[styles.cellNum, styles.parText]}>
            {h.par}
          </Text>
        ))}
        <Text style={[styles.cellTotal, styles.parText]}>{parTotal}</Text>
      </View>

      {/* Per-scorer rows */}
      {scorers.map((scorer) => {
        let nineRel = 0;
        let nineStrokes = 0;
        let holesScored = 0;
        const cells = holes.map((h) => {
          const score = scores.find(
            (s) => s.scorerId === scorer.id && s.holeNumber === h.number
          );
          if (!score) return { strokes: null as number | null, rel: null as number | null };
          const rel = score.strokes - h.par;
          nineRel += rel;
          nineStrokes += score.strokes;
          holesScored++;
          return { strokes: score.strokes, rel };
        });

        const hasAnyScore = holesScored > 0;
        const sectionTotalText = hasAnyScore
          ? holesScored === holes.length
            ? `${nineStrokes}`
            : `${nineStrokes}*`
          : '—';

        return (
          <View key={scorer.id} style={styles.row}>
            <Text style={[styles.cellName, { color: scorer.color }]} numberOfLines={1}>
              {scorer.name}
            </Text>
            {cells.map((c, i) => (
              <Text
                key={holes[i].number}
                style={[
                  styles.cellNum,
                  c.rel !== null && c.rel > 0 && styles.cellOver,
                  c.rel !== null && c.rel < 0 && styles.cellUnder,
                  c.strokes === null && styles.cellEmpty,
                ]}>
                {c.strokes ?? '—'}
              </Text>
            ))}
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
        let totalStrokes = 0;
        let holesScored = 0;
        for (const h of allHoles) {
          const s = scores.find(
            (sc) => sc.scorerId === scorer.id && sc.holeNumber === h.number
          );
          if (s) {
            totalRel += s.strokes - h.par;
            totalStrokes += s.strokes;
            holesScored++;
          }
        }
        const hasAnyScore = holesScored > 0;
        const status = !hasAnyScore
          ? 'No scores yet'
          : holesScored === allHoles.length
          ? `${totalStrokes} (${formatScore(totalRel)})`
          : `${totalStrokes} (${formatScore(totalRel)}) · ${holesScored}/${allHoles.length}`;
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
      fontSize: 11,
      fontWeight: '700',
      color: colors.textBody,
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
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    totalName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    totalScore: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textBody,
    },
  });
}
