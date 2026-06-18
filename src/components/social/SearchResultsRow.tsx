/**
 * SearchResultsRow — one row in the Search results list.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, GlassCard } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ProfileSummary } from '@/types/social';

type Props = {
  profile: ProfileSummary;
  onPress: (profile: ProfileSummary) => void;
};

export function SearchResultsRow({ profile, onPress }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const initial = profile.displayName || profile.handle || '?';

  return (
    <Pressable
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      onPress={() => onPress(profile)}>
      <GlassCard padded={false} style={styles.row}>
        <Avatar initial={initial} color={profile.avatarColor} size={40} circle />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.displayName}
          </Text>
          <Text style={styles.handle} numberOfLines={1}>
            @{profile.handle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.lime} />
      </GlassCard>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    pressable: {
      marginBottom: 8
    },
    pressed: {
      opacity: 0.82,
      transform: [{ scale: 0.99 }]
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12
    },
    body: {
      flex: 1,
      minWidth: 0
    },
    name: {
      color: colors.textTitle,
      fontWeight: '900',
      fontSize: 14
    },
    handle: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2
    }
  });
}
