import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/library/data/queryClient';
import { startOutboxAutoFlush } from '@/library/data/writeOutbox';
import { RoundProvider } from '@/library/golf/RoundContext';
import { ThemeProvider, useTheme } from '@/library/theme/ThemeContext';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootLayoutInner() {
  const { colors, themeName } = useTheme();

  // Drain the persistent write outbox on mount, reconnect, and foreground
  // so queued score writes flush as soon as connectivity returns.
  React.useEffect(() => {
    const stop = startOutboxAutoFlush();
    return stop;
  }, []);

  // StatusBar style is inverted vs theme: dark theme -> light icons.
  const statusBarStyle = themeName === 'dark' ? 'light' : 'dark';

  return (
    <RoundProvider>
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
    </RoundProvider>
  );
}