import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Link, Stack } from 'expo-router';

import { GlassCard, NeonButton } from '@/components/aurora';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/library/theme/ThemeContext';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <>
      <Stack.Screen options={{ title: 'Oops! Not Found' }} />
      <View style={styles.container}>
        <GlassCard strong glow style={styles.card}>
          <Logo size={68} variant="disc" />
          <Text style={styles.title}>Lost in the rough</Text>
          <Text style={styles.body}>That screen isn&apos;t on this course.</Text>
          <Link href="/" asChild>
            <NeonButton label="Go home" style={styles.button} />
          </Link>
        </GlassCard>
      </View>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24
    },
    card: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center'
    },
    title: {
      marginTop: 18,
      fontSize: 24,
      fontWeight: '800',
      color: colors.textTitle
    },
    body: {
      marginTop: 8,
      marginBottom: 20,
      fontSize: 14,
      color: colors.textBody,
      textAlign: 'center'
    },
    button: {
      alignSelf: 'stretch'
    }
  });
}
