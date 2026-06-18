/**
 * SectionLabel — uppercase muted section header with optional right content.
 */

import React, { useMemo, type JSX } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function SectionLabel(props: { children: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.row, props.style]}>
      <Text style={styles.label}>{props.children}</Text>
      {props.right ? <View style={styles.right}>{props.right}</View> : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginHorizontal: 4,
      marginTop: 14,
      marginBottom: 10,
    },
    label: {
      flexShrink: 1,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.7,
      textTransform: 'uppercase',
    },
    right: {
      flexShrink: 0,
    },
  });
}
