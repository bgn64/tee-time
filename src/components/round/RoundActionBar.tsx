/**
 * RoundActionBar — two-column Like + Comments action bar that sits
 * at the bottom of every round card surface.
 *
 * Layout: equal-width Like and Comments segments separated by a
 * hairline divider above them. Like-tap calls `onToggleLike`;
 * Comments-tap calls `onOpenComments`. Each handler is optional —
 * Phase 1 wires the visual button regardless; the real Like write
 * path lands in Phase 7, and Comments-open is wired by the parent
 * card to mount `CommentsSheet`.
 *
 * Per the mockup, the heart fills with the accent colour when
 * `liked` is true; the label flips between "Like"/"Liked" and the
 * count is shown when > 0 ("3 likes" / "3 liked").
 *
 * Icon choice: Ionicons (already a dep via `@expo/vector-icons`);
 * `heart-outline` / `heart` and `chatbubble-outline` give us the
 * line + filled looks the mockup uses without bringing in a
 * second icon library.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
  onToggleLike?: () => void;
  onOpenComments?: () => void;
};

export function RoundActionBar({
  liked = false,
  likeCount = 0,
  commentCount = 0,
  onToggleLike,
  onOpenComments,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const likeColor = liked ? colors.accent : colors.textTitle;
  const likeLabel = formatLikeLabel(liked, likeCount);
  const commentLabel = formatCommentLabel(commentCount);

  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.seg}
        onPress={onToggleLike}
        disabled={!onToggleLike}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike round' : 'Like round'}
        accessibilityState={{ selected: liked }}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={22}
          color={likeColor}
        />
        <Text style={[styles.segLabel, { color: likeColor }]}>{likeLabel}</Text>
      </Pressable>
      <Pressable
        style={styles.seg}
        onPress={onOpenComments}
        disabled={!onOpenComments}
        accessibilityRole="button"
        accessibilityLabel={
          commentCount > 0 ? `Open ${commentCount} comments` : 'Open comments'
        }>
        <Ionicons
          name="chatbubble-outline"
          size={22}
          color={colors.textTitle}
        />
        <Text style={styles.segLabel}>{commentLabel}</Text>
      </Pressable>
    </View>
  );
}

function formatLikeLabel(liked: boolean, count: number): string {
  if (count <= 0) return liked ? 'Liked' : 'Like';
  const word = count === 1 ? (liked ? 'liked' : 'like') : liked ? 'liked' : 'likes';
  return `${count} ${word}`;
}

function formatCommentLabel(count: number): string {
  if (count <= 0) return 'Comments';
  const word = count === 1 ? 'comment' : 'comments';
  return `${count} ${word}`;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      paddingTop: 4,
      paddingBottom: 6,
    },
    seg: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 10,
    },
    segLabel: {
      color: colors.textTitle,
      fontSize: 11,
      fontWeight: '700',
    },
  });
}
