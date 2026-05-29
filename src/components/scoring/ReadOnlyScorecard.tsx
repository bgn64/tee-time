/**
 * Read-only scorecard grid (vertical layout — v4 redesign).
 *
 * Rotated from the previous horizontal layout: rows are holes,
 * columns are scorers. Saves horizontal space on mobile so each
 * cell is comfortably tappable.
 *
 * Columns: `[Hole] [Par] [Scorer 1] [Scorer 2] …`. Header row shows
 * just the scorer's avatar cluster (no name — the entry-row up top
 * carries identification, the grid only needs identity at a glance).
 * Inline OUT / IN / TOT totals rows replace the previous
 * `FinalTotals` box; partial totals render as `—` (no asterisk).
 *
 * Stroke vs scramble: in scramble the "scorers" are teams (one
 * column per team; the team id is what `RoundScore` rows are keyed
 * by, and the column header shows every team member as an
 * overlapping avatar cluster). In stroke each participant is one
 * scorer.
 *
 * Resolution: participant display info comes from PowerSync local
 * (profiles + custom_players) with the round's `participants[]`
 * snapshot as a fallback for the friend-feed case (the owner's
 * custom_players rows don't sync to a friend's device).
 *
 * Tap-to-jump: when `onHolePress` is set, every cell in a hole row
 * is wrapped in a Pressable that calls back with the hole number.
 * Tap-to-profile: when `onPressParticipant` is set, the column-header
 * avatar becomes a Pressable for stroke scorers whose userId resolved.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from './TeamAvatarCluster';
import { formatScore } from '@/library/golf/scoring';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Hole, Round, RoundScore } from '@/types/golf';

type Scorer = {
  id: string;
  name: string;
  members: AvatarMember[];
  /** Present for `user:` participants — drives tap-to-profile from the column header. */
  userId?: string;
};

type Props = {
  round: Round;
  currentHoleNumber?: number;
  onHolePress?: (holeNumber: number) => void;
  /** Fired when a `user:` participant's column-header avatar is tapped. */
  onPressParticipant?: (userId: string) => void;
};

