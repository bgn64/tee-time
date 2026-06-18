/**
 * Round detail screen — `(tabs)/(score)/previous/[id]`.
 *
 * Read-only view of one of the user's completed scorecards, plus a
 * Delete button. The list is owner-scoped, so any id reachable from
 * the list belongs to the signed-in user; the detail's targeted
 * query also includes `owner_user_id = ?` for deep-link defense and
 * to render a "Round not available" empty state cleanly when a
 * stale link or a mid-navigation delete lands here.
 *
 * Renders the shared `<RoundDetailView />` so the visual identity
 * matches `(home)/round/[id]` — only the Delete button is
 * route-specific (owner-of-the-round flow).
 */

import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { RoundDetailView } from '@/components/round/RoundDetailView';
import { PHONE_MAX_WIDTH } from '@/components/aurora';
import type { OverflowItem } from '@/components/round/HeaderOverflowMenu';
import { useRoundDetail } from '@/library/golf/useRoundDetail';
import { useRound } from '@/library/golf/RoundContext';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function RoundDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useRequiredAccount();
  const { deleteRound } = useRound();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { round, isLoading } = useRoundDetail(id ?? null);

  const onPressDelete = React.useCallback(() => {
    if (!id) return;
    const proceed = async () => {
      try {
        await deleteRound(id);
        // replace, not back — avoids stale-detail flash if the local
        // query takes a tick to re-emit, and avoids a "back to a
        // deleted round" entry in the history.
        router.replace('/(tabs)/(score)/previous' as never);
      } catch (e) {
        console.warn('[RoundDetail] delete failed', e);
        if (Platform.OS === 'web') {
          window.alert('Failed to delete this round. Please try again.');
        } else {
          Alert.alert('Could not delete', 'Please try again.');
        }
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this round? This cannot be undone.')) {
        void proceed();
      }
      return;
    }
    Alert.alert(
      'Delete this round?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void proceed() }
      ]
    );
  }, [id, deleteRound, router]);

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
            onPress={() => router.replace('/(tabs)/(score)/previous' as never)}>
            <Text style={styles.backCtaText}>Back to Rounds</Text>
          </Pressable>
        </View>
      </>
    );
  }

  // Round actions live in the banner's ⋯ overflow (matching the feed
  // card). Owner-only — the query above is owner-scoped, but the
  // explicit account check guards against future refactors. Edit
  // pushes into the nested `[id]/edit` route; Delete runs the
  // confirm-then-delete flow above.
  const overflowActions: OverflowItem[] =
    account.userId === round.ownerUserId
      ? [
          {
            key: 'edit',
            label: 'Edit round',
            icon: 'create-outline',
            onPress: () =>
              router.push(
                `/(tabs)/(score)/previous/${round.id}/edit` as never
              ),
          },
          {
            key: 'delete',
            label: 'Delete round',
            icon: 'trash-outline',
            destructive: true,
            onPress: onPressDelete,
          },
        ]
      : [];

  return (
    <>
      <Stack.Screen options={{ title: round.course.name }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}>
        <RoundDetailView
          round={round}
          profileRoutePrefix="/(tabs)/(score)/profile"
          overflowActions={overflowActions}
        />
      </ScrollView>
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
