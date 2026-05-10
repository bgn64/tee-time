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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/state/ThemeContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Add the device's bottom safe-area inset (Android nav-bar / iPhone home
  // indicator) on top of our base tab-bar padding so labels never disappear
  // under the system chrome. Total height grows by `insets.bottom` to keep
  // the icon row vertically centered above the inset.
  const baseHeight = 60;
  const baseBottomPad = 8;

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