export function ReadOnlyScorecard({
  round,
  currentHoleNumber,
  onHolePress,
  onPressParticipant,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Resolve participant display info from PowerSync local
  // (profiles + custom_players) with a direct-fetch fallback for
  // unfriended ex-friends. The keys come from `playerIds` so a
  // round whose `participants[]` is missing still resolves.
  const resolverKeys = useMemo(
    () => round.playerIds ?? [],
    [round.playerIds]
  );

  // Build a snapshot map from `participants[]` so the resolver can
  // fall back to round-time localDisplayName / localDisplayColor when
  // the live custom_players row isn't available locally (the
  // friend-feed case — the owner's custom_players don't sync to my
  // device).
  const participantSnapshots = useMemo(() => {
    const m = new Map<string, { displayName?: string; avatarColor?: string }>();
    for (const p of round.participants ?? []) {
      if (!p.localDisplayName && !p.localDisplayColor) continue;
      m.set(p.participantKey, {
        displayName: p.localDisplayName,
        avatarColor: p.localDisplayColor,
      });
    }
    return m;
  }, [round.participants]);

  const resolver = useParticipantResolver(resolverKeys, participantSnapshots);

  const scorers: Scorer[] = useMemo(() => {
    const isScramble =
      round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

    if (isScramble) {
      // One column per team. `userId` is intentionally not set —
      // a team column doesn't have a single profile to tap into.
      const list: Scorer[] = [];
      for (const team of round.teams ?? []) {
        const members: AvatarMember[] = team.playerIds.map((pid) => {
          const r = resolver.get(pid);
          return {
            id: pid,
            name: r?.displayName || 'Player',
            color: r?.avatarColor || colors.primary,
          };
        });
        list.push({
          id: team.id,
          name: team.name,
          members,
        });
      }
      return list;
    }

    const list: Scorer[] = [];
    for (const p of round.participants ?? []) {
      const resolved = resolver.get(p.participantKey);
      const name = resolved?.displayName || 'Player';
      const color = resolved?.avatarColor || colors.primary;
      list.push({
        id: p.participantKey,
        name,
        members: [{ id: p.participantKey, name, color }],
        userId: resolved?.userId,
      });
    }
    // Defensive: if `participants[]` is somehow empty, fall back to
    // `playerIds`. Shouldn't happen in v1 because `startRound` always
    // seeds participants, but it costs nothing to be defensive.
    if (list.length === 0) {
      for (const pid of round.playerIds ?? []) {
        const resolved = resolver.get(pid);
        const name = resolved?.displayName || 'Player';
        const color = resolved?.avatarColor || colors.primary;
        list.push({
          id: pid,
          name,
          members: [{ id: pid, name, color }],
          userId: resolved?.userId,
        });
      }
    }
    return list;
  }, [
    round.scoringRule,
    round.teams,
    round.participants,
    round.playerIds,
    resolver,
    colors.primary,
  ]);

  const front9 = useMemo(
    () => round.course.holes.filter((h) => h.number <= 9),
    [round.course.holes]
  );
  const back9 = useMemo(
    () => round.course.holes.filter((h) => h.number > 9),
    [round.course.holes]
  );
  const hasFront = front9.length > 0;
  const hasBack = back9.length > 0;

  const [visibleNine, setVisibleNine] = useState<'front' | 'back'>(
    currentHoleNumber && currentHoleNumber > 9 ? 'back' : 'front'
  );

  // Keep visibleNine aligned with the current hole when the user
  // navigates across the 9/10 boundary. Use a "previous prop" sentinel
  // so the state set happens during render (no extra paint).
  const [lastSyncedHole, setLastSyncedHole] = useState<number | null>(
    currentHoleNumber ?? null
  );
  if (hasBack && currentHoleNumber != null && currentHoleNumber !== lastSyncedHole) {
    setLastSyncedHole(currentHoleNumber);
    setVisibleNine(currentHoleNumber > 9 ? 'back' : 'front');
  }

  const rangeRestricted = round.holeRange === 'front9' || round.holeRange === 'back9';
  const showTabs = hasBack && !rangeRestricted;
  const forcedSection: 'front' | 'back' | null =
    round.holeRange === 'front9' ? 'front' : round.holeRange === 'back9' ? 'back' : null;
  const effectiveSection: 'front' | 'back' = forcedSection ?? visibleNine;

  const visibleHoles = !hasBack ? front9 : effectiveSection === 'front' ? front9 : back9;
  const sectionLabel = effectiveSection === 'front' ? 'OUT' : 'IN';
  const showTotRow = effectiveSection === 'back' && hasFront && hasBack;
  const allHoles = round.course.holes;

  return (
    <View>
      {showTabs && (
        <View style={styles.tabs}>
          <Pressable
            onPress={() => setVisibleNine('front')}
            style={[styles.tab, effectiveSection === 'front' && styles.tabActive]}>
            <Text
              style={[styles.tabText, effectiveSection === 'front' && styles.tabTextActive]}>
              FRONT
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setVisibleNine('back')}
            style={[styles.tab, effectiveSection === 'back' && styles.tabActive]}>
            <Text
              style={[styles.tabText, effectiveSection === 'back' && styles.tabTextActive]}>
              BACK
            </Text>
          </Pressable>
        </View>
      )}
      <VerticalGrid
        styles={styles}
        holes={visibleHoles}
        scorers={scorers}
        scores={round.scores}
        sectionLabel={sectionLabel}
        showTotRow={showTotRow}
        allHoles={allHoles}
        currentHoleNumber={currentHoleNumber}
        onHolePress={onHolePress}
        onPressParticipant={onPressParticipant}
        ringColor={colors.cardBg}
      />
    </View>
  );
}

type GridProps = {
  styles: ReturnType<typeof makeStyles>;
  holes: Hole[];
  scorers: Scorer[];
  scores: RoundScore[];
  /** "OUT" or "IN" — the section totals label. */
  sectionLabel: 'OUT' | 'IN';
  /** True when we should also render a TOT row below the section totals. */
  showTotRow: boolean;
  /** Every hole in the round (used for the TOT row sum). */
  allHoles: Hole[];
  currentHoleNumber?: number;
  onHolePress?: (holeNumber: number) => void;
  onPressParticipant?: (userId: string) => void;
  ringColor: string;
};

