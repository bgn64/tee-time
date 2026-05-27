import React from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { Link } from 'expo-router';

import { IncomingRequestsBanner } from '@/components/social/IncomingRequestsBanner';
import { useTheme } from '@/library/theme/ThemeContext';

export default function Index() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}>
      <IncomingRequestsBanner style={styles.banner} />
      <View style={styles.center}>
        <Text style={styles.text}>Home screen</Text>
        <Link href="/about" style={styles.button}>
          Go to About Screen
        </Link>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24
    },
    banner: {
      marginBottom: 16
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32
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
