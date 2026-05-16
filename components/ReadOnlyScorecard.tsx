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

import { AvatarMember, TeamAvatarCluster } from '@/components/TeamAvatarCluster';
import { resolveParticipantIdentity } from '@/lib/participantIdentity';
import { formatScore } from '@/lib/scoring';
import {
  buildNameSegments,
  flattenSegments,
  type NameSegment,
} from '@/lib/scorerNames';
import { firstName } from '@/lib/userIdentity';
import { useAccount } from '@/state/AccountContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Hole, Round, RoundParticipant, RoundScore, Tee } from '@/types/golf';

type Scorer = {
  id: string;
  /** Plain display string. Concatenation of `nameSegments`; kept as a
   *  fallback for callers / sheets that need a raw label. */
  name: string;
  color: string;
  teeId?: string;
  /**
   * Avatar cluster members for this scorer's left-column / final-row
   * cluster. Stroke = one entry (the scorer themself); scramble = one
   * entry per team member, in `round.participants` order.
   */
  members: AvatarMember[];
  /**
   * Renderable name segments. For stroke rows this is one segment per
   * row; for scramble teams it's one per member interleaved with
   * separator segments (" & " / ", "). Linked segments are tappable
   * with `onPressLinkedName`.
   */
  nameSegments: NameSegment[];
};

type Props = {
  round: Round;
  /** Highlight the column for this hole number. */
  currentHoleNumber?: number;
  /** When set, tapping any cell in a column calls back with that hole number. */
  onHolePress?: (holeNumber: number) => void;
  /** Suppress the bottom FINAL totals section (live scoring uses this). */
  hideFinalTotals?: boolean;
  /**
   * When provided, names of scorers linked to a real account (including
   * the signed-in user) become tappable. The callback receives the
   * navigation target id (other users' `userId`, self's `defaultPlayerId`).
   * Routing-agnostic: this component never imports `router`; the caller
   * decides which tab stack to push onto.
   */
  onPressLinkedName?: (targetId: string) => void;
  /**
   * When provided, the tee swatch+name pill rendered in the Final box
   * becomes a `Pressable` with a chevron. The callback receives the
   * scorer id (participantKey for stroke / teamId for scramble). When
   * absent the pill is read-only.
   */
  onEditTee?: (scorerId: string) => void;
};

const TEE_COLOR_HEX: Record<string, string> = {
  black: '#1a1a1a',
  blue: '#4a90e2',
  white: '#ddd6c4',
  gold: '#c9a64a',
  red: '#d54848',
  green: '#7cb342',
  yellow: '#f5d020',
  burgundy: '#722f37',
};

function teeSwatchColor(tee: { name: string; color?: string }): string {
  if (tee.color) {
    const known = TEE_COLOR_HEX[tee.color.toLowerCase()];
    if (known) return known;
    if (tee.color.startsWith('#')) return tee.color;
  }
  return TEE_COLOR_HEX[tee.name.toLowerCase()] ?? '#888';
}

