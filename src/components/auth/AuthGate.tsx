/**
 * AuthGate — gates its children behind an active Supabase session.
 *
 * Subscribes to `onAuthStateChange` so login/logout transitions flip the
 * gate live. While the initial session lookup is pending, renders a
 * themed loading indicator instead of flashing the sign-in screen.
 *
 * Mounted inside `(tabs)/_layout.tsx`, NOT at the root layout, so the
 * Expo Router navigator tree stays mounted across sign-in/sign-out
 * transitions.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { useSystem } from '@/library/powersync/system';
import { useTheme } from '@/library/theme/ThemeContext';
import { SignInScreen } from './SignInScreen';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const system = useSystem();
  const { colors } = useTheme();
  const [session, setSession] = React.useState<Session | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session: initialSession }
      } = await system.supabaseConnector.client.auth.getSession();
      if (!cancelled) {
        setSession(initialSession);
        setChecking(false);
      }
    })();

    const {
      data: { subscription }
    } = system.supabaseConnector.client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [system]);

  if (checking) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
