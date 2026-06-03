/**
 * RoundActionBar — action bar at the bottom of every round card.
 *
 * Layout: equal-width Like + Comments segments, with an optional Edit
 * segment appended when `onEdit` is wired (typically only on the
 * owner's completed rounds — feed cards leave it undefined).
 *
 * Per the mockup, the heart fills with the accent colour when
 * `liked` is true; the label flips between "Like"/"Liked" and the
 * count is shown when > 0 ("3 likes" / "3 liked").
 *
 * Icon choice: Ionicons (already a dep via `@expo/vector-icons`);
 * `heart-outline` / `heart` + `chatbubble-outline` + `create-outline`
 * give us the line + filled looks the mockup uses without bringing in
 * a second icon library.
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
  /**
   * When wired, an "Edit" segment is rendered after Comments. The
   * RoundListCard passes this only when the signed-in user owns the
   * round AND it's completed — feed cards for friends' rounds leave
   * it undefined so the segment is hidden.
   */
  onEdit?: () => void;
};

export function RoundActionBar({
  liked = false,
  likeCount = 0,
  commentCount = 0,
  onToggleLike,
  onOpenComments,
  onEdit,
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
      {onEdit ? (
        <Pressable
          style={styles.seg}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit this round">
          <Ionicons
            name="create-outline"
            size={22}
            color={colors.textTitle}
          />
          <Text style={styles.segLabel}>Edit</Text>
        </Pressable>
      ) : null}
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
