/**
 * Rounds tab hub — landing screen with three actions: New round,
 * Continue current round, Previous rounds.
 *
 * The user has at most one in-progress round at a time. The hub
 * shifts which of the New/Continue actions is the primary CTA based
 * on that state; the other slot renders as a dashed-disabled card so
 * the full set of affordances stays visible (learnability over
 * conciseness). "Previous rounds" is always shown, dashed-disabled
 * with welcome copy if the user has no completed rounds at all
 * (brand-new account).
 *
 * Continue card surfaces the same live top strip + chip used by
 * round list cards, plus ±score chip + course/thru subtitle when active,
 * so the hub feels alive without
 * yanking the user straight into scoring — the user opted for an
 * explicit tap to enter scoring, not auto-routing.
 *
 * Greeting: time-of-day greeting + name in the typical state; a
 * welcome message replaces it when the user has no rounds at all.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LiveStatusChip } from '@/components/round/LiveStatusChip';
import { LiveTopStrip } from '@/components/round/LiveTopStrip';
import { useRound } from '@/library/golf/RoundContext';
import {
  formatRelativeTime,
  formatScore,
  getRoundTotalRelative,
  getScorerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { useCompletedRounds } from '@/library/golf/useCompletedRounds';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function RoundsHubScreen() {
  const { colors } = useTheme();
  const account = useRequiredAccount();
  const { currentRound, roundHydrated } = useRound();
  const { rounds: completedRounds, isLoading: completedLoading } =
    useCompletedRounds();

  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!roundHydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const hasCurrent = currentRound != null;
  const hasCompleted = completedRounds.length > 0;
  // "Brand new" means the user has nothing at all yet. We use this to
  // soften the empty-Previous card with welcome copy and to flip the
  // greeting to a first-launch tone.
  const isBrandNew = !hasCurrent && !hasCompleted && !completedLoading;

  const greeting = isBrandNew
    ? 'Welcome to tee-time'
    : `${getGreeting()}${account.displayName ? `, ${account.displayName}` : ''}`;
  const title = isBrandNew ? 'Score your first round' : "What's next?";

  // Card variants:
  //   - NEW round is primary when no current round; disabled when one exists.
  //   - CONTINUE is primary when a current round exists; disabled when none.
  //   - PREVIOUS is real when completedRounds > 0; disabled (welcome copy) when brand new.

  const newCard = hasCurrent ? (
    <DisabledHubCard
      iconName="add"
      label="New round"
      sub="Finish or abandon your current round first"
    />
  ) : (
    <PrimaryHubCard
      iconName="add"
      label="New round"
      sub="Pick a course and players to start scoring"
      onPress={() => router.push('/(tabs)/(score)/new' as never)}
    />
  );

  const continueCard = hasCurrent ? (
    <PrimaryHubCard
      iconName="play"
      label="Continue"
      sub={continueSubtitle(currentRound!, account.userId)}
      onPress={() => router.push('/(tabs)/(score)/scoring' as never)}
      liveRound={currentRound!}
      scoreText={continueScoreText(currentRound!, account.userId)}
    />
  ) : (
    <DisabledHubCard
      iconName="play"
      label="Continue current round"
      sub="No round in progress"
    />
  );

  const previousCard = isBrandNew ? (
    <DisabledHubCard
      iconName="list"
      label="Previous rounds"
      sub="Your completed rounds will live here"
    />
  ) : (
    <NeutralHubCard
      iconName="list"
      label="Previous rounds"
      sub={previousSubtitle(completedRounds, completedLoading)}
      onPress={() => router.push('/(tabs)/(score)/previous' as never)}
    />
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleBlock}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>

        {/* Primary action first, then disabled, then Previous. Order shifts
            when current-round state changes — primary always rides up top. */}
        {hasCurrent ? continueCard : newCard}
        {hasCurrent ? newCard : continueCard}
        {previousCard}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Subtitle / score helpers for the Continue + Previous cards.
// ---------------------------------------------------------------------------

function continueSubtitle(round: Round, userId: string): string {
  // Course name is always meaningful; THRU is appended when the user
  // (or whoever is on the round) has at least one hole entered.
  const scorerId = scorerIdForUser(round, userId);
  const { thruCount } = scorerId
    ? getScorerProgress(round, scorerId)
    : { thruCount: 0 };
  const base = round.course.name;
  if (thruCount > 0) return `${base} · thru ${thruCount}`;
  return base;
}

function continueScoreText(round: Round, userId: string): string | undefined {
  const scorerId = scorerIdForUser(round, userId);
  if (!scorerId) return undefined;
  const { thruCount } = getScorerProgress(round, scorerId);
  if (thruCount === 0) return undefined;
  const rel = getRoundTotalRelative(round, scorerId);
  return formatScore(rel);
}

