/**
 * FeedCardLarge — big social-style card used on the Feed tab.
 *
 * Layout faithful to mockup B:
 *
 *   ┌──── colored band (owner's avatar_color gradient) ─────────┐
 *   │ <Course Name>           (big)                             │
 *   │ <City, State>           (small)                           │
 *   │                                                           │
 *   │ <handle> · <relative time>          <Strokes> <±score>    │
 *   └───────────────────────────────────────────────────────────┘
 *   pill row: STROKE/SCRAMBLE  · FRONT 9/BACK 9?  · tee swatches?
 *   caption?    (only when round.caption is set)
 *   ──── WITH / PLAYED / TEAMS · names / "solo round" ────
 *   compact ReadOnlyScorecard (owner's row only, no yardage, no HCP)
 *
 * No tap-through; the card is self-contained. Optional fields are
 * silently skipped when missing.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import {
  formatRelativeTime,
  formatScore,
  getRoundTotalRelative,
} from '@/lib/scoring';
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
 * Naive RGB shading toward white (positive amount) or black (negative).
 * Used to derive light + dark gradient stops from a single owner color.
 */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
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

  // ---- Owner ----
  const ownerProfile = round.ownerUserId ? profileCache[round.ownerUserId] : undefined;
  const ownerLocal = round.ownerUserId
    ? allPlayers.find((p) => p.userId === round.ownerUserId)
    : undefined;
  const ownerHandle =
    ownerProfile?.handle ??
    ownerLocal?.handle ??
    ownerProfile?.displayName ??
    ownerLocal?.displayName ??
    ownerLocal?.nickname ??
    'a friend';
  const ownerColor =
    ownerProfile?.avatarColor ?? ownerLocal?.color ?? DEFAULT_BAND;

  const isScramble = round.scoringRule === 'scramble';

  // ---- Owner-perspective scorer (used for score chip + scorecard row) ----
  const ownerParticipant = (round.participants ?? []).find(
    (p) => p.linkedUserId === round.ownerUserId
  );
  const ownerScorerId = isScramble
    ? ownerParticipant?.teamId
    : ownerParticipant?.participantKey;

  // Total strokes + relative to par from the viewer-perspective scorer.
  const totalRel = ownerScorerId
    ? getRoundTotalRelative(round, ownerScorerId)
    : getRoundTotalRelative(round);
  const totalStrokes = useMemo(() => {
    let sum = 0;
    for (const s of round.scores) {
      if (ownerScorerId && s.scorerId !== ownerScorerId) continue;
      const hole = round.course.holes.find((h) => h.number === s.holeNumber);
      if (!hole) continue;
      // Honor hole-range filtering.
      if (round.holeRange === 'front9' && s.holeNumber > 9) continue;
      if (round.holeRange === 'back9' && s.holeNumber <= 9) continue;
      sum += s.strokes;
    }
    return sum;
  }, [round.scores, round.course.holes, round.holeRange, ownerScorerId]);

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

  // Band gradient stops from owner color.
  const gradientStart = shade(ownerColor, -0.22);
  const gradientEnd = shade(ownerColor, 0.05);

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[gradientStart, gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.band}>
        <Text style={styles.bandCourse} numberOfLines={2}>
          {round.course.name}
        </Text>
        {location ? (
          <Text style={styles.bandLocation} numberOfLines={1}>
            {location}
          </Text>
        ) : null}
        <View style={styles.bandBottomRow}>
          <Text style={styles.bandByLine} numberOfLines={1}>
            {ownerHandle} · {dateLabel}
          </Text>
          <View style={styles.bandScoreBlock}>
            <Text style={styles.bandStrokes}>
              {totalStrokes > 0 ? totalStrokes : '—'}
            </Text>
            {totalStrokes > 0 ? (
              <Text style={styles.bandRel}>{formatScore(totalRel)}</Text>
            ) : null}
          </View>
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

        {round.caption ? <Text style={styles.caption}>{round.caption}</Text> : null}

        <View style={styles.companyRow}>
          <Text style={styles.companyLabel}>{companyLabel}</Text>
          {companyBody}
        </View>

        {round.scores.length > 0 ? (
          <View style={styles.scorecardWrap}>
            <ReadOnlyScorecard round={round} hideFinalTotals />
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

    // ---- Band ----
    band: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
    },
    bandCourse: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '800',
      lineHeight: 24,
    },
    bandLocation: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12.5,
      marginTop: 2,
      fontWeight: '500',
    },
    bandBottomRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 14,
    },
    bandByLine: {
      flex: 1,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 12.5,
      fontWeight: '700',
    },
    bandScoreBlock: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    bandStrokes: {
      color: '#ffffff',
      fontSize: 28,
      fontWeight: '800',
      lineHeight: 30,
    },
    bandRel: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 14,
      fontWeight: '800',
    },

    // ---- Body ----
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

    scorecardWrap: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
}
