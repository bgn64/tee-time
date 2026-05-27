/**
 * SearchResultsRow — one row in the Search results list.
 *
 * Avatar (with deterministic palette color) + display name + @handle +
 * chevron. The row is fully tappable; the parent owns navigation.
 *
 * Lives in `components/social` (not co-located with the route file) so
 * future entry points — e.g. a "tap to view profile" affordance on a
 * scoring participant chip — can render the same row component.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ProfileSummary } from '@/types/social';

type Props = {
  profile: ProfileSummary;
  onPress: (profile: ProfileSummary) => void;
};

export function SearchResultsRow({ profile, onPress }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const initial = (profile.displayName?.[0] ?? profile.handle?.[0] ?? '?').toUpperCase();

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(profile)}>
      <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
        <Text style={styles.avatarLetter}>{initial}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {profile.displayName}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{profile.handle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 8
    },
    rowPressed: {
      opacity: 0.85
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarLetter: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 15
    },
    body: {
      flex: 1,
      minWidth: 0
    },
    name: {
      color: colors.textTitle,
      fontWeight: '700',
      fontSize: 14
    },
    handle: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2
    }
  });
}
