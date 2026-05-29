/**
 * Round detail — `(tabs)/(home)/round/[id]`.
 *
 * The home-tab destination when a feed card is tapped. Renders the
 * shared `<RoundDetailView />` so the visual identity matches the
 * rounds-tab `/(rounds)/[id]` view exactly — only the back stack
 * differs (this route stays inside the home tab).
 *
 * Query is intentionally NOT scoped to `owner_user_id = me`: the
 * home tab shows friends' rounds too. The PowerSync streams
 * (`scorecards` / `friend_scorecards`, plus their `scorecard_scores`
 * counterparts) only sync rows the user is allowed to see, so any
 * id we receive via tap is something the local cache can render.
 *
 * Empty state mirrors the rounds-tab pattern for stale links and
 * mid-navigation deletes / unfriends.
 */

import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useQuery } from '@powersync/react';

import { RoundDetailView } from '@/components/round/RoundDetailView';
import {
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE
} from '@/library/powersync/AppSchema';
import {
  projectScorecardRow,
  type ScorecardRowShape
} from '@/library/golf/projectScorecard';
import { useTheme } from '@/library/theme/ThemeContext';
import type { RoundScore } from '@/types/golf';

type ScoreRow = {
  scorecard_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  strokes: number | null;
};

const SELECT_ONE_SCORECARD_SQL = `
  SELECT * FROM ${SCORECARDS_TABLE}
  WHERE id = ?
  LIMIT 1
`;

const SELECT_SCORES_FOR_SCORECARD_SQL = `
  SELECT scorecard_id, scorer_id, hole_number, strokes
  FROM ${SCORECARD_SCORES_TABLE}
  WHERE scorecard_id = ?
`;

const NO_ROWS_SQL = `SELECT * FROM ${SCORECARDS_TABLE} WHERE 1 = 0`;

export default function HomeRoundDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  // Diagnostic — logs the nav state at mount so we can spot the
  // "missing back arrow after deep link / web reload" case. Without
  // `unstable_settings.initialRouteName` on the layout, a direct
  // load lands here with no parent in the stack and `canGoBack`
  // returns false. The layout sets `initialRouteName = 'index'`
  // which makes expo-router synthesize the home-feed parent so
  // canGoBack returns true; this log lets us confirm.
  React.useEffect(() => {
    console.log('[HomeRoundDetail] mount', {
      id,
      canGoBack: router.canGoBack(),
    });
  }, [id, router]);

  const { data: scorecardRows, isLoading: scorecardLoading } =
    useQuery<ScorecardRowShape>(
      id ? SELECT_ONE_SCORECARD_SQL : NO_ROWS_SQL,
      id ? [id] : []
    );

  const { data: scoreRows, isLoading: scoresLoading } = useQuery<ScoreRow>(
    id ? SELECT_SCORES_FOR_SCORECARD_SQL : NO_ROWS_SQL,
    id ? [id] : []
  );

  const scores = React.useMemo<RoundScore[]>(() => {
    return scoreRows
      .filter((r) => !!r.scorecard_id)
      .map((r) => ({
        scorerId: r.scorer_id ?? '',
        holeNumber: Number(r.hole_number ?? 0),
        strokes: Number(r.strokes ?? 0)
      }));
  }, [scoreRows]);

  const round = React.useMemo(() => {
    const row = scorecardRows[0];
    if (!row) return null;
    return projectScorecardRow(row, scores);
  }, [scorecardRows, scores]);

  // Diagnostic — logs round-completion transitions so we can rule
  // out (or in) a correlation between the round flipping to
  // `completed` on a friend's device and any local nav weirdness.
  // Tracked via a previous-value ref so the log only fires on the
  // actual transition (live → completed) instead of every render.
  const prevCompletedRef = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    const prev = prevCompletedRef.current;
    const next = round?.completedAt ?? null;
    if (prev !== undefined && prev !== next) {
      console.log('[HomeRoundDetail] completedAt transition', {
        id,
        prev,
        next,
        canGoBack: router.canGoBack(),
      });
    }
    prevCompletedRef.current = next;
  }, [round?.completedAt, id, router]);

  const isLoading = scorecardLoading || scoresLoading;

  if (!id) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Missing round id.</Text>
      </View>
    );
  }

  if (isLoading && !round) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!round) {
    return (
      <>
        <Stack.Screen options={{ title: 'Round' }} />
        <View style={styles.fallback}>
          <Text style={styles.fallbackIcon}>⛳</Text>
          <Text style={styles.fallbackTitle}>Round not available</Text>
          <Text style={styles.fallbackBody}>
            This round may have been deleted or is no longer accessible.
          </Text>
          <Pressable
            style={styles.backCta}
            onPress={() => router.replace('/(tabs)/(home)' as never)}>
            <Text style={styles.backCtaText}>Back to Home</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: round.course.name }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}>
        <RoundDetailView
          round={round}
          profileRoutePrefix="/(tabs)/(home)/profile"
        />
      </ScrollView>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      padding: 14,
      paddingBottom: 40
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
      backgroundColor: colors.background
    },
    fallbackText: {
      color: colors.textBody,
      fontSize: 14,
      fontWeight: '600'
    },
    fallbackIcon: { fontSize: 36 },
    fallbackTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle
    },
    fallbackBody: {
      fontSize: 13,
      color: colors.textBody,
      textAlign: 'center',
      maxWidth: 260
    },
    backCta: {
      marginTop: 14,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999
    },
    backCtaText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
      letterSpacing: 0.4
    }
  });
}