function VerticalGrid({
  styles,
  holes,
  scorers,
  scores,
  sectionLabel,
  showTotRow,
  allHoles,
  currentHoleNumber,
  onHolePress,
  onPressParticipant,
  ringColor,
}: GridProps) {
  const sectionPar = holes.reduce((t, h) => t + h.par, 0);
  const totalPar = allHoles.reduce((t, h) => t + h.par, 0);

  // Per-scorer aggregates for the section + the whole round. Tracked
  // inline so we don't re-walk `scores` once per scorer per totals
  // row. Initialise to zero counts; emit "—" downstream when scored
  // < total.
  const sectionAgg = scorers.map((s) => aggregateFor(s.id, holes, scores));
  const totalAgg = showTotRow
    ? scorers.map((s) => aggregateFor(s.id, allHoles, scores))
    : null;

  return (
    <View style={styles.grid}>
      {/* Header: Hole | Par | avatars. Uses the same column wrappers
          as the hole + totals rows so widths line up to the pixel. */}
      <View style={[styles.row, styles.headRow]}>
        <View style={styles.holeCol}>
          <Text style={[styles.headLabel, styles.cellTextCenter]}>Hole</Text>
        </View>
        <View style={[styles.parCol, styles.colBorder]}>
          <Text style={[styles.headLabel, styles.cellTextCenter]}>Par</Text>
        </View>
        {scorers.map((s) => {
          const cluster = (
            <TeamAvatarCluster members={s.members} size="sm" ringColor={ringColor} />
          );
          return (
            <View key={s.id} style={[styles.scoreCol, styles.colBorder, styles.scoreColCentered]}>
              {s.userId && onPressParticipant ? (
                <Pressable
                  onPress={() => onPressParticipant(s.userId!)}
                  hitSlop={4}
                  accessibilityLabel={`View ${s.name}'s profile`}>
                  {cluster}
                </Pressable>
              ) : (
                cluster
              )}
            </View>
          );
        })}
      </View>

      {/* Hole rows */}
      {holes.map((h) => {
        const isCurrent = h.number === currentHoleNumber;
        return (
          <View
            key={h.number}
            style={[styles.row, styles.holeRow, isCurrent && styles.holeRowCurrent]}>
            <HoleCell
              style={styles.holeCol}
              holeNumber={h.number}
              onHolePress={onHolePress}>
              <Text style={[styles.holeNumText, styles.cellTextCenter]}>{h.number}</Text>
            </HoleCell>
            <HoleCell
              style={[styles.parCol, styles.colBorder]}
              holeNumber={h.number}
              onHolePress={onHolePress}>
              <Text style={[styles.parNumText, styles.cellTextCenter]}>{h.par}</Text>
            </HoleCell>
            {scorers.map((s) => {
              const score = scores.find(
                (sc) => sc.scorerId === s.id && sc.holeNumber === h.number
              );
              const rel = score ? score.strokes - h.par : null;
              return (
                <HoleCell
                  key={s.id}
                  style={[
                    styles.scoreCol,
                    styles.colBorder,
                    rel !== null && rel > 0 && styles.scoreOverBg,
                    rel !== null && rel < 0 && styles.scoreUnderBg,
                  ]}
                  holeNumber={h.number}
                  onHolePress={onHolePress}>
                  <Text
                    style={[
                      styles.scoreText,
                      styles.cellTextCenter,
                      rel !== null && rel > 0 && styles.scoreOver,
                      rel !== null && rel < 0 && styles.scoreUnder,
                      rel === null && styles.scoreEmpty,
                    ]}>
                    {rel !== null ? formatScore(rel) : '—'}
                  </Text>
                </HoleCell>
              );
            })}
          </View>
        );
      })}

      {/* OUT / IN totals */}
      <View style={[styles.row, styles.totalsRow]}>
        <View style={styles.holeCol}>
          <Text style={[styles.totalsLabelText, styles.cellTextCenter]}>{sectionLabel}</Text>
        </View>
        <View style={[styles.parCol, styles.colBorder]}>
          <Text style={[styles.totalsParText, styles.cellTextCenter]}>{sectionPar}</Text>
        </View>
        {sectionAgg.map((agg, i) => (
          <View key={scorers[i].id} style={[styles.scoreCol, styles.colBorder]}>
            <TotalsCellInner styles={styles} agg={agg} />
          </View>
        ))}
      </View>

      {/* TOT row when both nines exist */}
      {showTotRow && totalAgg ? (
        <View style={[styles.row, styles.totalsRow]}>
          <View style={styles.holeCol}>
            <Text style={[styles.totalsLabelText, styles.cellTextCenter]}>TOT</Text>
          </View>
          <View style={[styles.parCol, styles.colBorder]}>
            <Text style={[styles.totalsParText, styles.cellTextCenter]}>{totalPar}</Text>
          </View>
          {totalAgg.map((agg, i) => (
            <View key={scorers[i].id} style={[styles.scoreCol, styles.colBorder]}>
              <TotalsCellInner styles={styles} agg={agg} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type Aggregate = {
  rel: number;
  scored: number;
  total: number;
};

function aggregateFor(scorerId: string, holes: Hole[], scores: RoundScore[]): Aggregate {
  let rel = 0;
  let scored = 0;
  for (const h of holes) {
    const s = scores.find((sc) => sc.scorerId === scorerId && sc.holeNumber === h.number);
    if (!s) continue;
    rel += s.strokes - h.par;
    scored++;
  }
  return { rel, scored, total: holes.length };
}

function TotalsCellInner({
  styles,
  agg,
}: {
  styles: ReturnType<typeof makeStyles>;
  agg: Aggregate;
}) {
  const complete = agg.scored === agg.total;
  if (!complete) {
    return (
      <Text style={[styles.totalsText, styles.cellTextCenter, styles.scoreEmpty]}>—</Text>
    );
  }
  return (
    <Text
      style={[
        styles.totalsText,
        styles.cellTextCenter,
        agg.rel > 0 && styles.scoreOver,
        agg.rel < 0 && styles.scoreUnder,
      ]}>
      {formatScore(agg.rel)}
    </Text>
  );
}

function HoleCell({
  style,
  holeNumber,
  onHolePress,
  children,
}: {
  style: import('react-native').StyleProp<import('react-native').ViewStyle>;
  holeNumber: number;
  onHolePress?: (holeNumber: number) => void;
  children: React.ReactNode;
}) {
  if (!onHolePress) {
    return <View style={style}>{children}</View>;
  }
  return (
    <Pressable style={style} onPress={() => onHolePress(holeNumber)}>
      {children}
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
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
    tabTextActive: { color: colors.primaryDark },

    grid: {
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    headRow: {
      backgroundColor: colors.chipBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    holeRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    holeRowCurrent: {
      backgroundColor: 'rgba(47, 125, 75, 0.06)',
    },
    totalsRow: {
      backgroundColor: colors.chipBg,
      borderTopWidth: 1.5,
      borderTopColor: colors.border,
    },
    // Column wrappers — applied as the OUTER style of every cell in
    // every row (header, hole rows, totals) so all rows agree on
    // column widths to the pixel. Padding lives on the wrapper too
    // so background tints (over/under) fill the cell.
    holeCol: {
      width: 50,
      paddingVertical: 10,
      paddingHorizontal: 6,
      justifyContent: 'center',
    },
    parCol: {
      width: 38,
      paddingVertical: 10,
      paddingHorizontal: 4,
      justifyContent: 'center',
    },
    scoreCol: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 4,
      justifyContent: 'center',
    },
    // Center variant for the header's avatar slot (which lays out
    // its child horizontally, not via text alignment).
    scoreColCentered: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    colBorder: {
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    // Text alignment applied at the cell content level so text-based
    // cells render the same regardless of wrapper.
    cellTextCenter: { textAlign: 'center' },
    // Per-cell text styles. Width / padding are on the column wrapper.
    holeNumText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
    parNumText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    headLabel: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    scoreText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    scoreOver: {
      color: colors.accent,
    },
    scoreUnder: {
      color: colors.primaryDark,
    },
    scoreEmpty: {
      color: colors.textMuted,
      opacity: 0.55,
    },
    scoreOverBg: {
      backgroundColor: 'rgba(217, 72, 53, 0.10)',
    },
    scoreUnderBg: {
      backgroundColor: 'rgba(47, 125, 75, 0.10)',
    },
    // Totals row text.
    totalsLabelText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
    totalsParText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    totalsText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
  });
}
