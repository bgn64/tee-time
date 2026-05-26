import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PowerSyncContext } from '@powersync/react';

import { SystemContext, system } from '@/library/powersync/system';
import { ThemeProvider, useTheme } from '@/library/theme/ThemeContext';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}

function RootLayoutInner() {
  const { colors, themeName } = useTheme();
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    system
      .init()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // StatusBar style is inverted vs theme: dark theme → light icons.
  const statusBarStyle = themeName === 'dark' ? 'light' : 'dark';

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar style={statusBarStyle} />
        <Text style={[styles.errorTitle, { color: colors.accent }]}>
          Failed to initialise PowerSync
        </Text>
        <Text style={[styles.errorBody, { color: colors.textBody }]}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar style={statusBarStyle} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SystemContext.Provider value={system}>
      <PowerSyncContext.Provider value={system.powersync}>
        <StatusBar style={statusBarStyle} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textTitle,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background }
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        </Stack>
      </PowerSyncContext.Provider>
    </SystemContext.Provider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center'
  }
});
