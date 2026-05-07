/**
 * You tab landing — profile + stats strip + 2×2 settings grid.
 *
 * Wired in Phase 1:
 *   · Profile name/avatar (sourced from the default player record)
 *   · Stats: rounds played, avg score, best score (computed from completedRounds
 *     filtered to stroke rounds the default player participated in)
 *   · Theme card → /(tabs)/(you)/theme (existing 5-swatch picker)
 *
 * Phase 3 step 7 additions:
 *   · Profile name / handle row reflects sign-in state. Signed-in users see
 *     their account displayName + @handle (green); signed-out keeps the
 *     existing "No account yet" italic text.
 *   · The Account grid card morphs based on sign-in state. Signed-out:
 *     "Sign in / Back up & connect" with an orange pulse dot + accented
 *     border, taps into the /sign-in modal flow. Signed-in: shows the
 *     handle as the subtitle and routes into /(tabs)/(you)/account for
 *     account details + sign-out.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { themeNames } from '@/constants/themes';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';

function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

function formatAvg(avg: number): string {
  // Sign-aware to one decimal: +4.2, −1.5, E
  const rounded = Math.round(avg * 10) / 10;
  if (rounded === 0) return 'E';
  const abs = Math.abs(rounded).toFixed(1);
  return rounded > 0 ? `+${abs}` : `−${abs}`;
}

export default function YouScreen() {
  const { colors, themeName } = useTheme();
  const { completedRounds } = useGolfRound();
  const { defaultPlayerId, getPlayer } = usePlayers();
  const { account } = useAccount();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'text', text: 'YOU' },
    right: { kind: 'profile' },
  });

  // Profile header: signed-in account values win over the local default
  // player record. Avatar color also follows the SSO-supplied color so the
  // profile feels consistent with the all-set screen the user just saw.
  const me = defaultPlayerId ? getPlayer(defaultPlayerId) : undefined;
  const displayName = account?.displayName ?? me?.name ?? 'You';
  const avatarColor = account?.avatarColor ?? me?.color ?? colors.primary;
  const avatarLetter = displayName[0]?.toUpperCase() ?? 'Y';

  // Stats: only stroke rounds where the default player participated.
  const stats = useMemo(() => {
    if (!defaultPlayerId) return { rounds: 0, avg: null as number | null, best: null as number | null };

    const perRound: number[] = [];
    for (const round of completedRounds) {
      if (round.scoringRule !== 'stroke') continue;
      if (!round.playerIds.includes(defaultPlayerId)) continue;
      let total = 0;
      let scored = 0;
      for (const score of round.scores) {
        if (score.scorerId !== defaultPlayerId) continue;
        const hole = round.course.holes.find((h) => h.number === score.holeNumber);
        if (hole) {
          total += score.strokes - hole.par;
          scored++;
        }
      }
      if (scored > 0) perRound.push(total);
    }

    if (perRound.length === 0) return { rounds: 0, avg: null, best: null };
    const sum = perRound.reduce((a, b) => a + b, 0);
    return {
      rounds: perRound.length,
      avg: sum / perRound.length,
      best: Math.min(...perRound),
    };
  }, [completedRounds, defaultPlayerId]);

  const themeLabel = useMemo(
    () => themeNames.find((t) => t.key === themeName)?.label ?? 'Earthy Green',
    [themeName]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{displayName}</Text>
          {account ? (
            <Text style={styles.handleReal}>@{account.handle}</Text>
          ) : (
            <Text style={styles.handle}>No account yet</Text>
          )}
        </View>
      </View>

      <View style={styles.statsStrip}>
        <View style={styles.statCell}>
          <Text style={styles.statNumber}>{stats.rounds}</Text>
          <Text style={styles.statLabel}>ROUNDS</Text>
        </View>
        <View style={[styles.statCell, styles.statCellMiddle]}>
          <Text
            style={[
              styles.statNumber,
              stats.avg !== null && stats.avg > 0 && styles.statOver,
              stats.avg !== null && stats.avg < 0 && styles.statUnder,
            ]}>
            {stats.avg !== null ? formatAvg(stats.avg) : '—'}
          </Text>
          <Text style={styles.statLabel}>AVG</Text>
        </View>
        <View style={styles.statCell}>
          <Text
            style={[
              styles.statNumber,
              stats.best !== null && stats.best > 0 && styles.statOver,
              stats.best !== null && stats.best < 0 && styles.statUnder,
            ]}>
            {stats.best !== null ? formatScore(stats.best) : '—'}
          </Text>
          <Text style={styles.statLabel}>BEST</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <GridCard
          styles={styles}
          label="Theme"
          subtitle={themeLabel}
          icon="🎨"
          iconBg="#9c5dde"
          onPress={() => router.push('/(tabs)/(you)/theme')}
        />
        <GridCard
          styles={styles}
          label="Notifications"
          subtitle="—"
          icon="🔔"
          iconBg="#4a90e2"
          todo
          onPress={() => router.push('/(tabs)/(you)/notifications')}
        />
        <GridCard
          styles={styles}
          label={account ? 'Account' : 'Sign in'}
          subtitle={account ? `@${account.handle}` : 'Back up & connect'}
          icon="👤"
          iconBg={account ? colors.primary : colors.accent}
          accented={!account}
          pulse={!account}
          onPress={() =>
            account ? router.push('/(tabs)/(you)/account') : router.push('/sign-in')
          }
        />
        <GridCard
          styles={styles}
          label="About"
          subtitle="—"
          icon="ⓘ"
          iconBg={colors.textMuted}
          todo
          onPress={() => router.push('/(tabs)/(you)/about')}
        />
      </View>
    </ScrollView>
  );
}

type GridCardProps = {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  todo?: boolean;
  accented?: boolean;
  pulse?: boolean;
  onPress: () => void;
};

function GridCard({
  styles,
  label,
  subtitle,
  icon,
  iconBg,
  todo,
  accented,
  pulse,
  onPress,
}: GridCardProps) {
  return (
    <Pressable style={[styles.gridCard, accented && styles.gridCardAccented]} onPress={onPress}>
      {todo && (
        <View style={styles.todoBadge}>
          <Text style={styles.todoBadgeText}>TODO</Text>
        </View>
      )}
      {pulse && <View style={styles.pulseDot} />}
      <View style={[styles.gridIcon, { backgroundColor: iconBg }]}>
        <Text style={styles.gridIconText}>{icon}</Text>
      </View>
      <Text style={styles.gridLabel}>{label}</Text>
      <Text style={styles.gridSubtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    profile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#ffffff',
    },
    profileInfo: { flex: 1 },
    name: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
    },
    handle: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: 2,
    },
    handleReal: {
      fontSize: 12,
      color: colors.primaryDark,
      fontWeight: '700',
      marginTop: 2,
    },
    statsStrip: {
      flexDirection: 'row',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
    },
    statCellMiddle: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    statNumber: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    statOver: {
      color: colors.accent,
    },
    statUnder: {
      color: colors.primaryDark,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.6,
      marginTop: 2,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    gridCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      position: 'relative',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    gridCardAccented: {
      borderColor: colors.accent,
    },
    pulseDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.accent,
    },
    todoBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: '#fbbf24',
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    todoBadgeText: {
      fontSize: 8,
      fontWeight: '800',
      color: '#ffffff',
      letterSpacing: 0.5,
    },
    gridIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    gridIconText: {
      fontSize: 18,
      color: '#ffffff',
      fontWeight: '800',
    },
    gridLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    gridSubtitle: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
      maxWidth: '100%',
    },
  });
}
