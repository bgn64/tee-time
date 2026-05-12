/**
 * FeedCardLarge — big social-style card used on the Feed tab.
 *
 * Layout:
 *   1. Bold colored band header (gradient using the owner's avatar
 *      color). Course name + location on the left, relative time +
 *      big +/− score on the right.
 *   2. Pills row — format (STROKE / SCRAMBLE), optional range pill
 *      (only when range !== 'all'), optional tee swatch pills (only
 *      when at least one participant has a teeId set, deduplicated by
 *      tee id).
 *   3. Optional caption block — hidden entirely when round.caption is
 *      empty.
 *   4. "With" / "Played" / "Teams" row — owner's avatar/name reads
 *      live from profileCache, other participants from roster + local
 *      snapshots. Solo rounds show "Played solo".
 *   5. Hole sparkline — one mini bar per active hole, color-coded by
 *      score relative to par (eagle/birdie/par/bogey/double+). Uses
 *      the viewer-perspective scorer (owner in stroke, owner's team
 *      in scramble). Hidden when no per-hole scores are available.
 *
 * No tap-through — the card is self-contained. Optional fields are
 * silently skipped when missing.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatRelativeTime, formatScore, holesInRange } from '@/lib/scoring';
import { useTheme } from '@/state/ThemeContext';
import type { Player, Round, RoundParticipant } from '@/types/golf';

type ProfileCacheEntry = {
  displayName: string;
  handle: string;
  avatarColor: string;
  userId: string;
};

type Props = {
  round: Round;
  myUserId?: string;
  allPlayers: Player[];
  getPlayer: (id: string) => Player | undefined;
  profileCache: Record<string, ProfileCacheEntry>;
};

const DEFAULT_BAND = '#7cb342';

/**
 * Dark / light variants of a hex color for the gradient stops.
 * Naive shading by clamping each RGB channel toward black/white.
 */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  if (amount >= 0) {
    // Toward white.
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    // Toward black.
    const a = -amount;
    r = Math.round(r * (1 - a));
    g = Math.round(g * (1 - a));
    b = Math.round(b * (1 - a));
  }
  const hh = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hh(r)}${hh(g)}${hh(b)}`;
}

function teeSwatchColor(name: string | undefined, color: string | undefined): string {
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) return color;
  const key = (name ?? '').toLowerCase();
  if (key.includes('black')) return '#000000';
  if (key.includes('blue')) return '#1a73e8';
  if (key.includes('white')) return '#ffffff';
  if (key.includes('gold') || key.includes('yellow')) return '#fdd835';
  if (key.includes('red')) return '#e53935';
  if (key.includes('green')) return '#388e3c';
  if (key.includes('burgundy') || key.includes('maroon')) return '#7b1d3a';
  return '#9e9e9e';
}

export function FeedCardLarge({
  round,
  myUserId,
  allPlayers,
  getPlayer,
  profileCache,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Owner display data.
  const ownerProfile = round.ownerUserId ? profileCache[round.ownerUserId] : undefined;
  const ownerLocal = round.ownerUserId
    ? allPlayers.find((p) => p.userId === round.ownerUserId)
    : undefined;
  const ownerName =
    ownerProfile?.displayName ?? ownerLocal?.displayName ?? ownerLocal?.nickname ?? 'A friend';
  const ownerHandle = ownerProfile?.handle ?? ownerLocal?.handle;
  const ownerColor =
    ownerProfile?.avatarColor ?? ownerLocal?.color ?? DEFAULT_BAND;
  const ownerInitial = ownerName[0]?.toUpperCase() ?? '?';

  const isScramble = round.scoringRule === 'scramble';

  // Score = viewer-perspective. Stroke uses the owner's per-scorer total;
  // scramble shows the owner's team total when we can find one, else the
  // overall round total.
  const ownerParticipant = (round.participants ?? []).find(
    (p) => p.linkedUserId === round.ownerUserId
  );
  const ownerScorerId = isScramble
    ? ownerParticipant?.teamId
    : ownerParticipant?.participantKey;

  // Per-hole relative total used by both the score chip and sparkline.
  const activeHoles = useMemo(
    () => holesInRange(round.course.holes, round.holeRange),
    [round.course.holes, round.holeRange]
  );

  const perHoleRel = useMemo(() => {
    if (!ownerScorerId) return [] as Array<{ hole: number; rel: number }>;
    const byHole = new Map<number, number>();
    for (const s of round.scores) {
      if (s.scorerId !== ownerScorerId) continue;
      const hole = round.course.holes.find((h) => h.number === s.holeNumber);
      if (!hole) continue;
      byHole.set(s.holeNumber, s.strokes - hole.par);
    }
    return activeHoles
      .map((h) => {
        const rel = byHole.get(h.number);
        return rel == null ? null : { hole: h.number, rel };
      })
      .filter((v): v is { hole: number; rel: number } => v !== null);
  }, [round.scores, round.course.holes, activeHoles, ownerScorerId]);

  const totalRel = perHoleRel.reduce((sum, p) => sum + p.rel, 0);
  const totalStrokes = perHoleRel.reduce((sum, p) => {
    const hole = round.course.holes.find((h) => h.number === p.hole);
    return sum + (hole ? hole.par + p.rel : 0);
  }, 0);

  const dateLabel = formatRelativeTime(round.completedAt ?? round.startedAt);
  const location = round.course.location;

  // ---- Pills ----
  const showRangePill = round.holeRange !== 'all';
  const rangePillLabel =
    round.holeRange === 'front9' ? 'FRONT 9' : round.holeRange === 'back9' ? 'BACK 9' : '';

  type TeeChip = { id: string; name: string; color: string };
  const teesInPlay: TeeChip[] = useMemo(() => {
    const teeIds = new Set<string>();
    for (const p of round.participants ?? []) {
      if (p.teeId) teeIds.add(p.teeId);
    }
    if (teeIds.size === 0) return [];
    const out: TeeChip[] = [];
    for (const tee of round.course.tees ?? []) {
      if (!teeIds.has(tee.id)) continue;
      out.push({
        id: tee.id,
        name: tee.name,
        color: teeSwatchColor(tee.name, tee.color),
      });
    }
    return out;
  }, [round.participants, round.course.tees]);

  // ---- With / Played / Teams line ----
  const resolveParticipantName = (p: RoundParticipant): string => {
    if (p.linkedUserId) {
      if (myUserId && p.linkedUserId === myUserId) return 'you';
      const prof = profileCache[p.linkedUserId];
      if (prof) return prof.displayName;
      const rosterMatch = getPlayer(p.participantKey);
      return rosterMatch?.displayName ?? rosterMatch?.nickname ?? 'Friend';
    }
    return p.localDisplayName ?? 'Player';
  };
  const resolveParticipantColor = (p: RoundParticipant): string => {
    if (p.linkedUserId) {
      const prof = profileCache[p.linkedUserId];
      if (prof) return prof.avatarColor;
      const rosterMatch = getPlayer(p.participantKey);
      return rosterMatch?.color ?? colors.primary;
    }
    return p.localDisplayColor ?? colors.primary;
  };

  const otherParticipants = (round.participants ?? []).filter(
    (p) => p.linkedUserId !== round.ownerUserId
  );

  let companyLabel: string;
  let companyBody: React.ReactNode;
  if (isScramble && round.teams && round.teams.length > 1) {
    companyLabel = 'Teams';
    companyBody = (
      <Text style={styles.companyText} numberOfLines={2}>
        {round.teams.map((t) => t.name).join(' vs. ')}
      </Text>
    );
  } else if (otherParticipants.length === 0) {
    companyLabel = 'Played';
    companyBody = <Text style={styles.companyText}>solo round</Text>;
  } else {
    companyLabel = 'With';
    const names = otherParticipants.map(resolveParticipantName);
    companyBody = (
      <>
        <View style={styles.companyAvatars}>
          {otherParticipants.slice(0, 4).map((p, i) => (
            <View
              key={p.participantKey}
              style={[
                styles.companyAvatar,
                {
                  backgroundColor: resolveParticipantColor(p),
                  marginLeft: i === 0 ? 0 : -6,
                  borderColor: colors.cardBg,
                },
              ]}>
              <Text style={styles.companyAvatarText}>
                {resolveParticipantName(p)[0]?.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.companyText} numberOfLines={2}>
          {names.join(', ')}
        </Text>
      </>
    );
  }

  // ---- Sparkline ----
  const sparkBars = perHoleRel.length > 0;

  // Band gradient stops derived from owner color.
  const gradientStart = shade(ownerColor, -0.18);
  const gradientEnd = shade(ownerColor, 0.05);

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[gradientStart, gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.band}>
        <View style={styles.bandTopRow}>
          <View style={styles.ownerChip}>
            <View style={[styles.ownerAv, { backgroundColor: ownerColor }]}>
              <Text style={styles.ownerAvText}>{ownerInitial}</Text>
            </View>
            <View style={styles.ownerNameBlock}>
              <Text style={styles.ownerName} numberOfLines={1}>
                {ownerName}
              </Text>
              {ownerHandle ? (
                <Text style={styles.ownerHandle} numberOfLines={1}>
                  @{ownerHandle}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.bandWhen}>{dateLabel}</Text>
        </View>
        <Text style={styles.bandCourse} numberOfLines={2}>
          {round.course.name}
        </Text>
        {location ? (
          <Text style={styles.bandLocation} numberOfLines={1}>
            {location}
          </Text>
        ) : null}
        <View style={styles.bandScoreRow}>
          <Text style={styles.bandScoreLine}>
            {totalStrokes > 0 ? `${totalStrokes}` : '—'}
            <Text style={styles.bandScoreSuffix}>
              {totalStrokes > 0 ? `  ${formatScore(totalRel)}` : ''}
            </Text>
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.pillsRow}>
          <View style={[styles.pill, styles.pillAccent]}>
            <Text style={styles.pillAccentText}>
              {isScramble ? 'SCRAMBLE' : 'STROKE'}
            </Text>
          </View>
          {showRangePill ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{rangePillLabel}</Text>
            </View>
          ) : null}
          {teesInPlay.map((tee) => (
            <View key={tee.id} style={styles.pill}>
              <View
                style={[
                  styles.teeSwatch,
                  {
                    backgroundColor: tee.color,
                    borderColor:
                      tee.color.toLowerCase() === '#ffffff' ? colors.border : 'transparent',
                  },
                ]}
              />
              <Text style={styles.pillText}>{tee.name}</Text>
            </View>
          ))}
        </View>

        {round.caption ? (
          <Text style={styles.caption}>{round.caption}</Text>
        ) : null}

        <View style={styles.companyRow}>
          <Text style={styles.companyLabel}>{companyLabel}</Text>
          {companyBody}
        </View>

        {sparkBars ? (
          <View style={styles.sparkWrap}>
            {perHoleRel.map(({ hole, rel }) => {
              let cls: keyof ReturnType<typeof makeStyles> = 'sparkPar';
              if (rel <= -2) cls = 'sparkEagle';
              else if (rel === -1) cls = 'sparkBirdie';
              else if (rel === 0) cls = 'sparkPar';
              else if (rel === 1) cls = 'sparkBogey';
              else if (rel >= 2) cls = 'sparkDouble';
              return (
                <View
                  key={hole}
                  style={[
                    styles.sparkBar,
                    styles[cls] as object,
                    activeHoles.length > 9 && styles.sparkBarTight,
                  ]}
                />
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: 14,
    },
    band: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
    },
    bandTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 10,
    },
    ownerChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    ownerAv: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ownerAvText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
    ownerNameBlock: {
      flex: 1,
      minWidth: 0,
    },
    ownerName: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
    ownerHandle: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
    bandWhen: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    bandCourse: {
      color: '#ffffff',
      fontSize: 19,
      fontWeight: '800',
      lineHeight: 23,
    },
    bandLocation: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12,
      marginTop: 2,
      fontWeight: '500',
    },
    bandScoreRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 10,
    },
    bandScoreLine: {
      color: '#ffffff',
      fontSize: 30,
      fontWeight: '800',
      lineHeight: 32,
    },
    bandScoreSuffix: {
      fontSize: 15,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.85)',
    },

    body: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
    },
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.chipBg,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 6,
    },
    pillText: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.textTitle,
    },
    pillAccent: {
      backgroundColor: colors.primary,
    },
    pillAccentText: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: '#ffffff',
    },
    teeSwatch: {
      width: 9,
      height: 9,
      borderRadius: 2,
      borderWidth: 1,
    },

    caption: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textBody,
      lineHeight: 19,
    },

    companyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
    },
    companyLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    companyAvatars: {
      flexDirection: 'row',
    },
    companyAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    companyAvatarText: {
      color: '#ffffff',
      fontSize: 9,
      fontWeight: '800',
    },
    companyText: {
      flex: 1,
      fontSize: 13,
      color: colors.textBody,
      fontWeight: '600',
    },

    sparkWrap: {
      flexDirection: 'row',
      gap: 2,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sparkBar: {
      flex: 1,
      height: 22,
      borderRadius: 2,
    },
    sparkBarTight: {
      height: 18,
    },
    sparkPar:    { backgroundColor: colors.chipBg },
    sparkBirdie: { backgroundColor: '#c7e7c8' },
    sparkEagle:  { backgroundColor: '#5cb85c' },
    sparkBogey:  { backgroundColor: '#f6e0c2' },
    sparkDouble: { backgroundColor: '#f3a06b' },
  });
}
