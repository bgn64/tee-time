/**
 * Round detail — `(tabs)/(home)/round/[id]`.
 *
 * The home-tab destination when a feed card is tapped. Renders the
 * shared `<RoundDetailView />` so the visual identity matches the
 * Rounds-tab `(score)/previous/[id]` view exactly — only the back
 * stack differs (this route stays inside the home tab).
 *
 * Query is intentionally NOT scoped to `owner_user_id = me`: the
 * home tab shows friends' rounds too. The PowerSync streams
 * (`scorecards` / `friend_scorecards`, plus their `scorecard_scores`
 * counterparts) only sync rows the user is allowed to see, so any
 * id we receive via tap is something the local cache can render.
 *
 * Empty state mirrors the Previous-rounds detail pattern for stale
 * links and mid-navigation deletes / unfriends.
 */

import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { RoundDetailView } from '@/components/round/RoundDetailView';
import { PHONE_MAX_WIDTH } from '@/components/aurora';
import { PullToRefreshScrollView } from '@/components/widgets/PullToRefreshScrollView';
import { useRefresh } from '@/library/data/useRefresh';
import { useRoundDetail } from '@/library/golf/useRoundDetail';
import { useTheme } from '@/library/theme/ThemeContext';

export default function HomeRoundDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const refresh = useRefresh();

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

  const { round, isLoading } = useRoundDetail(id ?? null);

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
      <PullToRefreshScrollView
        onRefresh={refresh}
        style={styles.container}
        contentContainerStyle={styles.content}>
        <RoundDetailView
          round={round}
          profileRoutePrefix="/(tabs)/(home)/profile"
        />
      </PullToRefreshScrollView>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent'
    },
    content: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      padding: 14,
      paddingBottom: 40
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
      backgroundColor: 'transparent'
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
      backgroundColor: colors.lime,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999
    },
    backCtaText: {
      color: colors.onNeon,
      fontWeight: '800',
      fontSize: 13,
      letterSpacing: 0.4
    }
  });
}
