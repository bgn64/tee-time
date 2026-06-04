/**
 * HorizontalScorecard — Phase 2 replacement for `ReadOnlyScorecard`.
 *
 * Layout matches the mockup (section 3): holes run left-to-right
 * across the columns, scorers stack vertically grouped by their tee
 * set, and adjacent tee sets that share the same per-hole par+hcp
 * get merged so the par/hcp rows aren't repeated needlessly.
 *
 * Column layout:
 *   `[ 84px label ] [ N hole cells, min 20px ] [ totals: OUT? IN? TOT ]`
 *
 * The active `HoleRange` controls which hole cells render:
 *   - `front9` → holes 1-9 plus OUT and TOT
 *   - `back9`  → holes 10-18 plus IN and TOT
 *   - `all`    → every hole + OUT + IN + TOT (cells get tight on phones —
 *                use the Front/Back pill to narrow)
 *
 * Row layout, per tee group:
 *   - One yardage row per tee in the group (coloured to that tee).
 *   - One shared PAR row.
 *   - One shared HCP row.
 *   - One row per scorer whose tee falls in this group (avatar + name
 *     + per-hole `<ScoreMark>` + running totals).
 *
 * Cells in the par/hcp rows that diverge from the previous group are
 * tinted in the `divergent` token to draw attention.
 *
 * Tee fallback: if no scorer has a tee, or a scorer's tee isn't in
 * `round.course.tees`, that scorer is bucketed into the first tee
 * group (or a synthesised single tee derived from `round.course.holes`
 * when there are no tees at all). This handles in-flight rounds whose
 * `course_snapshot` predates the per-tee schema.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from './TeamAvatarCluster';
import { FrontBackPill } from './FrontBackPill';
import { ScoreMark } from './ScoreMark';
import { holesInRange } from '@/library/golf/scoring';
import { assignTeeColors } from '@/library/golf/teeColor';
import { getHoleStats, groupTeesByParHcp } from '@/library/golf/teeGrouping';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole, HoleRange, Round, Tee } from '@/types/golf';

type Props = {
  round: Round;
  currentHoleNumber?: number;
  onHolePress?: (holeNumber: number) => void;
  onPressParticipant?: (userId: string) => void;
};

type Scorer = {
  id: string;
  /** Short label for the row (e.g. "Ben", "Mira & Ben"). */
  label: string;
  members: AvatarMember[];
  /** The tee the scorer played, if any. */
  teeId?: string;
  /** Present for `user:` participants — drives the avatar tap-to-profile. */
  userId?: string;
};

