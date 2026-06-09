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

  const [isDeleting, setIsDeleting] = React.useState(false);

  const onPressDelete = React.useCallback(() => {
    if (!id) return;
    const proceed = async () => {
      setIsDeleting(true);
      try {
        await deleteRound(id);
        // replace, not back — avoids stale-detail flash if the local
        // query takes a tick to re-emit, and avoids a "back to a
        // deleted round" entry in the history.
        router.replace('/(tabs)/(score)/previous' as never);
      } catch (e) {
        setIsDeleting(false);
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

  const deleteButton = (
    <Pressable
      style={[styles.deleteBtn, isDeleting && styles.deleteBtnDisabled]}
      onPress={onPressDelete}
      disabled={isDeleting}>
      <Text style={styles.deleteBtnText}>
        {isDeleting ? 'Deleting…' : 'Delete this round'}
      </Text>
    </Pressable>
  );

  // Owner-only Edit button. Pushes into the nested `[id]/edit`
  // route so back-nav returns here. The query above is owner-scoped
  // already (so reaching this branch implies the user is the owner),
  // but the explicit account check guards against future refactors.
  const editButton =
    account.userId === round.ownerUserId ? (
      <View style={styles.topRow}>
        <Pressable
          style={styles.editBtn}
          onPress={() => router.push(`/(tabs)/(score)/previous/${round.id}/edit` as never)}
          accessibilityLabel="Edit this round">
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <>
      <Stack.Screen options={{ title: round.course.name }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}>
        <RoundDetailView
          round={round}
          profileRoutePrefix="/(tabs)/(score)/profile"
          topActions={editButton}
          footerActions={deleteButton}
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
    },
    deleteBtn: {
      borderWidth: 1,
      borderColor: '#f5cccc',
      borderRadius: 11,
      paddingVertical: 11,
      alignItems: 'center'
    },
    deleteBtnDisabled: { opacity: 0.5 },
    deleteBtnText: {
      color: '#d54848',
      fontWeight: '800',
      fontSize: 12
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    editBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
    },
    editBtnText: {
      color: colors.textTitle,
      fontWeight: '800',
      fontSize: 12,
      letterSpacing: 0.4,
    }
  });
}
