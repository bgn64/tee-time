/**
 * ShotSequence — read-only sibling of `ShotPicker` for the feed
 * Holes tab. Same visual layout but no dropdown caret + no
 * pressable behaviour. Mockup §5 ("Holes tab · scramble").
 *
 * Vertical SHOT N label above each avatar + member name, connected
 * by tiny dividers between stops. Renders nothing when there are
 * no contributors to show.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type AvatarMember } from './TeamAvatarCluster';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  contributorIds: readonly string[];
  members: readonly AvatarMember[];
};

export function ShotSequence({ contributorIds, members }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Filter out empty slots so the read view doesn't render "—"
  // placeholders — friend views shouldn't show pending UX state.
  const resolved = useMemo(() => {
    return contributorIds
      .map((id) => members.find((m) => m.id === id) ?? null)
      .filter((m): m is AvatarMember => m != null);
  }, [contributorIds, members]);

  if (resolved.length === 0) return null;

  return (
    <View style={styles.row}>
      {resolved.map((m, i) => (
        <View key={`stop-${i}`} style={styles.stopWrap}>
          {i > 0 ? <View style={styles.connector} /> : null}
          <View style={styles.stop}>
            <Text style={styles.n}>SHOT {i + 1}</Text>
            <View
              style={[styles.avatar, { backgroundColor: m.color }]}>
              <Text style={styles.avatarText}>
                {m.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {m.name.split(' ')[0]}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 0,
    },
    stopWrap: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    connector: {
      width: 14,
      height: 2,
      backgroundColor: colors.border,
      borderRadius: 1,
      marginHorizontal: 0,
    },
    stop: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
      minWidth: 50,
    },
    n: {
      fontSize: 9.5,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '900',
    },
    label: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.textTitle,
    },
  });
}