export function HorizontalScorecard({
  round,
  currentHoleNumber,
  onHolePress,
  onPressParticipant,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const resolver = useParticipantResolver(round.playerIds ?? []);
  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  // Local range state, seeded from the round. Phase 2 keeps the
  // selection ephemeral — the pill is purely a viewer toggle and
  // does NOT mutate `round.holeRange` (which is the scoring-mode
  // contract for which holes count toward totals).
  const [viewRange, setViewRange] = useState<HoleRange>(round.holeRange);
  const courseHoles = round.course.holes;
  const has18 = courseHoles.length >= 18;
  const effectiveRange: HoleRange = has18 ? viewRange : 'all';
  const visibleHoles = useMemo(
    () => holesInRange(courseHoles, effectiveRange),
    [courseHoles, effectiveRange]
  );

  // Resolve tees with a synthetic single-tee fallback when the course
  // has no per-tee data at all (typical for opengolf courses pre-
  // enrichment + in-flight rounds with old snapshots).
  //
  // Filter to only the tees that at least one scorer actually plays.
  // A tee that nobody's playing adds noise + a wasted yardage row in
  // the grid. If no scorer specified a tee at all, fall back to the
  // first course tee (or the synthetic default below) so the grid
  // still renders something.
  const tees = useMemo<Tee[]>(() => {
    const courseTees = round.course.tees ?? [];
    if (courseTees.length === 0) {
      return [{ id: '__default__', name: 'Tees' }];
    }

    // Collect every teeId referenced by a participant. In scramble the
    // tee lives on the first member of each team (matches the grouping
    // rule in `resolveScorerTee` below); in stroke each participant
    // carries their own teeId.
    const playedTeeIds = new Set<string>();
    if (round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0) {
      for (const team of round.teams ?? []) {
        const firstMember = team.playerIds[0];
        if (!firstMember) continue;
        const teeId = round.participants.find(
          (p) => p.participantKey === firstMember
        )?.teeId;
        if (teeId) playedTeeIds.add(teeId);
      }
    } else {
      for (const p of round.participants) {
        if (p.teeId) playedTeeIds.add(p.teeId);
      }
    }

    const filtered = courseTees.filter((t) => playedTeeIds.has(t.id));
    if (filtered.length > 0) return filtered;
    // No scorer specified a tee. Rather than collapsing to just the
    // first tee, surface every course tee so the user still sees the
    // full set of options for the course; scorers without a teeId
    // get bucketed into the first group below.
    return courseTees;
  }, [round.course.tees, round.participants, round.scoringRule, round.teams]);

  const teeColorMap = useMemo(() => assignTeeColors(tees), [tees]);
  const groups = useMemo(
    () => groupTeesByParHcp(tees, visibleHoles),
    [tees, visibleHoles]
  );

  // Hide the HCP row entirely when no hole on the course carries a
  // handicap index. Real-world courses either ship a full
  // stroke-index set or none at all; rendering a row of empty cells
  // for the "none" case is just visual noise. The global check (not
  // per-group) keeps the layout consistent across groups when a few
  // holes happen to be missing data inside a course that mostly has
  // it.
  const hasAnyHandicap = useMemo(
    () =>
      groups.some((g) => g.holes.some((h) => h.handicapIndex != null)),
    [groups]
  );

  // Build the scorer list. In scramble mode each team is one scorer
  // (their tee is derived from the first member's participant entry,
  // matching `SummaryTabContent` + `ScorerStack`). In stroke each
  // participant is one scorer.
  const scorers = useMemo<Scorer[]>(() => {
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
        const firstMember = team.playerIds[0];
        const teeId = firstMember
          ? round.participants.find((p) => p.participantKey === firstMember)
              ?.teeId
          : undefined;
        // Short label: first names joined by '&' for the scorecard
        // label cell (fits the 84px column even with two members).
        const shortLabel = members
          .map((m) => m.name.split(' ')[0])
          .slice(0, 2)
          .join(' & ');
        return {
          id: team.id,
          label: shortLabel,
          members,
          teeId,
        };
      });
    }
    return (round.playerIds ?? []).map((pid) => {
      const r = resolver.get(pid);
      const name = r?.displayName || 'Player';
      const color = r?.avatarColor || colors.primary;
      const teeId = round.participants.find(
        (p) => p.participantKey === pid
      )?.teeId;
      const shortLabel = name.split(' ')[0];
      return {
        id: pid,
        label: shortLabel,
        members: [{ id: pid, name, color }],
        teeId,
        userId: r?.userId,
      };
    });
  }, [
    isScramble,
    round.teams,
    round.playerIds,
    round.participants,
    resolver,
    colors.primary,
  ]);

  // Bucket scorers by tee group index. Scorers without a recognised
  // tee (no teeId, or teeId not in tees array, or course has no tees)
  // fall into the first group.
  const scorersByGroup = useMemo(() => {
    const buckets: Scorer[][] = groups.map(() => []);
    if (buckets.length === 0) return buckets;
    for (const scorer of scorers) {
      let groupIdx = -1;
      if (scorer.teeId) {
        for (let i = 0; i < groups.length; i++) {
          if (groups[i].tees.some((t) => t.id === scorer.teeId)) {
            groupIdx = i;
            break;
          }
        }
      }
      if (groupIdx === -1) groupIdx = 0;
      buckets[groupIdx].push(scorer);
    }
    return buckets;
  }, [groups, scorers]);

  // Per-totals derivation. We compute OUT (1–9) / IN (10–18) / TOT for
  // the currently-visible holes only — totals row aligns with whatever
  // the viewer chose via the pill.
  const totals = useMemo(() => deriveTotals(effectiveRange), [effectiveRange]);

  // Heads-up: when nothing to render (no tees, no holes), bail early
  // so the grid math doesn't divide by zero.
  if (visibleHoles.length === 0 || groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {has18 ? (
        <View style={styles.controlsRow}>
          <FrontBackPill current={viewRange} onChange={setViewRange} />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.scrollContent}>
        <View>
          <HoleHeaderRow
            visibleHoles={visibleHoles}
            totals={totals}
            styles={styles}
            currentHoleNumber={currentHoleNumber}
            onHolePress={onHolePress}
          />

          {groups.map((group, groupIdx) => {
            const groupScorers = scorersByGroup[groupIdx];
            return (
              <View key={`${group.key}-${groupIdx}`}>
                {/* Yardage rows — one per tee in the group. */}
                {group.tees.map((tee) => {
                  const token = teeColorMap.get(tee.id);
                  const teeHex = token ? colors[token] : colors.textMuted;
                  return (
                    <View key={`yds-${tee.id}`} style={styles.rowYds}>
                      <Cell label style={[styles.cellLabel, styles.cellYdsLabel]}>
                        <View
                          style={[styles.teeDot, { backgroundColor: teeHex }]}
                        />
                        <Text
                          style={[styles.cellYdsLabelText, { color: teeHex }]}
                          numberOfLines={1}>
                          {tee.name.toUpperCase()}
                        </Text>
                      </Cell>
                      {visibleHoles.map((hole) => {
                        const stats = getHoleStats(tee, hole.number, hole);
                        return (
                          <Cell
                            key={`yds-${tee.id}-${hole.number}`}
                            style={styles.cellYds}>
                            <Text style={[styles.cellYdsText, { color: teeHex }]}>
                              {stats.yardage ?? ''}
                            </Text>
                          </Cell>
                        );
                      })}
                      {totals.showOut ? (
                        <Cell style={[styles.cellYds, styles.cellTotOutIn]}>
                          <Text
                            style={[styles.cellYdsText, { color: teeHex }]}>
                            {sumYardages(tee, visibleHoles, 'front9')}
                          </Text>
                        </Cell>
                      ) : null}
                      {totals.showIn ? (
                        <Cell style={[styles.cellYds, styles.cellTotOutIn]}>
                          <Text
                            style={[styles.cellYdsText, { color: teeHex }]}>
                            {sumYardages(tee, visibleHoles, 'back9')}
                          </Text>
                        </Cell>
                      ) : null}
                      <Cell style={[styles.cellYds, styles.cellTot]}>
                        <Text style={[styles.cellYdsText, { color: teeHex }]}>
                          {sumYardages(tee, visibleHoles, 'all')}
                        </Text>
                      </Cell>
                    </View>
                  );
                })}

                {/* Shared PAR row. */}
                <View style={styles.rowPar}>
                  <Cell label style={styles.cellLabel}>
                    <Text style={styles.cellLabelText}>PAR</Text>
                  </Cell>
                  {group.holes.map((stats) => (
                    <Cell key={`par-${stats.holeNumber}`} style={styles.cellPar}>
                      <Text
                        style={[
                          styles.cellParText,
                          stats.parDivergent ? styles.cellDivergent : null,
                        ]}>
                        {stats.par}
                      </Text>
                    </Cell>
                  ))}
                  {totals.showOut ? (
                    <Cell style={[styles.cellPar, styles.cellTotOutIn]}>
                      <Text style={styles.cellParText}>
                        {sumPar(group.holes, 'front9')}
                      </Text>
                    </Cell>
                  ) : null}
                  {totals.showIn ? (
                    <Cell style={[styles.cellPar, styles.cellTotOutIn]}>
                      <Text style={styles.cellParText}>
                        {sumPar(group.holes, 'back9')}
                      </Text>
                    </Cell>
                  ) : null}
                  <Cell style={[styles.cellPar, styles.cellTot]}>
                    <Text style={styles.cellParText}>
                      {sumPar(group.holes, 'all')}
                    </Text>
                  </Cell>
                </View>

                {/* Shared HCP row. Skipped entirely for courses
                    that have no handicap index data anywhere. */}
                {hasAnyHandicap ? (
                  <View style={styles.rowHcp}>
                    <Cell label style={styles.cellLabel}>
                      <Text style={styles.cellHcpLabelText}>HCP</Text>
                    </Cell>
                    {group.holes.map((stats) => (
                      <Cell key={`hcp-${stats.holeNumber}`} style={styles.cellHcp}>
                        <Text
                          style={[
                            styles.cellHcpText,
                            stats.hcpDivergent ? styles.cellDivergent : null,
                          ]}>
                          {stats.handicapIndex ?? ''}
                        </Text>
                      </Cell>
                    ))}
                    {totals.showOut ? (
                      <Cell style={[styles.cellHcp, styles.cellTotOutIn]} />
                    ) : null}
                    {totals.showIn ? (
                      <Cell style={[styles.cellHcp, styles.cellTotOutIn]} />
                    ) : null}
                    <Cell style={[styles.cellHcp, styles.cellTot]} />
                  </View>
                ) : null}

                {/* Scorer rows for this group. */}
                {groupScorers.map((scorer) => (
                  <ScorerRow
                    key={scorer.id}
                    scorer={scorer}
                    visibleHoles={visibleHoles}
                    round={round}
                    totals={totals}
                    teeColor={
                      // Only resolve a swatch when the scorer has
                      // explicitly picked a tee. Falling back to the
                      // first tee in the matched group would paint a
                      // misleading colour next to the avatar (e.g.
                      // blue for a no-tee scorer in a Blue/White/Red
                      // course).
                      scorer.teeId ? (teeColorMap.get(scorer.teeId) ?? null) : null
                    }
                    onPressParticipant={onPressParticipant}
                    styles={styles}
                    colors={colors}
                  />
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

type TotalFlags = { showOut: boolean; showIn: boolean };

function deriveTotals(range: HoleRange): TotalFlags {
  if (range === 'front9') return { showOut: true, showIn: false };
  if (range === 'back9') return { showOut: false, showIn: true };
  return { showOut: true, showIn: true };
}

function sumYardages(
  tee: Tee,
  holes: readonly Hole[],
  scope: 'front9' | 'back9' | 'all'
): number | string {
  let total = 0;
  let any = false;
  for (const hole of holes) {
    if (scope === 'front9' && hole.number > 9) continue;
    if (scope === 'back9' && hole.number <= 9) continue;
    const stats = getHoleStats(tee, hole.number, hole);
    if (stats.yardage != null) {
      total += stats.yardage;
      any = true;
    }
  }
  // No thousand separators — the fixed-width totals cells are
  // sized to fit "7250" without commas; a "7,250" would overflow.
  return any ? String(total) : '';
}

function sumPar(
  groupHoles: readonly { holeNumber: number; par: number }[],
  scope: 'front9' | 'back9' | 'all'
): number {
  let total = 0;
  for (const h of groupHoles) {
    if (scope === 'front9' && h.holeNumber > 9) continue;
    if (scope === 'back9' && h.holeNumber <= 9) continue;
    total += h.par;
  }
  return total;
}

type HeaderProps = {
  visibleHoles: readonly Hole[];
  totals: TotalFlags;
  styles: ReturnType<typeof makeStyles>;
  currentHoleNumber?: number;
  onHolePress?: (n: number) => void;
};

function HoleHeaderRow({
  visibleHoles,
  totals,
  styles,
  currentHoleNumber,
  onHolePress,
}: HeaderProps) {
  return (
    <View style={[styles.rowHead]}>
      <Cell label style={styles.cellLabel}>
        <Text style={styles.cellHeadText}>HOLE</Text>
      </Cell>
      {visibleHoles.map((hole) => {
        const isCurrent = hole.number === currentHoleNumber;
        const inner = (
          <Text
            style={[
              styles.cellHeadText,
              isCurrent ? styles.cellHeadCurrent : null,
            ]}>
            {hole.number}
          </Text>
        );
        if (onHolePress) {
          return (
            <Pressable
              key={`hd-${hole.number}`}
              style={styles.cellHead}
              onPress={() => onHolePress(hole.number)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to hole ${hole.number}`}>
              {inner}
            </Pressable>
          );
        }
        return (
          <View key={`hd-${hole.number}`} style={styles.cellHead}>
            {inner}
          </View>
        );
      })}
      {totals.showOut ? (
        <View style={[styles.cellHead, styles.cellTotOutIn]}>
          <Text style={styles.cellHeadText}>OUT</Text>
        </View>
      ) : null}
      {totals.showIn ? (
        <View style={[styles.cellHead, styles.cellTotOutIn]}>
          <Text style={styles.cellHeadText}>IN</Text>
        </View>
      ) : null}
      <View style={[styles.cellHead, styles.cellTot]}>
        <Text style={styles.cellHeadText}>TOT</Text>
      </View>
    </View>
  );
}

type ScorerRowProps = {
  scorer: Scorer;
  visibleHoles: readonly Hole[];
  round: Round;
  totals: TotalFlags;
  teeColor: string | null;
  onPressParticipant?: (userId: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
};

function ScorerRow({
  scorer,
  visibleHoles,
  round,
  totals,
  teeColor,
  onPressParticipant,
  styles,
  colors,
}: ScorerRowProps) {
  // Per-hole strokes for this scorer, indexed by hole number.
  const strokesByHole = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of round.scores) {
      if (s.scorerId !== scorer.id) continue;
      m.set(s.holeNumber, s.strokes);
    }
    return m;
  }, [round.scores, scorer.id]);

  const totalRel = useMemo(() => {
    return computeRelative(strokesByHole, visibleHoles, 'all');
  }, [strokesByHole, visibleHoles]);
  const frontRel = totals.showOut
    ? computeRelative(strokesByHole, visibleHoles, 'front9')
    : null;
  const backRel = totals.showIn
    ? computeRelative(strokesByHole, visibleHoles, 'back9')
    : null;

  const dotHex = teeColor ? colors[teeColor as keyof ThemeColors] as string : undefined;

  return (
    <View style={styles.rowScorer}>
      <Cell label style={styles.cellLabel}>
        <View style={styles.scorerLabelInner}>
          {onPressParticipant && scorer.userId ? (
            <Pressable
              onPress={() => scorer.userId && onPressParticipant(scorer.userId)}
              accessibilityRole="button"
              accessibilityLabel={`View ${scorer.label}'s profile`}>
              <TeamAvatarCluster members={scorer.members} size="sm" />
            </Pressable>
          ) : (
            <TeamAvatarCluster members={scorer.members} size="sm" />
          )}
          {dotHex ? (
            <View style={[styles.teeDotSmall, { backgroundColor: dotHex }]} />
          ) : null}
        </View>
      </Cell>
      {visibleHoles.map((hole) => {
        const strokes = strokesByHole.get(hole.number) ?? null;
        return (
          <View
            key={`sc-${scorer.id}-${hole.number}`}
            style={styles.cellScorer}>
            <ScoreMark strokes={strokes} par={hole.par} />
          </View>
        );
      })}
      {frontRel != null ? (
        <View style={[styles.cellScorer, styles.cellTotOutIn]}>
          <Text style={styles.cellRelText}>{formatRelative(frontRel.rel, frontRel.any)}</Text>
        </View>
      ) : null}
      {backRel != null ? (
        <View style={[styles.cellScorer, styles.cellTotOutIn]}>
          <Text style={styles.cellRelText}>{formatRelative(backRel.rel, backRel.any)}</Text>
        </View>
      ) : null}
      <View style={[styles.cellScorer, styles.cellTot]}>
        <Text style={styles.cellRelText}>{formatRelative(totalRel.rel, totalRel.any)}</Text>
      </View>
    </View>
  );
}

function computeRelative(
  strokesByHole: ReadonlyMap<number, number>,
  visibleHoles: readonly Hole[],
  scope: 'front9' | 'back9' | 'all'
): { rel: number; any: boolean } {
  let rel = 0;
  let any = false;
  for (const hole of visibleHoles) {
    if (scope === 'front9' && hole.number > 9) continue;
    if (scope === 'back9' && hole.number <= 9) continue;
    const strokes = strokesByHole.get(hole.number);
    if (strokes != null) {
      rel += strokes - hole.par;
      any = true;
    }
  }
  return { rel, any };
}

function formatRelative(rel: number, any: boolean): string {
  if (!any) return '—';
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

type CellProps = {
  children?: React.ReactNode;
  label?: boolean;
  style?: object | object[];
};

function Cell({ children, label, style }: CellProps) {
  return <View style={style}>{children}</View>;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 6,
    },
    controlsRow: {
      paddingBottom: 8,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1.5,
      borderBottomColor: colors.textTitle,
      paddingBottom: 2,
    },
    rowYds: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowPar: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowHcp: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowScorer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    cellLabel: {
      width: 56,
      paddingLeft: 4,
      paddingVertical: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    cellLabelText: {
      fontSize: 10.5,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
    cellYdsLabel: {
      paddingVertical: 3,
    },
    cellYdsLabelText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    cellHcpLabelText: {
      fontSize: 10,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
    cellHead: {
      width: 26,
      paddingVertical: 4,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellHeadText: {
      fontSize: 11,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: 0.4,
    },
    cellHeadCurrent: {
      color: colors.primaryDark,
    },
    cellYds: {
      width: 26,
      paddingVertical: 3,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellYdsText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    cellPar: {
      width: 26,
      paddingVertical: 5,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellParText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    cellHcp: {
      width: 26,
      paddingVertical: 3,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellHcpText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    cellScorer: {
      width: 26,
      paddingVertical: 7,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellRelText: {
      fontSize: 11,
      fontWeight: '900',
      color: colors.textTitle,
    },
    cellTot: {
      // TOT column: wider to fit "7250" totals without bulging
      // the row. OUT/IN columns use `cellTotOutIn` (narrower)
      // because their values cap around 3500. Layered last in the
      // style array so it overrides the base cell's width.
      width: 46,
      backgroundColor: colors.chipBg,
    },
    cellTotOutIn: {
      width: 42,
      backgroundColor: colors.chipBg,
    },
    cellDivergent: {
      color: colors.divergent,
    },
    teeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      flexShrink: 0,
    },
    teeDotSmall: {
      width: 7,
      height: 7,
      borderRadius: 4,
      flexShrink: 0,
      marginLeft: 2,
    },
    scorerLabelInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
      minWidth: 0,
    },
    scrollContent: {
      // Center the table when it fits the viewport (i.e. Front/Back
      // 9 + a few scorers). Wider all-18 layouts overflow naturally
      // and scroll horizontally.
      flexGrow: 1,
      justifyContent: 'center',
    },
  });
}
