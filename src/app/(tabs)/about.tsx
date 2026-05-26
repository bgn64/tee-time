import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';

export default function AboutScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.text}>About screen</Text>
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
      fontWeight: '700'
    }
  });
}
