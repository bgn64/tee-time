/**
 * GearToggleButton — small sliders icon used as the inline gear
 * affordance in the Score Detail accordion header. Tapping toggles
 * the accordion body between per-hole tag entry and the per-scorer
 * filter (gear) panel.
 *
 * Three horizontal lines + offset filled circles, matching the
 * mockup's section 4b icon. Pure visual; the parent owns the state.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  active: boolean;
  onToggle: () => void;
};

export function GearToggleButton({ active, onToggle }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onToggle}
      style={[styles.btn, active ? styles.btnActive : null]}
      accessibilityRole="button"
      accessibilityLabel={
        active ? 'Back to tag entry' : 'Edit tracked stats'
      }
      accessibilityState={{ selected: active }}>
      <View style={styles.iconWrap}>
        <Ionicons
          name="options-outline"
          size={14}
          color={active ? colors.primaryDark : colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    btn: {
      width: 26,
      height: 26,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnActive: {
      backgroundColor: 'rgba(47,125,75,0.14)',
    },
    iconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
