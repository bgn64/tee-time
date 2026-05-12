/**
 * Read-only scorecard grid (holes × scorers). Used by:
 *   - app/(tabs)/(rounds)/[id].tsx for completed-round history + edit mode
 *   - app/(tabs)/(score)/scoring.tsx for the live in-progress round
 *
 * Layout: Front 9 section + Back 9 section, each with hole numbers, par
 * row, and per-scorer rows (strokes per hole) plus an OUT / IN total per
 * scorer. A final TOTAL row shows aggregate strokes and relative-to-par
 * per scorer.
 *
 * Stroke rounds: scorers are players resolved live via
 * `resolveParticipantIdentity` (profileCache / account / roster fallback).
 * Local entries snapshot their name/color on the participant row.
 *
 * Scramble rounds: scorers are teams (taken directly from round.teams).
 *
 * Jump-to-hole pattern (unified scoring/editing v9):
 *   - currentHoleNumber  — highlights that hole's column header.
 *   - onHolePress        — when set, every cell in the column (header,
 *                          par, scorer rows) is wrapped in a Pressable
 *                          that calls back with the hole number. Cells
 *                          themselves are not individually editable on
 *                          the grid; editing happens in the entry rows
 *                          above the grid in the scoring/edit screens.
 *   - hideFinalTotals    — drops the bottom totals section so the caller
 *                          can either omit it (live scoring) or render
 *                          its own (no current caller needs the latter,
 *                          but the flag is easy to add).
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
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
  /** Highlight the column for this hole number. */
  currentHoleNumber?: number;
  /** When set, tapping any cell in a column calls back with that hole number. */
  onHolePress?: (holeNumber: number) => void;
  /** Suppress the bottom FINAL totals section (live scoring uses this). */
  hideFinalTotals?: boolean;
};

