import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';

import { PHONE_MAX_WIDTH } from '@/components/aurora';
import { AuthGate } from '@/components/auth/AuthGate';
import { AccountProvider } from '@/library/social/AccountContext';
import { FriendsProvider } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

/**
 * Tab bar icons rendered as the mockup's geometric glyphs (◎ ＋ ⌕ ◔)
 * instead of vector icons, so the footer matches the Aurora design doc.
 * Active/inactive tint comes from the navigator via `color`.
 */
function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={[styles.tabGlyph, { color }]}>{glyph}</Text>;
}

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
                backgroundColor: 'transparent'
              },
              headerShadowVisible: false,
              headerTintColor: colors.textTitle,
              tabBarStyle: {
                width: '100%',
                maxWidth: PHONE_MAX_WIDTH,
                alignSelf: 'center',
                backgroundColor: colors.tabBar,
                borderTopColor: colors.glassStroke,
                borderTopWidth: StyleSheet.hairlineWidth,
                elevation: 0,
                shadowOpacity: 0
              },
              sceneStyle: { backgroundColor: 'transparent' }
            }}>
            <Tabs.Screen
              name="(home)"
              options={{
                title: 'Feed',
                headerShown: false,
                tabBarIcon: ({ color }) => <TabGlyph glyph="◎" color={color} />
              }}
            />
            <Tabs.Screen
              name="(score)"
              options={{
                title: 'Score',
                headerShown: false,
                tabBarIcon: ({ color }) => <TabGlyph glyph="＋" color={color} />
              }}
            />
            <Tabs.Screen
              name="(search)"
              options={{
                title: 'Search',
                headerShown: false,
                tabBarIcon: ({ color }) => <TabGlyph glyph="⌕" color={color} />
              }}
            />
            <Tabs.Screen
              name="(you)"
              options={{
                title: 'You',
                headerShown: false,
                tabBarIcon: ({ color }) => <TabGlyph glyph="◔" color={color} />
              }}
            />
          </Tabs>
        </FriendsProvider>
      </AuthGate>
    </AccountProvider>
  );
}

const styles = StyleSheet.create({
  tabGlyph: {
    fontSize: 21,
    lineHeight: 24,
    textAlign: 'center'
  }
});
