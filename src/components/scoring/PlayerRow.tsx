/**
 * One-line player row used on the Score-tab players-picker screen.
 *
 * Avatar circle + nickname + a checkbox-style indicator on the right
 * that flips between filled / outline depending on `selected`. "You"
 * is always selected and locked — the caller passes `locked` to gray
 * out the toggle.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/aurora';
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
      <Avatar initial={player.nickname} color={player.color ?? colors.cyan} size={34} circle />
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
      backgroundColor: colors.glassFill,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    rowSelected: {
      backgroundColor: colors.glowLime,
      borderColor: colors.lime,
    },
    name: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
  });
}
