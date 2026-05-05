/**
 * Persistent top banner displaying the app name across all screens.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

export function TopBanner() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>TeeTime</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.background,
      paddingTop: 54,
      paddingBottom: 12,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    appName: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.primaryDark,
      letterSpacing: 0.5,
    },
  });
}
