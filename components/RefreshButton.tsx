/**
 * RefreshButton — pinned desktop-web refresh affordance.
 *
 * Mobile / touch surfaces use `RefreshControl` for pull-to-refresh.
 * That gesture has no mouse equivalent on desktop web, so screens with
 * cloud-backed data need a visible button to give desktop users a way
 * to refresh. This component is the single source of truth for that
 * button's look + behavior — extracted out of the Feed's original
 * inline implementation so every refresh-aware screen renders it
 * identically.
 *
 * Renders nothing on native (`Platform.OS !== 'web'`) — touch surfaces
 * already have pull-to-refresh and don't need the duplicate button.
 *
 * Composes naturally with `useScreenRefresh`:
 *   const { refreshing, onRefresh } = useScreenRefresh([refreshScorecards]);
 *   ...
 *   <RefreshButton refreshing={refreshing} onPress={onRefresh} />
 */

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '@/state/ThemeContext';

type Props = {
  refreshing: boolean;
  onPress: () => void;
  /** Override the accessibility label (e.g., "Refresh rounds"). */
  accessibilityLabel?: string;
};

export function RefreshButton({
  refreshing,
  onPress,
  accessibilityLabel = 'Refresh',
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        disabled={refreshing}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.btn,
          pressed && styles.btnPressed,
          refreshing && styles.btnDisabled,
        ]}>
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <FontAwesome name="refresh" size={12} color={colors.textMuted} />
        )}
        <Text style={styles.label}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 8,
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    btnPressed: {
      opacity: 0.6,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.3,
    },
  });
}
