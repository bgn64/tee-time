/**
 * LiveRoundStrip — compact horizontal row of friends' in-progress rounds
 * pinned at the top of the Feed.
 *
 * Renders one `LiveRoundCard` per round in the supplied `rounds` array
 * (already filtered + sorted by `GolfRoundContext.liveRounds`). The
 * strip returns null when no rounds are present so the empty state
 * costs zero pixels.
 *
 * Cards are deliberately ~1/3 the height of a completed-round card and
 * fixed-width to encourage horizontal scrolling once several friends
 * are simultaneously playing.
 *
 * Naming + visual semantics: the strip used to badge itself "LIVE NOW"
 * with a pulsing red dot. Under refresh-only sync (no realtime push),
 * that wording over-promised — a friend could finish 9 holes between
 * the viewer's last pull-to-refresh and now. The header reads "IN
 * PROGRESS" so the label matches what the data actually represents
 * (rounds the viewer's friends started but haven't completed), with
 * the accent color toned down from urgent-red to the calmer primary.
 * Manual pull-to-refresh on the Feed re-pulls the underlying data.
 */
import { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { holesInRange } from '@/lib/scoring';
import { useTheme } from '@/state/ThemeContext';
import type { Round } from '@/types/golf';

type ProfileCacheEntry = {
  displayName: string;
  handle: string;
  avatarColor: string;
  userId: string;
};

type Props = {
  rounds: Round[];
  profileCache: Record<string, ProfileCacheEntry>;
};

const DEFAULT_AVATAR = '#7cb342';

export function LiveRoundStrip({ rounds, profileCache }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (rounds.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>IN PROGRESS</Text>
        <Text style={styles.headerCount}>
          {rounds.length === 1 ? '1 friend' : `${rounds.length} friends`}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {rounds.map((round) => (
          <LiveRoundCard
            key={round.id}
            round={round}
            profileCache={profileCache}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function LiveRoundCard({
  round,
  profileCache,
}: {
  round: Round;
  profileCache: Record<string, ProfileCacheEntry>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const owner = round.ownerUserId ? profileCache[round.ownerUserId] : undefined;
  const ownerName = owner?.displayName ?? 'A friend';
  const ownerColor = owner?.avatarColor ?? DEFAULT_AVATAR;
  const initial = ownerName.trim().charAt(0).toUpperCase() || '?';

  // Score-to-par + thru count, scoped to the round's hole range and the
  // owner's scorerId. For a stroke round the owner's scorerId is the
  // participantKey of the linked participant; for scramble there's only
  // one team total to display so we fall back to the first team id.
  const { relativeScore, thruCount } = useMemo(
    () => computeOwnerProgress(round),
    [round]
  );

  // Total holes in the round's active range (9 or 18).
  const totalHoles = useMemo(
    () => holesInRange(round.course.holes, round.holeRange).length,
    [round]
  );

  const scoreLabel =
    relativeScore === 0 ? 'E' : relativeScore > 0 ? `+${relativeScore}` : `−${Math.abs(relativeScore)}`;
  const scoreColorStyle =
    relativeScore < 0
      ? styles.scoreUnder
      : relativeScore > 0
        ? styles.scoreOver
        : styles.scoreEven;

  return (
    <View style={styles.card}>
      <View style={styles.cardRow1}>
        <View style={[styles.avatar, { backgroundColor: ownerColor }]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.cardName} numberOfLines={1}>
          {ownerName}
        </Text>
      </View>
      <Text style={styles.cardCourse} numberOfLines={1}>
        {round.course.name}
      </Text>
      <View style={styles.cardRow3}>
        <Text style={[styles.scoreText, scoreColorStyle]}>{scoreLabel}</Text>
        <Text style={styles.thruText}>THRU {thruCount}</Text>
      </View>
      <PipBar
        total={totalHoles}
        played={thruCount}
        currentHoleOffset={Math.max(0, Math.min(totalHoles - 1, thruCount))}
      />
    </View>
  );
}

function computeOwnerProgress(round: Round): {
  relativeScore: number;
  thruCount: number;
} {
  const allowed = new Set(
    holesInRange(round.course.holes, round.holeRange).map((h) => h.number)
  );

  // Identify the owner's scorerId. For stroke: the participant whose
  // linkedUserId matches ownerUserId (or the first participant if no
  // match — defensive fallback for legacy rows). For scramble: the team
  // containing the owner's participant.
  let ownerScorerId: string | undefined;
  if (round.scoringRule === 'scramble') {
    ownerScorerId = round.teams?.[0]?.id;
  } else {
    const ownerParticipant =
      round.participants.find((p) => p.linkedUserId === round.ownerUserId) ??
      round.participants[0];
    ownerScorerId = ownerParticipant?.participantKey;
  }

  if (!ownerScorerId) return { relativeScore: 0, thruCount: 0 };

  let total = 0;
  let scored = 0;
  const seen = new Set<number>();
  for (const s of round.scores) {
    if (s.scorerId !== ownerScorerId) continue;
    if (!allowed.has(s.holeNumber)) continue;
    if (seen.has(s.holeNumber)) continue;
    seen.add(s.holeNumber);
    const hole = round.course.holes.find((h) => h.number === s.holeNumber);
    if (!hole) continue;
    total += s.strokes - hole.par;
    scored++;
  }
  return { relativeScore: total, thruCount: scored };
}

function PipBar({
  total,
  played,
  currentHoleOffset,
}: {
  total: number;
  played: number;
  currentHoleOffset: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const safeTotal = Math.max(total, 1);
  return (
    <View style={styles.pipRow}>
      {Array.from({ length: safeTotal }).map((_, i) => {
        let style: any = styles.pip;
        if (i < played) style = [styles.pip, styles.pipPlayed];
        else if (i === currentHoleOffset && played < safeTotal)
          style = [styles.pip, styles.pipCurrent];
        return <View key={i} style={style} />;
      })}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    headerLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 1.5,
    },
    headerCount: {
      marginLeft: 'auto',
      fontSize: 10.5,
      color: colors.textMuted,
      fontWeight: '600',
    },

    scrollContent: {
      gap: 8,
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    card: {
      width: 188,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 6,
    },
    cardRow1: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    avatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: '#ffffff',
      fontSize: 10.5,
      fontWeight: '800',
    },
    cardName: {
      flex: 1,
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textTitle,
    },
    cardCourse: {
      fontSize: 10.5,
      color: colors.textMuted,
    },
    cardRow3: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 6,
      marginTop: 2,
    },
    scoreText: {
      fontFamily: 'SpaceMono',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    scoreUnder: {
      color: colors.primaryDark,
    },
    scoreEven: {
      color: colors.textTitle,
    },
    scoreOver: {
      color: colors.accent,
    },
    thruText: {
      fontFamily: 'SpaceMono',
      fontSize: 10.5,
      color: colors.textMuted,
    },

    pipRow: {
      flexDirection: 'row',
      gap: 2,
      marginTop: 2,
    },
    pip: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    pipPlayed: {
      backgroundColor: colors.primary,
    },
    pipCurrent: {
      backgroundColor: colors.accent,
    },
  });
}
