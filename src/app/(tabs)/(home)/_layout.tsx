/**
 * Home tab stack.
 *
 * Owns:
 *   index            — the friend-rounds feed.
 *   round/[id]       — round detail (tapped through from a feed card).
 *                      Mirrors the Previous-rounds detail in the
 *                      Rounds tab; both routes render the shared
 *                      `<RoundDetailView />`. Lives in this stack so
 *                      back navigation returns to the feed.
 *   profile/[userId] — drill-ins from any participant tap on a feed
 *                      card. Mirrors (you) / (search) — each tab that
 *                      can reach a profile owns its own copy of the
 *                      profile route so back navigation stays inside
 *                      the tab.
 *
 * `unstable_settings.initialRouteName` tells expo-router that
 * `index` is the canonical first screen of this stack. Without it,
 * a deep link / web reload that lands on `round/[id]` (or
 * `profile/[userId]`) starts the stack with only that one screen
 * and the back arrow disappears because there's no parent to pop
 * to. With it, expo-router synthesizes the parent so `back` works
 * cleanly.
 *
 * Mirrors the (you) stack layout: each screen owns its title; the
 * Stack supplies the chrome.
 */

import { Stack } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { HeaderAvatar } from '@/components/HeaderAvatar';
import { ScreenBackground } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function HomeLayout() {
  const { colors } = useTheme();
  return (
    <ScreenBackground>
      <Stack
        screenOptions={{
          header: (props) => <AppHeader {...props} />,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: colors.textTitle,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: 'transparent' }
        }}>
        <Stack.Screen
          name="index"
          options={{ title: 'Tee·Time', headerRight: () => <HeaderAvatar /> }}
        />
        <Stack.Screen name="round/[id]" options={{ title: 'Round' }} />
        <Stack.Screen name="profile/[userId]" options={{ title: 'Profile' }} />
      </Stack>
    </ScreenBackground>
  );
}
