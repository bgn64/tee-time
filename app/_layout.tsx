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
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { AppHeader } from '@/components/AppHeader';
import { AccountProvider, useAccount } from '@/state/AccountContext';
import { GolfRoundProvider, useGolfRound } from '@/state/GolfRoundContext';
import { HeaderProvider } from '@/state/HeaderContext';
import { LocationProvider } from '@/state/LocationContext';
import { OnboardingProvider, useOnboarding } from '@/state/OnboardingContext';
import { PlayerProvider, usePlayers } from '@/state/PlayerContext';
import { SocialProvider, useSocial } from '@/state/SocialContext';
import { AppThemeProvider, useTheme } from '@/state/ThemeContext';
import { useSplashGate } from '@/state/useSplashGate';

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
              <SocialProvider>
                <LocationProvider>
                  <OnboardingProvider>
                    <RootLayoutNav />
                  </OnboardingProvider>
                </LocationProvider>
              </SocialProvider>
            </GolfRoundProvider>
          </PlayerProvider>
        </AccountProvider>
      </HeaderProvider>
    </AppThemeProvider>
  );
}

function RootLayoutNav() {
  const pathname = usePathname();
  const { colors, hydrated: themeHydrated } = useTheme();
  const { hydrated: playerHydrated } = usePlayers();
  const { hydrated: roundHydrated } = useGolfRound();
  const { hydrated: accountHydrated } = useAccount();
  const { hydrated: socialHydrated } = useSocial();
  const { hydrated: onboardingHydrated, nextPrimer } = useOnboarding();

  const allHydrated = useSplashGate({
    theme: themeHydrated,
    player: playerHydrated,
    round: roundHydrated,
    account: accountHydrated,
    social: socialHydrated,
    onboarding: onboardingHydrated,
  });

  useEffect(() => {
    if (allHydrated) {
      SplashScreen.hideAsync();
    }
  }, [allHydrated]);

  // Onboarding routing: when the user has an unseen primer, push them
  // to the corresponding screen. Runs after the splash + initial render
  // so the navigator is fully mounted. Wrapped in a microtask so the
  // navigation dispatches AFTER React commits the Stack children — on
  // first launch the Stack registration and the effect both fire in
  // the same frame, and dispatching synchronously can lose the race.
  useEffect(() => {
    if (!allHydrated) return;
    if (!nextPrimer) return;
    if (pathname.startsWith('/auth')) return;
    const path: '/onboarding/account' | '/onboarding/location' =
      nextPrimer === 'account' ? '/onboarding/account' : '/onboarding/location';
    if (pathname === path) return;
    if (nextPrimer === 'account' && pathname === '/sign-in') return;
    const id = setTimeout(() => {
      router.replace(path);
    }, 0);
    return () => clearTimeout(id);
  }, [allHydrated, nextPrimer, pathname]);

  // If the auth flow lands a freshly-signed-in user without a profile
  // (e.g. Google OAuth bounces back to the app at '/'), surface the
  // handle-picker UI by pushing them into the sign-in screen. The
  // screen's own state machine moves them to the handle step.
  const { needsProfile } = useAccount();
  useEffect(() => {
    if (!allHydrated) return;
    if (!needsProfile) return;
    const id = setTimeout(() => {
      router.replace('/sign-in');
    }, 0);
    return () => clearTimeout(id);
  }, [allHydrated, needsProfile]);

  if (!allHydrated) {
    return null;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppHeader />
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="settings" />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
