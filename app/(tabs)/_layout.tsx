/**
 * Tab navigation layout for the golf scoring app's four sections:
 * Feed · Score · Rounds · You.
 *
 * Visual order matches docs/tab-layout-mockups.html (with Score in the
 * left-hand thumb zone). The People tab was dissolved into the You tab —
 * the friends list, search, and per-person detail now live as a nested
 * stack under (you)/friends, reached by drill-in from the You landing.
 *
 * `initialRouteName="(score)"` makes Score the default landing tab on cold
 * launch without altering the tab-bar order. Combined with the resume effect
 * inside `(score)/index.tsx`, this means a user with a persisted in-progress
 * round is dropped straight back into `/scoring` on relaunch.
 *
 * The You tab carries a small badge dot when there are pending incoming
 * friend requests — same signal surfaced on the Friends row inside the
 * You landing and via the pinned banner on the Feed.
 */

import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, Tabs, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFriends } from '@/state/FriendsContext';
import { useTheme } from '@/state/ThemeContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: 0 }} {...props} />;
}

/**
 * Phase 2.2 re-tap helper.
 *
 * Expo Router preserves per-tab stack state, so re-tapping the You/Rounds
 * tab while already inside a nested child route does nothing visible. The
 * `tabPress` listener returned here intercepts that re-tap and replaces
 * the URL with the tab root, popping the stack to the landing screen.
 *
 * Detection uses `useSegments()` rather than `usePathname()` because the
 * pathname is normalized — for example, `app/(tabs)/(rounds)/[id].tsx`
 * resolves to `/<roundId>`, which is indistinguishable from any other
 * single-segment top-level route. `useSegments()` keeps the route-group
 * prefixes (e.g. `['(tabs)', '(rounds)', '[id]']`), so a check of
 * `segments[1] === groupName && segments.length > 2` unambiguously
 * identifies "user is on a child of this tab".
 *
 * The function is exported (and pure) so it can be unit-tested without
 * mounting the navigator — see `components/__tests__/TabLayout.test.tsx`.
 *
 * NOTE: this is intentionally NOT applied to the Score tab. The
 * `(score)/index.tsx` screen's `useFocusEffect` redirects to
 * `/(tabs)/(score)/scoring` when an in-progress round is detected, and a
 * tab-press-pop would race that redirect.
 */
export function makeTabRetapListener(
  segments: readonly string[],
  groupName: '(you)' | '(rounds)',
): { tabPress: (e: { preventDefault: () => void }) => void } {
  return {
    tabPress: (e) => {
      const onChild =
        segments[0] === '(tabs)' &&
        segments[1] === groupName &&
        segments.length > 2;
      if (!onChild) return;
      e.preventDefault();
      if (groupName === '(you)') {
        router.replace('/(tabs)/(you)');
      } else {
        router.replace('/(tabs)/(rounds)');
      }
    },
  };
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { incomingRequests } = useFriends();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as readonly string[];

  const baseHeight = 64;
  const baseBottomPad = 8;

  const hasPendingRequests = incomingRequests.length > 0;

  return (
    <Tabs
      initialRouteName="(score)"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: baseHeight + insets.bottom,
          paddingTop: 8,
          paddingBottom: baseBottomPad + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
      }}>
      <Tabs.Screen
        name="(feed)"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <TabBarIcon name="newspaper-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="(score)"
        options={{
          title: 'Score',
          tabBarIcon: ({ color }) => <TabBarIcon name="flag" color={color} />,
        }}
      />
      <Tabs.Screen
        name="(rounds)"
        options={{
          title: 'Rounds',
          tabBarIcon: ({ color }) => <TabBarIcon name="history" color={color} />,
        }}
        listeners={() => makeTabRetapListener(segments, '(rounds)')}
      />
      <Tabs.Screen
        name="(you)"
        options={{
          title: 'You',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          tabBarBadge: hasPendingRequests ? ' ' : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            minWidth: 8,
            maxWidth: 8,
            height: 8,
            borderRadius: 4,
            marginLeft: -2,
            marginTop: 2,
          },
        }}
        listeners={() => makeTabRetapListener(segments, '(you)')}
      />
    </Tabs>
  );
}
