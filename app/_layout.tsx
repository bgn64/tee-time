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
import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { AppHeader } from '@/components/AppHeader';
import { Toast } from '@/components/Toast';
import { AccountProvider, useAccount } from '@/state/AccountContext';
import { FriendsProvider, useFriends } from '@/state/FriendsContext';
import { GolfRoundProvider, useGolfRound } from '@/state/GolfRoundContext';
import { HeaderProvider } from '@/state/HeaderContext';
import { LocationProvider } from '@/state/LocationContext';
import { OnboardingProvider, useOnboarding } from '@/state/OnboardingContext';
import { PlayerProvider, usePlayers } from '@/state/PlayerContext';
import { ProfileCacheProvider } from '@/state/ProfileCacheContext';
import { AppThemeProvider, useTheme } from '@/state/ThemeContext';
import { ToastProvider, useToast } from '@/state/ToastContext';
import { useSplashGate } from '@/state/useSplashGate';
import { writeQueue } from '@/state/writeQueue';

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
      <ToastProvider>
        <HeaderProvider>
          <AccountProvider>
            <PlayerProvider>
              <GolfRoundProvider>
                <ProfileCacheProvider>
                  <FriendsProvider>
                    <LocationProvider>
                      <OnboardingProvider>
                        <RootLayoutNav />
                      </OnboardingProvider>
                    </LocationProvider>
                  </FriendsProvider>
                </ProfileCacheProvider>
              </GolfRoundProvider>
            </PlayerProvider>
          </AccountProvider>
        </HeaderProvider>
      </ToastProvider>
    </AppThemeProvider>
  );
}

function RootLayoutNav() {
  const pathname = usePathname();
  const { colors, hydrated: themeHydrated } = useTheme();
  const { hydrated: playerHydrated } = usePlayers();
  const { hydrated: roundHydrated } = useGolfRound();
  const { hydrated: accountHydrated } = useAccount();
  const { hydrated: friendsHydrated } = useFriends();
  const { hydrated: onboardingHydrated, nextPrimer } = useOnboarding();

  // Register the global dead-letter handler ONCE, at the layout level, so
  // any permanent write-queue failure surfaces as a toast with a Retry
  // action. The handler is global on the queue (one slot), so it must
  // live at a shared point above the individual contexts. We read
  // `toast.show` via a ref so the registered handler always sees the
  // latest closure without needing to re-register.
  const { show: toastShow } = useToast();
  const toastShowRef = useRef(toastShow);
  toastShowRef.current = toastShow;

  useEffect(() => {
    writeQueue.setDeadLetterHandler((entry) => {
      // In dev builds, surface the actual table + error in the toast so
      // we can debug sync regressions without digging through the
      // console. In production, keep the friendly message to avoid
      // leaking implementation details to end users.
      const message = __DEV__
        ? `Sync failed: ${entry.table}.${entry.op} (${entry.lastError?.code ?? '?'}) — ${entry.lastError?.message ?? 'unknown'}`
        : "Couldn't sync your last change. Tap to retry.";
      toastShowRef.current(message, {
        action: {
          label: 'Retry',
          onPress: () => {
            void writeQueue.flush();
          },
        },
        autoHideMs: __DEV__ ? 12000 : 8000,
      });
    });
    return () => {
      writeQueue.setDeadLetterHandler(null);
    };
  }, []);

  const allHydrated = useSplashGate({
    theme: themeHydrated,
    player: playerHydrated,
    round: roundHydrated,
    account: accountHydrated,
    friends: friendsHydrated,
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
          <Stack.Screen name="auth/confirm" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="settings" />
        </Stack>
      </View>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
