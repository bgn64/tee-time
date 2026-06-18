import React from 'react';
import { Platform } from 'react-native';
import { Stack, ThemeProvider as NavThemeProvider, DarkTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { enableScreens } from 'react-native-screens';
import { QueryClientProvider } from '@tanstack/react-query';

import { ScreenBackground } from '@/components/aurora';
import { queryClient } from '@/library/data/queryClient';
import { startOutboxAutoFlush } from '@/library/data/writeOutbox';
import { RoundProvider } from '@/library/golf/RoundContext';
import { ThemeProvider, useTheme } from '@/library/theme/ThemeContext';

// react-native-screens stays disabled on web by default, so the bottom-tab
// navigator falls back to plain Views that merely z-index inactive scenes
// behind the active one instead of unmounting them. With the single
// transparent Aurora backdrop (scenes are transparent so the root gradient
// shows through), those inactive scenes bleed through the active tab. Enabling
// screens on web restores proper `display:none` hiding of inactive scenes
// while keeping the transparent backdrop intact. No-op on native (already on).
if (Platform.OS === 'web') {
  enableScreens(true);
}

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
  const { colors } = useTheme();

  // Drain the persistent write outbox on mount, reconnect, and foreground
  // so queued score writes flush as soon as connectivity returns.
  React.useEffect(() => {
    const stop = startOutboxAutoFlush();
    return stop;
  }, []);

  const statusBarStyle = 'light';

  // expo-router defaults to React Navigation's light theme, whose navigator
  // container `background`/`card` would paint OVER the global Aurora gradient
  // (the root Stack, the Tabs, and every nested Stack each fill their own
  // container). Provide a navigation theme with transparent surfaces so the
  // single ScreenBackground shows through everywhere; `contentStyle:transparent`
  // on the inner stacks alone is not enough.
  const navTheme = React.useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: 'transparent',
        card: 'transparent',
        text: colors.textTitle,
        border: colors.glassStroke,
        primary: colors.primary,
        notification: colors.accent,
      },
    }),
    [colors],
  );

  return (
    <NavThemeProvider value={navTheme}>
      <ScreenBackground>
        <RoundProvider>
          <StatusBar style={statusBarStyle} />
          {/*
            Aurora background contract: this single persistent backdrop lives
            behind every route. Keep navigator content/scene backgrounds
            transparent; downstream screens should not wrap themselves in
            ScreenBackground.

            Phone-width framing on wide web/desktop viewports is applied
            per-layer (centred max-width on the AppHeader content, each
            screen's scroll content, and the tab bar) rather than by wrapping
            the navigator here — wrapping the Stack in a centred max-width
            View breaks react-native-screens' hiding of inactive scenes on
            web (inactive tabs bleed through). See PhoneFrame / centred
            contentContainerStyle in the screens.
          */}
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: colors.textTitle,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: 'transparent' }
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
          </Stack>
        </RoundProvider>
      </ScreenBackground>
    </NavThemeProvider>
  );
}