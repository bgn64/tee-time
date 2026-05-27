/**
 * Read-only scorecard grid (holes × scorers).
 *
 * Drastically simplified port of the destination tee-time app's
 * `ReadOnlyScorecard`:
 *   - Stroke-only (the destination's scramble teams path is dropped).
 *   - No friend-graph / profile cache / live name resolution — names
 *     come from the round's `participants[]` snapshot + the seed
 *     player list, with no linked-friend tap-through.
 *   - No HCP row (handicap_index isn't tracked in the simplified
 *     `Hole` type).
 *   - Final-box tee pill stays editable when `onEditTee` is supplied.
 *
 * Jump-to-hole pattern: when `onHolePress` is set, every cell in the
 * grid wraps a Pressable that calls back with the hole number, so the
 * caller (live scoring screen) can drive `setCurrentHole`.
 */

import { Fragment, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { TeamAvatarCluster, type AvatarMember } from './TeamAvatarCluster';
import { teeSwatch } from './TeePickerSheet';
import { formatScore } from '@/library/golf/scoring';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Hole, Round, RoundScore, Tee } from '@/types/golf';

type Scorer = {
  id: string;
  name: string;
  color: string;
  teeId?: string;
  members: AvatarMember[];
  /** Present for `user:` participants — drives tap-to-profile from the
   * final-totals row. Self also gets a userId; the row navigates to
   * the same profile screen the search tab uses. */
  userId?: string;
};

type Props = {
  round: Round;
  currentHoleNumber?: number;
  onHolePress?: (holeNumber: number) => void;
  hideFinalTotals?: boolean;
  onEditTee?: (scorerId: string) => void;
};

