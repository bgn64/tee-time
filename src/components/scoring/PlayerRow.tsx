/**
 * One-line player row used on the Score-tab players-picker screen.
 *
 * Avatar circle + nickname + a checkbox-style indicator on the right
 * that flips between filled / outline depending on `selected`. "You"
 * is always selected and locked — the caller passes `locked` to gray
 * out the toggle.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/library/theme/ThemeContext';
import type { Player } from '@/types/golf';

type Props = {
  player: Player;
  selected: boolean;
  locked?: boolean;
  onToggle: () => void;
};

export function PlayerRow({ player, selected, locked, onToggle }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      style={[styles.row, selected && styles.rowSelected]}
      onPress={locked ? undefined : onToggle}
      disabled={locked}>
      <View style={[styles.avatar, { backgroundColor: player.color ?? colors.primary }]}>
        <Text style={styles.avatarLetter}>
          {(player.nickname[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {player.nickname}
      </Text>
      {locked ? (
        <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
      ) : null}
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.primary : colors.textMuted}
      />
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowSelected: {
      borderColor: colors.primary,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
    },
    name: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
  });
}
