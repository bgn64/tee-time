/**
 * FeedCardLarge — large social-style card for one friend's round on
 * the feed.
 *
 * Layout (ported from the destination tee-time app, stroke-only):
 *
 *   ┌──── colored band (owner's avatar_color gradient) ─────────┐
 *   │ <Course Name>                                             │
 *   │ <City, State>                                             │
 *   │ [STROKE] [18 HOLES] [● IN PROGRESS]?                      │
 *   │ <handle> · <relative time>          <±score>  THRU N?     │
 *   └───────────────────────────────────────────────────────────┘
 *   ReadOnlyScorecard (with FinalTotals hidden on live cards)
 *
 * Live cards (no `completedAt`):
 *   - A pulsing "● IN PROGRESS" pill on the band pill row.
 *   - The big chip shows the owner's running ±score with a "THRU N"
 *     subline.
 *   - FinalTotals are hidden (they'd be misleading mid-round).
 *   - The "X ago" label reflects the time **this device** last
 *     received an update for the round, not the time the scorer
 *     wrote it. If you're offline, the label keeps ticking forward
 *     ("3m ago" → "1h ago" → "Yesterday") honestly reflecting that
 *     your data is stale.
 *
 * The tap-to-profile navigation is owned by the caller via
 * `onPressParticipant`. The scorecard surfaces tap targets in both
 * the main grid's avatar column (so live cards have a target even
 * with FinalTotals hidden) and the FinalTotals row.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { ReadOnlyScorecard } from '@/components/scoring/ReadOnlyScorecard';
import {
  formatRelativeTime,
  formatScore,
  getRoundTotalRelative,
  getScorerProgress,
  holeRangeLabel,
} from '@/library/golf/scoring';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  onPressParticipant?: (userId: string) => void;
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

export function FeedCardLarge({ round, onPressParticipant }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const ownerUserId = round.ownerUserId ?? '';
  const { profile: ownerProfile } = useProfile(ownerUserId || null);

  const ownerHandle = ownerProfile?.handle
    ? `@${ownerProfile.handle}`
    : ownerProfile?.displayName ?? 'a friend';
  const ownerColor = ownerProfile?.avatarColor ?? DEFAULT_BAND;

  const isInProgress = !round.completedAt;

  // Owner-perspective scorer: the band's big chip shows the owner's
  // own running total. For our stroke-only model the scorer id IS
  // the participantKey, which is `user:{ownerUserId}`.
  const ownerScorerId = userParticipantKey(ownerUserId);

  const totalRel = getRoundTotalRelative(round, ownerScorerId);
  let totalStrokes = 0;
  for (const s of round.scores) {
    if (s.scorerId !== ownerScorerId) continue;
    const hole = round.course.holes.find((h) => h.number === s.holeNumber);
    if (!hole) continue;
    if (round.holeRange === 'front9' && s.holeNumber > 9) continue;
    if (round.holeRange === 'back9' && s.holeNumber <= 9) continue;
    totalStrokes += s.strokes;
  }

  const { thruCount } = getScorerProgress(round, ownerScorerId);

  // Device-local sync-arrival stamp: bump it whenever the round's
  // identity (its scores or completion state) changes on this
  // device. Used for the live-card "X ago" label so the relative
  // time honestly reflects when WE last heard about the round —
  // never the scorer's clock time, which would imply data
  // freshness we can't guarantee.
  //
  // Uses the "adjust state during render" pattern instead of a
  // useEffect setter so we don't trigger a cascading re-render
  // every time the identity ticks.
  const identity = round.scores.length + '|' + (round.completedAt ?? '');
  const [prevIdentity, setPrevIdentity] = useState(identity);
  const [lastReceivedAt, setLastReceivedAt] = useState(() =>
    new Date().toISOString()
  );
  if (prevIdentity !== identity) {
    setPrevIdentity(identity);
    setLastReceivedAt(new Date().toISOString());
  }

  // For completed rounds we surface the scorer's completion time
  // (an immutable, meaningful moment — "this round was finished
  // at HH:MM"). For in-progress rounds we use the device-local
  // arrival stamp so the label tracks data staleness honestly.
  const dateLabel = formatRelativeTime(
    isInProgress ? lastReceivedAt : (round.completedAt ?? round.startedAt)
  );
  const location = round.course.location;

  const holesLabel = holeRangeLabel(round.course.holes, round.holeRange);

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
            <Text style={styles.bandPillText}>STROKE</Text>
          </View>
          <View style={styles.bandPill}>
            <Text style={styles.bandPillText}>{holesLabel}</Text>
          </View>
          {isInProgress ? <InProgressPill /> : null}
        </View>
        <View style={styles.bandBottomRow}>
          <Text style={styles.bandByLine} numberOfLines={1}>
            {ownerHandle} · {dateLabel}
          </Text>
          <View style={styles.bandScoreBlock}>
            <Text style={styles.bandRel}>
              {totalStrokes > 0 ? formatScore(totalRel) : '—'}
            </Text>
            {isInProgress && thruCount > 0 ? (
              <Text style={styles.bandThru}>THRU {thruCount}</Text>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <ReadOnlyScorecard
          round={round}
          hideFinalTotals={isInProgress}
          onPressParticipant={onPressParticipant}
        />
      </View>
    </View>
  );
}

/**
 * Small pulsing-dot pill rendered in the gradient band when a round is
 * still in progress. The dot opacity loops between 0.45 and 1.0 on the
 * native driver so it stays smooth during scroll.
 */
function InProgressPill() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // useState's lazy initializer gives us a stable Animated.Value
  // without the "ref read during render" lint warning that
  // useRef(...).current triggers. The Value object itself is the
  // same identity across renders; only its internal numeric state
  // ticks via Animated.
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.bandPill} accessibilityLabel="In progress">
      <Animated.View style={[styles.bandPillDot, { opacity }]} />
      <Text style={styles.bandPillText}>IN PROGRESS</Text>
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
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
    },
    bandPill: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    bandPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: '#ffffff',
    },
    bandPillDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#ffffff',
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
      alignItems: 'flex-end',
    },
    bandRel: {
      color: '#ffffff',
      fontSize: 30,
      fontWeight: '800',
      lineHeight: 32,
    },
    bandThru: {
      marginTop: 2,
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: 'rgba(255,255,255,0.85)',
    },

    body: {
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 14,
    },
  });
}
