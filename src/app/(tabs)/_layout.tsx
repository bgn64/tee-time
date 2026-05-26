import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AuthGate } from '@/components/auth/AuthGate';
import { useTheme } from '@/library/theme/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <AuthGate>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tabBarActive,
          tabBarInactiveTintColor: colors.tabBarInactive,
          headerStyle: {
            backgroundColor: colors.tabBar
          },
          headerShadowVisible: false,
          headerTintColor: colors.textTitle,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border
          },
          sceneStyle: { backgroundColor: colors.background }
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
            )
          }}
        />
        <Tabs.Screen
          name="about"
          options={{
            title: 'About',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'information-circle' : 'information-circle-outline'}
                color={color}
                size={24}
              />
            )
          }}
        />
        <Tabs.Screen
          name="todos"
          options={{
            title: 'Todos',
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'list-circle' : 'list-circle-outline'}
                color={color}
                size={24}
              />
            )
          }}
        />
      </Tabs>
    </AuthGate>
  );
}
