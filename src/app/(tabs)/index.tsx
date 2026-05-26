import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export default function Index() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Home screen</Text>
      <Link href="/about" style={styles.button}>
        Go to About Screen
      </Link>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center'
    },
    text: {
      color: colors.textTitle,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 12
    },
    button: {
      fontSize: 16,
      textDecorationLine: 'underline',
      color: colors.primary,
      fontWeight: '600'
    }
  });
}
