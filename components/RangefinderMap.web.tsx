import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RangefinderMapProps } from '@/components/RangefinderMap.types';
import { useTheme } from '@/state/ThemeContext';

export function RangefinderMap(_props: RangefinderMapProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.placeholder}>
      <Text style={styles.icon}>⌖</Text>
      <Text style={styles.title}>Rangefinder is available on mobile</Text>
      <Text style={styles.body}>
        The web version will use a separate map provider later. Open Tee Time on
        iOS or Android to use satellite yardages.
      </Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    placeholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 24,
      backgroundColor: colors.chipBg,
    },
    icon: {
      fontSize: 34,
      color: colors.primaryDark,
      fontWeight: '900',
    },
    title: {
      fontSize: 17,
      fontWeight: '900',
      color: colors.textTitle,
      textAlign: 'center',
    },
    body: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 280,
    },
  });
}
