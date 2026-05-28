import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AuthGate } from '@/components/auth/AuthGate';
import { AccountProvider } from '@/library/social/AccountContext';
import { FriendsProvider } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    // Provider topology:
    //   AccountProvider — outside AuthGate so the gate's stage-2
    //                     check can call useAccount().
    //   AuthGate       — runs stages 1 (session) and 2 (profile row).
    //   FriendsProvider — inside the gate so it only mounts once both
    //                     stages have cleared and `account` is non-null.
    <AccountProvider>
      <AuthGate>
        <FriendsProvider>
          <Tabs initialRouteName="(home)"
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
              name="(home)"
              options={{
                title: 'Home',
                headerShown: false,
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
                )
              }}
            />
            <Tabs.Screen
              name="(search)"
              options={{
                title: 'Search',
                headerShown: false,
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons
                    name={focused ? 'search' : 'search-outline'}
                    color={color}
                    size={24}
                  />
                )
              }}
            />
            <Tabs.Screen
              name="(score)"
              options={{
                title: 'Score',
                headerShown: false,
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons
                    name={focused ? 'pencil-sharp' : 'pencil-outline'}
                    color={color}
                    size={24}
                  />
                )
              }}
            />
            <Tabs.Screen
              name="(rounds)"
              options={{
                title: 'Rounds',
                headerShown: false,
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons
                    name={focused ? 'golf' : 'golf-outline'}
                    color={color}
                    size={24}
                  />
                )
              }}
            />
            <Tabs.Screen
              name="(you)"
              options={{
                title: 'You',
                headerShown: false,
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons
                    name={focused ? 'person-circle' : 'person-circle-outline'}
                    color={color}
                    size={24}
                  />
                )
              }}
            />
          </Tabs>
        </FriendsProvider>
      </AuthGate>
    </AccountProvider>
  );
}
