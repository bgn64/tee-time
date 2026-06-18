/**
 * RoundActionBar — action bar at the bottom of every round card.
 *
 * Layout: equal-width Like + Comments segments — uniform on every
 * round. Round-level actions (Edit, …) live in the header's ⋯ menu,
 * not here, so the footer looks the same across all cards.
 *
 * Per the mockup, the heart fills with the accent colour when
 * `liked` is true; the label flips between "Like"/"Liked" and the
 * count is shown when > 0 ("3 likes" / "3 liked").
 *
 * Icon choice: Ionicons (already a dep via `@expo/vector-icons`);
 * `heart-outline` / `heart` + `chatbubble-outline` give us the line +
 * filled looks the mockup uses without bringing in a second icon library.
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
  /** When set, an "Open round →" affordance is shown at the trailing edge. */
  onOpenRound?: () => void;
};

export function RoundActionBar({
  liked = false,
  likeCount = 0,
  commentCount = 0,
  onToggleLike,
  onOpenComments,
  onOpenRound,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const likeColor = liked ? colors.lime : colors.textMuted;

  return (
    <View style={styles.bar}>
      <Pressable
        style={[styles.react, liked ? styles.reactLiked : null]}
        onPress={onToggleLike}
        disabled={!onToggleLike}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike round' : 'Like round'}
        accessibilityState={{ selected: liked }}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={18}
          color={likeColor}
        />
        {likeCount > 0 ? (
          <Text style={[styles.count, { color: likeColor }]}>{likeCount}</Text>
        ) : null}
      </Pressable>
      <Pressable
        style={styles.react}
        onPress={onOpenComments}
        disabled={!onOpenComments}
        accessibilityRole="button"
        accessibilityLabel={
          commentCount > 0 ? `Open ${commentCount} comments` : 'Open comments'
        }>
        <Ionicons
          name="chatbubble-outline"
          size={17}
          color={colors.textMuted}
        />
        {commentCount > 0 ? (
          <Text style={styles.count}>{commentCount}</Text>
        ) : null}
      </Pressable>
      {onOpenRound ? (
        <Pressable
          style={styles.openBtn}
          onPress={onOpenRound}
          accessibilityRole="button"
          accessibilityLabel="Open round detail">
          <Text style={styles.openText}>Open round →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
      paddingTop: 10,
      paddingBottom: 12,
      paddingHorizontal: 16,
      gap: 8,
    },
    react: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    reactLiked: {
      borderColor: colors.lime,
      backgroundColor: colors.glowLime,
    },
    count: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: '800',
    },
    openBtn: {
      marginLeft: 'auto',
      paddingVertical: 7,
      paddingHorizontal: 4,
    },
    openText: {
      color: colors.cyan,
      fontSize: 13,
      fontWeight: '800',
    },
  });
}
