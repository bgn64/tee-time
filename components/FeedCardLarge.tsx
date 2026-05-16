/**
 * FeedCardLarge — big social-style card used on the Feed tab.
 *
 * Layout faithful to the May 2026 scorecard-uniformity pass:
 *
 *   ┌──── colored band (owner's avatar_color gradient) ─────────┐
 *   │ <Course Name>           (big)                             │
 *   │ <City, State>           (small)                           │
 *   │ [STROKE/SCRAMBLE] [FRONT 9?]                              │  ← format pill
 *   │ <handle> · <relative time>          <Strokes> <±score>    │
 *   └───────────────────────────────────────────────────────────┘
 *   ReadOnlyScorecard (with finals)
 *
 * The format pill moved up into the band header so the card matches
 * the scoring + round-detail screens visually. The old tee swatch row,
 * caption, and "With/Played/Teams" row were removed in the same pass
 * to keep the card uncluttered — the scorecard + finals carry the
 * informational load now.
 *
 * No tap-through; the card is self-contained.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import {
  formatRelativeTime,
  formatScore,
  getRoundTotalRelative,
} from '@/lib/scoring';
import { useTheme } from '@/state/ThemeContext';
import type { Player, Round } from '@/types/golf';

type ProfileCacheEntry = {
  displayName: string;
  handle: string;
  avatarColor: string;
  userId: string;
};

type Props = {
  round: Round;
  allPlayers: Player[];
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

export function FeedCardLarge({
  round,
  allPlayers,
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

  // ---- Owner-perspective scorer (used for the band score chip) ----
  const ownerParticipant = (round.participants ?? []).find(
    (p) => p.linkedUserId === round.ownerUserId
  );
  const ownerScorerId = isScramble
    ? ownerParticipant?.teamId
    : ownerParticipant?.participantKey;

  // Total strokes + relative to par from the owner-perspective scorer.
  const totalRel = ownerScorerId
    ? getRoundTotalRelative(round, ownerScorerId)
    : getRoundTotalRelative(round);
  const totalStrokes = useMemo(() => {
    let sum = 0;
    for (const s of round.scores) {
      if (ownerScorerId && s.scorerId !== ownerScorerId) continue;
      const hole = round.course.holes.find((h) => h.number === s.holeNumber);
      if (!hole) continue;
      if (round.holeRange === 'front9' && s.holeNumber > 9) continue;
      if (round.holeRange === 'back9' && s.holeNumber <= 9) continue;
      sum += s.strokes;
    }
    return sum;
  }, [round.scores, round.course.holes, round.holeRange, ownerScorerId]);

  const dateLabel = formatRelativeTime(round.completedAt ?? round.startedAt);
  const location = round.course.location;

  const showRangePill = round.holeRange !== 'all';
  const rangePillLabel =
    round.holeRange === 'front9' ? 'FRONT 9' : round.holeRange === 'back9' ? 'BACK 9' : '';

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
        <View style={styles.bandPillRow}>
          <View style={styles.bandPill}>
            <Text style={styles.bandPillText}>
              {isScramble ? 'SCRAMBLE' : 'STROKE'}
            </Text>
          </View>
          {showRangePill ? (
            <View style={styles.bandPill}>
              <Text style={styles.bandPillText}>{rangePillLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bandBottomRow}>
          <Text style={styles.bandByLine} numberOfLines={1}>
            {ownerHandle} · {dateLabel}
          </Text>
          <View style={styles.bandScoreBlock}>
            <Text style={styles.bandRel}>
              {totalStrokes > 0 ? formatScore(totalRel) : '—'}
            </Text>
            {totalStrokes > 0 ? (
              <Text style={styles.bandStrokes}>{totalStrokes}</Text>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      {round.scores.length > 0 ? (
        <View style={styles.body}>
          <ReadOnlyScorecard
            round={round}
            onPressLinkedName={(id) =>
              router.push({
                pathname: '/(tabs)/(feed)/player/[id]',
                params: { id },
              })
            }
          />
        </View>
      ) : null}
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
    bandPillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    // Pills rendered on the gradient band — semi-transparent white so
    // they read on any owner color. Matches the visual weight of the
    // chipBg/primaryDark pill used on the scoring + round-detail
    // screens (where the surface is plain white).
    bandPill: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    bandPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: '#ffffff',
    },
    bandBottomRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 12,
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
      color: 'rgba(255,255,255,0.85)',
      fontSize: 14,
      fontWeight: '700',
    },
    bandRel: {
      color: '#ffffff',
      fontSize: 30,
      fontWeight: '800',
      lineHeight: 32,
    },

    // ---- Body ----
    body: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
    },
  });
}
