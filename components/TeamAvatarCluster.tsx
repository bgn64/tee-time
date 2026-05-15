/**
 * TeamAvatarCluster — overlapping circle avatars for a person or team.
 *
 * Used wherever we want to identify a scorer (a single player in stroke,
 * or a team of players in scramble) without leaning on arbitrarily-
 * assigned team colors or hard-to-fit team-name strings:
 *
 *   - the leftmost "name" column of the scorecard grid
 *   - the score-entry rows during live scoring + edit mode
 *   - the finals-totals box at the bottom of the scorecard
 *   - the per-team / per-player cluster on round cards
 *
 * Stroke = 1 avatar. Scramble = N avatars laid out left-to-right with a
 * small overlap, rightmost on top — mirroring the same convention now
 * used on round-card avatars.
 *
 * Pure display: the caller supplies the resolved {name, color} entries.
 * Identity resolution (linkedUser → profileCache, local → snapshot)
 * happens at the call site so we don't reach into contexts here.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

export type AvatarMember = {
  /** Stable React key. Typically the participantKey. */
  id: string;
  /** Display name. Only the first character is rendered, so any non-empty string works. */
  name: string;
  /** Background color for the circle (resolved upstream from roster / profile). */
  color: string;
};

export type TeamAvatarClusterSize = 'sm' | 'md' | 'lg';

type Props = {
  members: ReadonlyArray<AvatarMember>;
  size?: TeamAvatarClusterSize;
  /** Background color to use for the white "border ring" between overlapping
   *  avatars. Defaults to white; pass `colors.cardBg` when the cluster sits
   *  on a card surface so the ring blends with the parent. */
  ringColor?: string;
  /** Optional outer style (margin, alignment, etc.). */
  style?: ViewStyle;
  /** Max avatars to render; rest collapse into a "+N" chip. Defaults to 4. */
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
  ringColor = '#ffffff',
  style,
  max = 4,
}: Props) {
  const dims = SIZE_MAP[size];
  const styles = useMemo(() => makeStyles(dims, ringColor), [dims, ringColor]);

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
            { backgroundColor: m.color },
            i === 0 ? null : styles.avatarOverlap,
            // Later siblings paint on top: rightmost on top.
            { zIndex: i + 1 },
          ]}>
          <Text style={styles.letter} numberOfLines={1}>
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
  ringColor: string
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
      color: '#ffffff',
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
      backgroundColor: '#a8a397',
      marginLeft: -dims.overlap,
    },
    overflowText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: dims.font,
    },
  });
}