export function ReadOnlyScorecard({
  round,
  currentHoleNumber,
  onHolePress,
  hideFinalTotals,
  onPressLinkedName,
  onEditTee,
}: Props) {
  const { colors } = useTheme();
  const { allPlayers, defaultPlayerId } = usePlayers();
  const { account } = useAccount();
  const { profileCache } = useSocial();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isScramble = round.scoringRule === 'scramble';

  // Scramble stores tee selections on each team member participant, even
  // though the UI picks them once per team. The yardage rows use the union
  // of all participant teeIds, and team scorer rows derive their marker
  // from the most common teeId among that team's members.
  const teeIdsInPlay: string[] = useMemo(() => {
    const set = new Set<string>();
    for (const p of round.participants ?? []) {
      if (p.teeId) set.add(p.teeId);
    }
    return [...set];
  }, [round.participants]);

  const teamTeeIdByTeamId = useMemo(() => {
    const byTeam = new Map<string, Map<string, number>>();
    for (const p of round.participants ?? []) {
      if (!p.teamId || !p.teeId) continue;
      const counts = byTeam.get(p.teamId) ?? new Map<string, number>();
      counts.set(p.teeId, (counts.get(p.teeId) ?? 0) + 1);
      byTeam.set(p.teamId, counts);
    }

    const result = new Map<string, string>();
    for (const [teamId, counts] of byTeam) {
      const [teeId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (teeId) result.set(teamId, teeId);
    }
    return result;
  }, [round.participants]);

  const teesInPlay = useMemo(() => {
    const courseTees = round.course.tees ?? [];
    const byId = new Map(courseTees.map((t) => [t.id, t]));
    const tees = teeIdsInPlay
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      // Only render rows for tees that actually have per-hole yardages
      // somewhere in the course; tees declared in metadata but missing
      // hole data are silently skipped.
      .filter((t) =>
        round.course.holes.some(
          (h) => h.yardages && Number.isFinite(h.yardages[t.id])
        )
      );
    // Longest first; tees missing totalYardage sink to the bottom.
    return tees.sort((a, b) => (b.totalYardage ?? -1) - (a.totalYardage ?? -1));
  }, [teeIdsInPlay, round.course.tees, round.course.holes]);

  const hasHcp = useMemo(
    () => round.course.holes.some((h) => h.handicapIndex != null),
    [round.course.holes]
  );

  const scorers: Scorer[] = useMemo(() => {
    // First name of the signed-in account, used wherever we'd previously
    // have hard-coded the literal `'You'`. The display falls back to the
    // full display name when first-name extraction yields empty, and to
    // a final `'You'` only when there's no signed-in account at all.
    const selfLabel =
      firstName(account?.displayName) || account?.displayName || 'You';

    const nameDeps = {
      account,
      profileCache,
      allPlayers,
      defaultPlayerId,
    };

    // Resolve one participant to {id, name, color}. Shared between the
    // stroke scorers path (one scorer = one participant) and the
    // scramble team-members path (each team is composed of multiple
    // participants). Mirrors the linked-vs-local + roster-fallback
    // logic used by the existing scorer rendering.
    const resolveMember = (p: RoundParticipant): AvatarMember => {
      const identity = resolveParticipantIdentity(p, {
        account,
        profileCache,
        allPlayers,
      });
      const isMe = !!account?.userId && p.linkedUserId === account.userId;
      let displayName: string;
      let color: string | undefined;
      if (isMe) {
        displayName = selfLabel;
        color = identity.color;
      } else if (p.linkedUserId || p.localDisplayName) {
        displayName = identity.displayName;
        color = identity.color;
      } else {
        const roster = allPlayers.find((q) => q.id === p.participantKey);
        displayName =
          roster?.displayName ?? roster?.nickname ?? identity.displayName;
        color = roster?.color ?? identity.color;
      }
      return {
        id: p.participantKey,
        name: displayName,
        color: color ?? colors.primary,
      };
    };

    let raw: Scorer[];
    if (isScramble && round.teams) {
      raw = round.teams.map((t) => {
        const teamParticipants = (round.participants ?? []).filter(
          (p) => p.teamId === t.id
        );
        const teamMembers = teamParticipants.map(resolveMember);
        const nameSegments = buildNameSegments(teamParticipants, nameDeps);
        return {
          id: t.id,
          name: flattenSegments(nameSegments),
          color: t.color,
          teeId: teamTeeIdByTeamId.get(t.id),
          members: teamMembers,
          nameSegments,
        };
      });
    } else if (round.participants && round.participants.length > 0) {
      raw = round.participants.map((p) => {
        const member = resolveMember(p);
        const nameSegments = buildNameSegments([p], nameDeps);
        return {
          id: p.participantKey,
          name: flattenSegments(nameSegments) || member.name,
          color: member.color,
          teeId: p.teeId,
          members: [member],
          nameSegments,
        };
      });
    } else {
      // Legacy fallback for rounds with no `participants[]`. We don't
      // have enough metadata to build link segments here, so each row
      // becomes a single plain (unlinked) segment.
      raw = (round.playerIds ?? []).map((pid) => {
        const local = allPlayers.find((p) => p.id === pid);
        const isMe = !!local?.userId && account?.userId === local.userId;
        const name = isMe
          ? selfLabel
          : firstName(local?.displayName ?? local?.nickname) ||
            local?.displayName ||
            local?.nickname ||
            'Player';
        const color = local?.color ?? colors.primary;
        return {
          id: pid,
          name,
          color,
          members: [{ id: pid, name, color }],
          nameSegments: [
            { text: name, linked: false, linkTargetId: null, color },
          ],
        };
      });
    }
    return raw;
  }, [round, isScramble, teamTeeIdByTeamId, account, profileCache, allPlayers, defaultPlayerId, colors.primary]);

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
        teesInPlay={teesInPlay}
        courseTees={round.course.tees ?? []}
        showHcp={hasHcp}
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
            onPressLinkedName={onPressLinkedName}
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
  /** Tees to render yardage rows for, longest-first. */
  teesInPlay: Array<{ id: string; name: string; color?: string; totalYardage?: number }>;
  /**
   * Full set of course-defined tees, used for scorer-row tee bars even
   * when the tee has no per-hole yardages (and therefore is excluded
   * from teesInPlay).
   */
  courseTees: Array<{ id: string; name: string; color?: string }>;
  /** Whether to render the HCP row (suppressed when no hole carries handicap_index). */
  showHcp: boolean;
  /** Background color for the scorer-avatar ring; pass the surface the
   *  row sits on so the ring blends with the card. */
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
  showHcp,
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
      <Pressable
        style={styles.cellPressable}
        onPress={() => onHolePress(holeNumber)}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={styles.section}>
      {/* HOLE (header row) */}
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

      {/* TEE YARDAGES — one row per tee in play, longest first. */}
      {teesInPlay.map((tee) => {
        const sectionTotal = holes.reduce((t, h) => {
          const y = h.yardages?.[tee.id];
          return Number.isFinite(y as number) ? t + (y as number) : t;
        }, 0);
        return (
          <View key={`yd-${tee.id}`} style={[styles.row, styles.tintedRow]}>
            <View
              style={[styles.teeBar, { backgroundColor: teeSwatchColor(tee) }]}
            />
            <View
              style={[
                styles.cellName,
                styles.teeNameCell,
                styles.cellNameWithBar,
              ]}>
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

      {/* HCP — single row. */}
      {showHcp && (
        <View style={[styles.row, styles.tintedRow]}>
          <Text style={[styles.cellName, styles.hcpText]}>HCP</Text>
          {holes.map((h) => {
            const isCurrent = h.number === currentHoleNumber;
            return (
              <CellWrap key={h.number} holeNumber={h.number}>
                <Text
                  style={[
                    styles.cellNum,
                    styles.hcpText,
                    isCurrent && styles.cellColCurrent,
                  ]}>
                  {h.handicapIndex ?? '—'}
                </Text>
              </CellWrap>
            );
          })}
          <Text style={[styles.cellTotal, styles.hcpText]} />
        </View>
      )}

      {/* SCORES — one row per scorer. */}
      {scorers.map((scorer) => {
        // Look the scorer's tee up against the FULL course tee list,
        // not the filtered yardage-having `teesInPlay` set — we want
        // the left-edge bar to render even when the tee has no
        // per-hole yardages (and therefore no yardage row above).
        const scorerTee = scorer.teeId
          ? courseTees.find((t) => t.id === scorer.teeId)
          : undefined;
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
              <View
                style={[
                  styles.teeBar,
                  { backgroundColor: teeSwatchColor(scorerTee) },
                ]}
              />
            ) : null}
            <View
              style={[
                styles.cellName,
                scorerTee && styles.cellNameWithBar,
              ]}>
              <TeamAvatarCluster
                members={scorer.members}
                size="sm"
                ringColor={ringColor}
              />
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

      {/* PAR — anchored at the bottom of the section, like real cards. */}
      <View style={[styles.row, styles.parRow]}>
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
    </View>
  );
}

type FinalProps = {
  styles: ReturnType<typeof makeStyles>;
  allHoles: Hole[];
  scorers: Scorer[];
  scores: RoundScore[];
  /** Background color for the scorer-avatar ring; pass the surface the
   *  row sits on so the ring blends with the card. */
  ringColor: string;
  /** Full course tee list, used to resolve each scorer's tee pill. */
  courseTees: Tee[];
  /** Tap handler for linked scorer names; absent → plain text. */
  onPressLinkedName?: (targetId: string) => void;
  /** Tap handler for the tee pill; absent → read-only pill. */
  onEditTee?: (scorerId: string) => void;
};

function FinalTotals({
  styles,
  allHoles,
  scorers,
  scores,
  ringColor,
  courseTees,
  onPressLinkedName,
  onEditTee,
}: FinalProps) {
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

        const scorerTee = scorer.teeId ? teeById.get(scorer.teeId) : undefined;
        const showPill = !!scorerTee;
        const pillEditable = !!onEditTee;

        const nameNode = (
          <Text style={styles.totalName} numberOfLines={1}>
            {scorer.nameSegments.map((seg, i) => {
              const tappable = seg.linked && seg.linkTargetId && onPressLinkedName;
              if (tappable) {
                return (
                  <Text
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    onPress={() => onPressLinkedName!(seg.linkTargetId!)}
                    suppressHighlighting
                    style={styles.totalNameLinked}>
                    {seg.text}
                  </Text>
                );
              }
              // eslint-disable-next-line react/no-array-index-key
              return <Text key={i}>{seg.text}</Text>;
            })}
          </Text>
        );

        let pillNode: React.ReactNode = null;
        if (showPill && scorerTee) {
          const swatch = teeSwatchColor(scorerTee);
          const pillContent = (
            <>
              <View style={[styles.finalTeePillDot, { backgroundColor: swatch }]} />
              <Text style={styles.finalTeePillText} numberOfLines={1}>
                {scorerTee.name}
              </Text>
              {pillEditable ? (
                <Text style={styles.finalTeePillChev}>▾</Text>
              ) : null}
            </>
          );
          pillNode = pillEditable ? (
            <Pressable
              style={styles.finalTeePill}
              onPress={() => onEditTee!(scorer.id)}>
              {pillContent}
            </Pressable>
          ) : (
            <View style={styles.finalTeePill}>{pillContent}</View>
          );
        }

        return (
          <View key={scorer.id} style={styles.totalRow}>
            <TeamAvatarCluster
              members={scorer.members}
              size="md"
              ringColor={ringColor}
            />
            {nameNode}
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
      // Anchor for the absolutely-positioned tee bar (Option C).
      position: 'relative',
    },
    tintedRow: {
      backgroundColor: colors.chipBg,
    },
    headRow: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
    },
    cellName: {
      // 60px fits a 4-member sm cluster (54px wide at 18px avatar / 6px
      // overlap) with a touch of right-side breathing room. When the
      // row has a tee bar, `cellNameWithBar` adds 7px of left padding;
      // that still leaves the cluster well inside the column for
      // typical scramble teams of 2.
      width: 60,
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
    parRow: {
      backgroundColor: colors.chipBg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      borderBottomWidth: 0,
    },
    teeNameCell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    teeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      flexShrink: 0,
    },
    teeDotInline: {
      marginRight: 5,
    },
    // Option C: 3px colored stripe pinned to the left edge of any row
    // that's associated with a tee (yardage rows + scorer rows with a
    // teeId). The row is `position: relative` so this absolute bar
    // overlays at the left without disturbing the cell flex layout.
    teeBar: {
      position: 'absolute',
      left: 0,
      top: 3,
      bottom: 3,
      width: 3,
      borderRadius: 2,
    },
    cellNameWithBar: {
      paddingLeft: 7,
    },
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
    hcpText: {
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
    totalNamePressable: {
      flex: 1,
    },
    totalNameLinked: {
      fontWeight: '800',
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
    finalTeePillDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    finalTeePillText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textTitle,
    },
    finalTeePillChev: {
      fontSize: 11,
      color: colors.textMuted,
    },
    totalScore: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
  });
}
