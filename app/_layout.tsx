/**
 * Root app layout that loads fonts, applies theming, and hosts app-wide providers.
 *
 * Splash screen is held until two conditions are met:
 *   1. Fonts are loaded (gates whether the providers mount at all).
 *   2. All persisted contexts have hydrated from AsyncStorage (gates content rendering).
 *
 * This prevents the seed-data flash where roster / courses / theme briefly
 * render with defaults before storage hydration replaces them.
 */

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { AppHeader } from '@/components/AppHeader';
import { AccountProvider, useAccount } from '@/state/AccountContext';
import { GolfRoundProvider, useGolfRound } from '@/state/GolfRoundContext';
import { HeaderProvider } from '@/state/HeaderContext';
import { PlayerProvider, usePlayers } from '@/state/PlayerContext';
import { AppThemeProvider, useTheme } from '@/state/ThemeContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <AppThemeProvider>
      <HeaderProvider>
        <AccountProvider>
          <PlayerProvider>
            <GolfRoundProvider>
              <RootLayoutNav />
            </GolfRoundProvider>
          </PlayerProvider>
        </AccountProvider>
      </HeaderProvider>
    </AppThemeProvider>
  );
}

function RootLayoutNav() {
  const { colors, hydrated: themeHydrated } = useTheme();
  const { hydrated: playerHydrated } = usePlayers();
  const { hydrated: roundHydrated } = useGolfRound();
  const { hydrated: accountHydrated } = useAccount();

  const allHydrated = themeHydrated && playerHydrated && roundHydrated && accountHydrated;

  useEffect(() => {
    if (allHydrated) {
      SplashScreen.hideAsync();
    }
  }, [allHydrated]);

  // Hold rendering until storage has been read so seeded values don't flash
  // before being replaced by hydrated state.
  if (!allHydrated) {
    return null;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppHeader />
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
