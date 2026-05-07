/**
 * Tab navigation layout for the golf scoring app's five sections:
 * Feed (stub) · Rounds · Score · People · You.
 *
 * Visual order matches docs/tab-layout-mockups.html (with Score in the middle
 * for thumb-zone access). Feed is a placeholder until Phase 3 social work lands.
 *
 * `initialRouteName="(score)"` makes Score the default landing tab on cold
 * launch without altering the tab-bar order. Combined with the resume effect
 * inside `(score)/index.tsx`, this means a user with a persisted in-progress
 * round is dropped straight back into `/scoring` on relaunch.
 */

import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';

import { useTheme } from '@/state/ThemeContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      initialRouteName="(score)"
      screenOptions={{
        headerShown: false,
        // Per design mock: active tab uses the theme accent color.
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: 60,
          paddingTop: 6,
          paddingBottom: 8,
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
        name="(rounds)"
        options={{
          title: 'Rounds',
          tabBarIcon: ({ color }) => <TabBarIcon name="history" color={color} />,
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
        name="(people)"
        options={{
          title: 'People',
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="(you)"
        options={{
          title: 'You',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
