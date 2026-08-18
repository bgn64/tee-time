/**
 * TeamAvatarCluster — overlapping circle avatars for a person or team.
 *
 * Used wherever we want to identify a scorer (a single player in
 * stroke, or a team of players in scramble) without leaning on
 * arbitrarily-assigned team colors or hard-to-fit team-name strings.
 * Stroke callers pass `members.length === 1` so only one circle
 * renders; scramble callers pass the team roster so every member's
 * initial appears in an overlapping stack.
 *
 * Pure display: the caller supplies the resolved {name, color}
 * entries. Identity resolution happens upstream.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import {
  auroraAvatarColor,
  avatarInitialColor,
} from '@/library/social/avatarColors';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type AvatarMember = {
  /** Stable React key. Typically the participantKey. */
  id: string;
  /** Display name. Only the first character is rendered, so any non-empty string works. */
  name: string;
  /** Background color for the circle (resolved upstream from roster). */
  color: string;
  /** Bare handle (no leading @) when the member is a registered user. */
  handle?: string;
};

export type TeamAvatarClusterSize = 'sm' | 'md' | 'lg';

type Props = {
  members: readonly AvatarMember[];
  size?: TeamAvatarClusterSize;
  ringColor?: string;
  style?: ViewStyle;
  max?: number;
};

const SIZE_MAP: Record<
  TeamAvatarClusterSize,
  { avatar: number; font: number; overlap: number; border: number }
> = {
  sm: { avatar: 18, font: 8, overlap: 6, border: 1.5 },
  md: { avatar: 24, font: 10, overlap: 8, border: 2 },
  lg: { avatar: 30, font: 12, overlap: 10, border: 2 },
};

export function TeamAvatarCluster({
  members,
  size = 'md',
  ringColor,
  style,
  max = 4,
}: Props) {
  const { colors } = useTheme();
  const dims = SIZE_MAP[size];
  const styles = useMemo(
    () => makeStyles(dims, ringColor ?? colors.night, colors),
    [dims, ringColor, colors]
  );

  const visible = members.slice(0, max);
  const hidden = members.length - visible.length;

  if (visible.length === 0) {
    return <View style={style} />;
  }

  return (
    <View style={[styles.cluster, style]}>
      {visible.map((m, i) => (
        <View
          key={m.id}
          style={[
            styles.avatar,
            { backgroundColor: auroraAvatarColor(m.color) },
            i === 0 ? null : styles.avatarOverlap,
            { zIndex: i + 1 },
          ]}>
          <Text
            style={[
              styles.letter,
              { color: avatarInitialColor(auroraAvatarColor(m.color)) },
            ]}
            numberOfLines={1}>
            {m.name[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      ))}
      {hidden > 0 ? (
        <View style={[styles.overflow, { zIndex: visible.length + 1 }]}>
          <Text style={styles.overflowText} numberOfLines={1}>
            +{hidden}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(
  dims: { avatar: number; font: number; overlap: number; border: number },
  ringColor: string,
  colors: ThemeColors
) {
  return StyleSheet.create({
    cluster: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      width: dims.avatar,
      height: dims.avatar,
      borderRadius: dims.avatar / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: dims.border,
      borderColor: ringColor,
    },
    avatarOverlap: {
      marginLeft: -dims.overlap,
    },
    letter: {
      fontWeight: '800',
      fontSize: dims.font,
    },
    overflow: {
      width: dims.avatar,
      height: dims.avatar,
      borderRadius: dims.avatar / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: dims.border,
      borderColor: ringColor,
      backgroundColor: colors.glassFill2,
      marginLeft: -dims.overlap,
    },
    overflowText: {
      color: colors.textTitle,
      fontWeight: '800',
      fontSize: dims.font,
    },
  });
}