function previousSubtitle(rounds: Round[], isLoading: boolean): string {
  if (isLoading && rounds.length === 0) return 'Loading…';
  if (rounds.length === 0) return 'No completed rounds yet';
  const mostRecent = rounds.reduce<Round | null>((latest, r) => {
    if (!latest) return r;
    const a = new Date(r.completedAt ?? r.startedAt).getTime();
    const b = new Date(latest.completedAt ?? latest.startedAt).getTime();
    return a > b ? r : latest;
  }, null);
  const recencyLabel = mostRecent
    ? formatRelativeTime(mostRecent.completedAt ?? mostRecent.startedAt)
    : null;
  const countLabel = `${rounds.length} completed`;
  if (!recencyLabel) return countLabel;
  return `${countLabel} · last played ${recencyLabel.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Card variants. All three share the same row layout (icon · body · chev)
// from the mockup; only the surface treatment changes.
// ---------------------------------------------------------------------------

type HubCardBaseProps = {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub: string;
};

type PrimaryProps = HubCardBaseProps & {
  onPress: () => void;
  liveRound?: Round;
  scoreText?: string;
};

function PrimaryHubCard({
  iconName,
  label,
  sub,
  onPress,
  liveRound,
  scoreText,
}: PrimaryProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isLive = liveRound != null;
  const row = (
    <>
      <View
        style={[
          styles.iconSquare,
          isLive ? styles.iconSquareLive : styles.iconSquarePrimary,
        ]}>
        <Ionicons
          name={iconName}
          size={20}
          color={isLive ? colors.primaryDark : '#ffffff'}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, !isLive && styles.labelOnPrimary]}>
            {label}
          </Text>
          {scoreText ? (
            <View style={[styles.scoreChip, isLive && styles.scoreChipLive]}>
              <Text
                style={[
                  styles.scoreChipText,
                  isLive && styles.scoreChipTextLive,
                ]}>
                {scoreText}
              </Text>
            </View>
          ) : null}
          {isLive ? <LiveStatusChip /> : null}
        </View>
        <Text
          style={[styles.sub, !isLive && styles.subOnPrimary]}
          numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={isLive ? colors.textMuted : '#ffffff'}
      />
    </>
  );

  if (isLive) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.liveHubCard,
          pressed && styles.cardPressed,
        ]}>
        <LiveTopStrip />
        <View style={styles.liveHubContent}>{row}</View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, styles.cardPrimary]}>
        {row}
      </LinearGradient>
    </Pressable>
  );
}

type NeutralProps = HubCardBaseProps & { onPress: () => void };

function NeutralHubCard({ iconName, label, sub, onPress }: NeutralProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.card,
        styles.cardNeutral,
        pressed && styles.cardPressed,
      ]}>
      <View style={[styles.iconSquare, styles.iconSquareNeutral]}>
        <Ionicons name={iconName} size={20} color={colors.primaryDark} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function DisabledHubCard({ iconName, label, sub }: HubCardBaseProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={label}
      style={[styles.card, styles.cardDisabled]}>
      <View style={[styles.iconSquare, styles.iconSquareDisabled]}>
        <Ionicons name={iconName} size={20} color={colors.textMuted} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.label, styles.labelMuted]}>{label}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      padding: 14,
      paddingTop: 20,
      paddingBottom: 32,
    },
    titleBlock: {
      marginBottom: 14,
      paddingHorizontal: 2,
    },
    greeting: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.2,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginTop: 4,
    },
    card: {
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    cardPrimary: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
    cardNeutral: {
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardPressed: {
      opacity: 0.85,
    },
    cardDisabled: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    liveHubCard: {
      borderRadius: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
      overflow: 'hidden',
    },
    liveHubContent: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    iconSquare: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconSquareNeutral: {
      backgroundColor: colors.chipBg,
    },
    iconSquarePrimary: {
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    iconSquareLive: {
      backgroundColor: colors.chipBg,
    },
    iconSquareDisabled: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    label: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textTitle,
      letterSpacing: 0.1,
    },
    labelOnPrimary: {
      color: '#ffffff',
    },
    labelMuted: {
      color: colors.textMuted,
    },
    sub: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 3,
    },
    subOnPrimary: {
      color: 'rgba(255,255,255,0.85)',
    },
    scoreChip: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    scoreChipLive: {
      backgroundColor: withAlpha(colors.primary, 0.12),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.primary, 0.24),
    },
    scoreChipText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '800',
    },
    scoreChipTextLive: {
      color: colors.primaryDark,
    },
  });
}
