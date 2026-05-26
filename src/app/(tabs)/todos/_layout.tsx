import React from 'react';
import { Stack } from 'expo-router';

import { useTheme } from '@/library/theme/ThemeContext';

export default function TodosLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.tabBar },
        headerTintColor: colors.textTitle,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background }
      }}>
      <Stack.Screen name="index" options={{ title: 'Lists' }} />
      <Stack.Screen name="[id]" options={{ title: 'List' }} />
    </Stack>
  );
}
