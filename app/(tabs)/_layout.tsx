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
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { incomingRequests } = useSocial();
  const insets = useSafeAreaInsets();

  const baseHeight = 60;
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
          paddingTop: 6,
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
      />
    </Tabs>
  );
}