export function ReadOnlyScorecard({
  round,
  currentHoleNumber,
  onHolePress,
  hideFinalTotals,
  onEditTee,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Tees that have at least one per-hole yardage on this course — these
  // get their own yardage row. We further filter to tees actually
  // assigned to a participant so an unused tee doesn't add noise.
  const teeIdsInPlay = useMemo(() => {
    const set = new Set<string>();
    for (const p of round.participants ?? []) {
      if (p.teeId) set.add(p.teeId);
    }
    return [...set];
  }, [round.participants]);

  const teesInPlay = useMemo(() => {
    const courseTees = round.course.tees ?? [];
    const byId = new Map(courseTees.map((t) => [t.id, t]));
    const tees = teeIdsInPlay
      .map((id) => byId.get(id))
      .filter((t): t is Tee => !!t)
      .filter((t) =>
        round.course.holes.some(
          (h) => h.yardages && Number.isFinite(h.yardages[t.id])
        )
      );
    return tees.sort((a, b) => (b.totalYardage ?? -1) - (a.totalYardage ?? -1));
  }, [teeIdsInPlay, round.course.tees, round.course.holes]);

  // Resolve participant display info from PowerSync local
  // (profiles + custom_players) with a direct-fetch fallback for
  // unfriended ex-friends. The keys come from `playerIds` so a
  // round whose `participants[]` is missing still resolves.
  const resolverKeys = useMemo(
    () => round.playerIds ?? [],
    [round.playerIds]
  );
  const resolver = useParticipantResolver(resolverKeys);

  const scorers: Scorer[] = useMemo(() => {
    const list: Scorer[] = [];
    for (const p of round.participants ?? []) {
      const resolved = resolver.get(p.participantKey);
      const name = resolved?.displayName || 'Player';
      const color = resolved?.avatarColor || colors.primary;
      list.push({
        id: p.participantKey,
        name,
        color,
        teeId: p.teeId,
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
          color,
          members: [{ id: pid, name, color }],
          userId: resolved?.userId,
        });
      }
    }
    return list;
  }, [round.participants, round.playerIds, resolver, colors.primary]);

  const front9 = useMemo(
    () => round.course.holes.filter((h) => h.number <= 9),
    [round.course.holes]
  );
  const back9 = useMemo(
    () => round.course.holes.filter((h) => h.number > 9),
    [round.course.holes]
  );
  const hasBack9 = back9.length > 0;

  const [visibleNine, setVisibleNine] = useState<'front' | 'back'>(
    currentHoleNumber && currentHoleNumber > 9 ? 'back' : 'front'
  );

  // Keep visibleNine aligned with the current hole when the user
  // navigates across the 9/10 boundary. Use a "previous prop" sentinel
  // so the state set happens during render (no extra paint).
  const [lastSyncedHole, setLastSyncedHole] = useState<number | null>(
    currentHoleNumber ?? null
  );
  if (hasBack9 && currentHoleNumber != null && currentHoleNumber !== lastSyncedHole) {
    setLastSyncedHole(currentHoleNumber);
    setVisibleNine(currentHoleNumber > 9 ? 'back' : 'front');
  }

  const rangeRestricted = round.holeRange === 'front9' || round.holeRange === 'back9';
  const showTabs = hasBack9 && !rangeRestricted;
  const forcedSection: 'front' | 'back' | null =
    round.holeRange === 'front9' ? 'front' : round.holeRange === 'back9' ? 'back' : null;
  const effectiveSection: 'front' | 'back' = forcedSection ?? visibleNine;

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
      <NineSection
        styles={styles}
        holes={visibleHoles}
        scorers={scorers}
        scores={round.scores}
        totalLabel={visibleTotalLabel}
        currentHoleNumber={currentHoleNumber}
        onHolePress={onHolePress}
        teesInPlay={teesInPlay}
        courseTees={round.course.tees ?? []}
        ringColor={colors.cardBg}
      />
      {!hideFinalTotals && (
        <View style={{ marginTop: 14 }}>
          <FinalTotals
            styles={styles}
            allHoles={round.course.holes}
            scorers={scorers}
            scores={round.scores}
            ringColor={colors.cardBg}
            courseTees={round.course.tees ?? []}
            onEditTee={onEditTee}
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
  teesInPlay: Tee[];
  courseTees: Tee[];
  ringColor: string;
};

function NineSection({
  styles,
  holes,
  scorers,
  scores,
  totalLabel,
  currentHoleNumber,
  onHolePress,
  teesInPlay,
  courseTees,
  ringColor,
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
      <Pressable style={styles.cellPressable} onPress={() => onHolePress(holeNumber)}>
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

      {teesInPlay.map((tee) => {
        const sectionTotal = holes.reduce((t, h) => {
          const y = h.yardages?.[tee.id];
          return Number.isFinite(y as number) ? t + (y as number) : t;
        }, 0);
        return (
          <View key={`yd-${tee.id}`} style={[styles.row, styles.tintedRow]}>
            <View style={[styles.teeBar, { backgroundColor: teeSwatch(tee) }]} />
            <View style={[styles.cellName, styles.teeNameCell, styles.cellNameWithBar]}>
              <Text style={styles.teeNameText} numberOfLines={1}>
                {tee.name}
              </Text>
            </View>
            {holes.map((h) => {
              const y = h.yardages?.[tee.id];
              const isCurrent = h.number === currentHoleNumber;
              return (
                <CellWrap key={h.number} holeNumber={h.number}>
                  <Text
                    style={[
                      styles.cellNum,
                      styles.yardText,
                      isCurrent && styles.cellColCurrent,
                    ]}>
                    {Number.isFinite(y as number) ? y : '—'}
                  </Text>
                </CellWrap>
              );
            })}
            <Text style={[styles.cellTotal, styles.yardText]}>
              {sectionTotal > 0 ? sectionTotal.toLocaleString() : '—'}
            </Text>
          </View>
        );
      })}

      {scorers.map((scorer) => {
        const scorerTee = scorer.teeId ? courseTees.find((t) => t.id === scorer.teeId) : undefined;
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
            {scorerTee ? (
              <View style={[styles.teeBar, { backgroundColor: teeSwatch(scorerTee) }]} />
            ) : null}
            <View style={[styles.cellName, scorerTee && styles.cellNameWithBar]}>
              <TeamAvatarCluster members={scorer.members} size="sm" ringColor={ringColor} />
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

      <View style={[styles.row, styles.parRow]}>
        <Text style={[styles.cellName, styles.parText]}>Par</Text>
        {holes.map((h) => {
          const isCurrent = h.number === currentHoleNumber;
          return (
            <CellWrap key={h.number} holeNumber={h.number}>
              <Text
                style={[styles.cellNum, styles.parText, isCurrent && styles.cellColCurrent]}>
                {h.par}
              </Text>
            </CellWrap>
          );
        })}
        <Text style={[styles.cellTotal, styles.parText]}>{parTotal}</Text>
      </View>
    </View>
  );
}

type FinalProps = {
  styles: ReturnType<typeof makeStyles>;
  allHoles: Hole[];
  scorers: Scorer[];
  scores: RoundScore[];
  ringColor: string;
  courseTees: Tee[];
  onEditTee?: (scorerId: string) => void;
};

function FinalTotals({
  styles,
  allHoles,
  scorers,
  scores,
  ringColor,
  courseTees,
  onEditTee,
}: FinalProps) {
  const router = useRouter();
  const parTotal = allHoles.reduce((t, h) => t + h.par, 0);
  const teeById = useMemo(() => {
    const m = new Map<string, Tee>();
    for (const t of courseTees) m.set(t.id, t);
    return m;
  }, [courseTees]);

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

        const scorerTee = scorer.teeId ? teeById.get(scorer.teeId) : undefined;
        const pillEditable = !!onEditTee;
        const showPill = !!scorerTee || pillEditable;

        let pillNode: React.ReactNode = null;
        if (showPill) {
          const swatch = scorerTee ? teeSwatch(scorerTee) : null;
          const pillContent = scorerTee ? (
            <>
              <View style={[styles.finalTeePillDot, { backgroundColor: swatch! }]} />
              <Text style={styles.finalTeePillText} numberOfLines={1}>
                {scorerTee.name}
              </Text>
              {pillEditable ? <Text style={styles.finalTeePillChev}>▾</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.finalTeePillPlaceholder} numberOfLines={1}>
                + Tee
              </Text>
              <Text style={styles.finalTeePillChev}>▾</Text>
            </>
          );
          pillNode = pillEditable ? (
            <Pressable
              style={[styles.finalTeePill, !scorerTee && styles.finalTeePillEmpty]}
              onPress={() => onEditTee!(scorer.id)}>
              {pillContent}
            </Pressable>
          ) : (
            <View style={styles.finalTeePill}>{pillContent}</View>
          );
        }

        return (
          <View key={scorer.id} style={styles.totalRow}>
            <TeamAvatarCluster members={scorer.members} size="md" ringColor={ringColor} />
            {scorer.userId ? (
              <Pressable
                style={styles.totalNameWrap}
                onPress={() =>
                  router.push(`/(tabs)/(search)/profile/${scorer.userId}` as never)
                }
                hitSlop={4}>
                <Text style={[styles.totalName, styles.totalNameLink]} numberOfLines={1}>
                  {scorer.name}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.totalName} numberOfLines={1}>
                {scorer.name}
              </Text>
            )}
            {pillNode}
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
    tabTextActive: { color: colors.primaryDark },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      position: 'relative',
    },
    tintedRow: { backgroundColor: colors.chipBg },
    headRow: { borderBottomColor: colors.border, borderBottomWidth: 1 },
    cellName: {
      width: 60,
      flexDirection: 'row',
      alignItems: 'center',
    },
    cellPressable: { flex: 1 },
    cellNum: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      color: colors.textBody,
    },
    cellEmpty: { color: colors.textMuted, opacity: 0.55 },
    cellOver: { color: colors.accent, fontWeight: '800' },
    cellUnder: { color: colors.primaryDark, fontWeight: '800' },
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
    parText: { color: colors.textMuted, fontWeight: '700' },
    parRow: {
      backgroundColor: colors.chipBg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      borderBottomWidth: 0,
    },
    teeNameCell: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    teeBar: {
      position: 'absolute',
      left: 0,
      top: 3,
      bottom: 3,
      width: 3,
      borderRadius: 2,
    },
    cellNameWithBar: { paddingLeft: 7 },
    teeNameText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    yardText: {
      color: colors.textMuted,
      fontSize: 9.5,
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
    totalName: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: colors.textTitle,
    },
    totalNameWrap: {
      flex: 1,
    },
    totalNameLink: {
      color: colors.primaryDark,
      textDecorationLine: 'underline',
    },
    finalTeePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.chipBg,
      borderRadius: 7,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    finalTeePillEmpty: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
    },
    finalTeePillDot: { width: 8, height: 8, borderRadius: 4 },
    finalTeePillText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textTitle,
    },
    finalTeePillPlaceholder: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    finalTeePillChev: { fontSize: 11, color: colors.textMuted },
    totalScore: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
  });
}