export function ReadOnlyScorecard({
  round,
  currentHoleNumber,
  onHolePress,
  hideFinalTotals,
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
    // For completed rounds we read from `participants` (built at
    // completeCurrentRound time). For in-progress rounds that array is
    // not yet populated, so fall back to playerIds + the local roster
    // so the grid renders correctly during live scoring.
    if (round.participants && round.participants.length > 0) {
      return round.participants.map((p) => {
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
    }
    return (round.playerIds ?? []).map((pid) => {
      const local = allPlayers.find((p) => p.id === pid);
      const isMe = !!local?.userId && account?.userId === local.userId;
      return {
        id: pid,
        name: isMe
          ? 'You'
          : local?.displayName ?? local?.nickname ?? 'Player',
        color: local?.color ?? colors.primary,
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

  const hasBack9 = back9.length > 0;

  // Visible-nine state: initialize from currentHoleNumber when present
  // (so the section containing the current hole is shown first), else
  // default to front. Auto-flip when currentHoleNumber crosses into the
  // other half so the user always sees the hole they're scoring; manual
  // taps on the tabs override until the next auto-flip.
  const [visibleNine, setVisibleNine] = useState<'front' | 'back'>(
    currentHoleNumber && currentHoleNumber > 9 ? 'back' : 'front'
  );

  useEffect(() => {
    if (!hasBack9) return;
    if (currentHoleNumber == null) return;
    setVisibleNine(currentHoleNumber > 9 ? 'back' : 'front');
  }, [currentHoleNumber, hasBack9]);

  // When the round restricts to one nine only, hide the tabs and force
  // the visible section accordingly. This also keeps "tap a cell to
  // jump" working since the in-play holes are the only ones rendered.
  const rangeRestricted = round.holeRange === 'front9' || round.holeRange === 'back9';
  const showTabs = hasBack9 && !rangeRestricted;
  const forcedSection: 'front' | 'back' | null =
    round.holeRange === 'front9' ? 'front' : round.holeRange === 'back9' ? 'back' : null;
  const effectiveSection: 'front' | 'back' =
    forcedSection ?? visibleNine;

  const visibleHoles = !hasBack9 ? front9 : effectiveSection === 'front' ? front9 : back9;
  const visibleTotalLabel = effectiveSection === 'front' ? 'OUT' : 'IN';

  return (
    <View>
      {showTabs && (
        <View style={styles.tabs}>
          <Pressable
            onPress={() => setVisibleNine('front')}
            style={[styles.tab, effectiveSection === 'front' && styles.tabActive]}>
            <Text
              style={[
                styles.tabText,
                effectiveSection === 'front' && styles.tabTextActive,
              ]}>
              FRONT
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setVisibleNine('back')}
            style={[styles.tab, effectiveSection === 'back' && styles.tabActive]}>
            <Text
              style={[
                styles.tabText,
                effectiveSection === 'back' && styles.tabTextActive,
              ]}>
              BACK
            </Text>
          </Pressable>
        </View>
      )}
      <NineSection
        styles={styles}
        holes={visibleHoles}
        scorers={scorers}
        scores={round.scores}
        totalLabel={visibleTotalLabel}
        currentHoleNumber={currentHoleNumber}
        onHolePress={onHolePress}
      />
      {!hideFinalTotals && (
        <View style={{ marginTop: 14 }}>
          <FinalTotals
            styles={styles}
            allHoles={round.course.holes}
            scorers={scorers}
            scores={round.scores}
          />
        </View>
      )}
    </View>
  );
}

type SectionProps = {
  styles: ReturnType<typeof makeStyles>;
  holes: Hole[];
  scorers: Scorer[];
  scores: RoundScore[];
  totalLabel: string;
  currentHoleNumber?: number;
  onHolePress?: (holeNumber: number) => void;
};

function NineSection({
  styles,
  holes,
  scorers,
  scores,
  totalLabel,
  currentHoleNumber,
  onHolePress,
}: SectionProps) {
  const parTotal = holes.reduce((t, h) => t + h.par, 0);

  function CellWrap({
    holeNumber,
    children,
  }: {
    holeNumber: number;
    children: React.ReactNode;
  }) {
    if (!onHolePress) return <Fragment>{children}</Fragment>;
    return (
      <Pressable
        style={styles.cellPressable}
        onPress={() => onHolePress(holeNumber)}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={styles.section}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.cellName, styles.headText]}>Hole</Text>
        {holes.map((h) => {
          const isCurrent = h.number === currentHoleNumber;
          return (
            <CellWrap key={h.number} holeNumber={h.number}>
              <Text
                style={[
                  styles.cellNum,
                  styles.headText,
                  isCurrent && styles.headTextCurrent,
                ]}>
                {h.number}
              </Text>
            </CellWrap>
          );
        })}
        <Text style={[styles.cellTotal, styles.headText]}>{totalLabel}</Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.cellName, styles.parText]}>Par</Text>
        {holes.map((h) => {
          const isCurrent = h.number === currentHoleNumber;
          return (
            <CellWrap key={h.number} holeNumber={h.number}>
              <Text
                style={[
                  styles.cellNum,
                  styles.parText,
                  isCurrent && styles.cellColCurrent,
                ]}>
                {h.par}
              </Text>
            </CellWrap>
          );
        })}
        <Text style={[styles.cellTotal, styles.parText]}>{parTotal}</Text>
      </View>

      {scorers.map((scorer) => {
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
              const holeNumber = holes[i].number;
              const isCurrent = holeNumber === currentHoleNumber;
              return (
                <CellWrap key={holeNumber} holeNumber={holeNumber}>
                  <Text
                    style={[
                      styles.cellNum,
                      c.rel !== null && c.rel > 0 && styles.cellOver,
                      c.rel !== null && c.rel < 0 && styles.cellUnder,
                      c.strokes === null && styles.cellEmpty,
                      isCurrent && styles.cellColCurrent,
                    ]}>
                    {c.rel !== null ? formatScore(c.rel) : '—'}
                  </Text>
                </CellWrap>
              );
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
          ? `${totalStrokes}  ·  ${formatScore(totalRel)}`
          : `${totalStrokes}  ·  ${formatScore(totalRel)} · ${holesScored}/${allHoles.length}`;
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
    tabs: {
      flexDirection: 'row',
      gap: 4,
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      padding: 3,
      marginBottom: 8,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      borderRadius: 7,
    },
    tabActive: {
      backgroundColor: colors.cardBg,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    tabText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
    tabTextActive: {
      color: colors.primaryDark,
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
    cellPressable: {
      flex: 1,
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
    cellColCurrent: {
      backgroundColor: 'rgba(124,179,66,0.18)',
      borderRadius: 4,
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
    headTextCurrent: {
      color: colors.primaryDark,
      backgroundColor: 'rgba(124,179,66,0.25)',
      borderRadius: 4,
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
