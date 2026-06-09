/**
 * AuthGate — two-stage gate before the Tabs render.
 *
 *   Stage 1: session present (Supabase). While checking, themed spinner.
 *            If no session → render `<SignInScreen />` (email step).
 *
 *   Stage 2: profile row present (`AccountContext`). While the account
 *            is booting, themed spinner. If `needsProfile` → render
 *            `<SignInScreen initialStep="handle" />` so the just-signed-in
 *            user can pick a display name + @handle before the tabs render.
 *            If we couldn't load the profile AND have no cached copy
 *            (offline first launch) → render a small retry screen.
 *            Only when `status === 'ready'` do we render children.
 *
 * Provider topology (set up in `(tabs)/_layout.tsx`):
 *
 *     <AccountProvider>
 *       <AuthGate>
 *         <FriendsProvider>
 *           <Tabs ... />
 *         </FriendsProvider>
 *       </AuthGate>
 *     </AccountProvider>
 *
 * AccountProvider is OUTSIDE AuthGate so AuthGate's stage 2 can call
 * `useAccount()`. FriendsProvider is INSIDE so it only mounts once both
 * stages have cleared (and `account` is guaranteed non-null).
 *
 * Mounted inside `(tabs)/_layout.tsx`, NOT at the root layout, so the
 * Expo Router navigator tree stays mounted across sign-in/sign-out
 * transitions.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { signOut } from '@/library/supabase/auth';
import { supabase } from '@/library/supabase/client';
import { useTheme } from '@/library/theme/ThemeContext';
import { useAccount } from '@/library/social/AccountContext';
import { SignInScreen } from './SignInScreen';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { colors } = useTheme();
  const [session, setSession] = React.useState<Session | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session: initialSession }
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setSession(initialSession);
        setChecking(false);
      }
    })();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

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

  // Stage 2 — profile row check, delegated to AccountContext.
  return <ProfileStage>{children}</ProfileStage>;
}

/**
 * Stage 2 of AuthGate. Lives in its own component so the `useAccount`
 * call doesn't run until we know we have a session — otherwise the
 * `<AccountProvider>` would still be wrapping us (it is — see provider
 * topology in the AuthGate header) but the account would be perpetually
 * booting if there's no session and we'd waste a render. Splitting also
 * keeps the stage-1 branches readable.
 */
function ProfileStage({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { status, refresh } = useAccount();

  if (status === 'booting') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === 'needsProfile') {
    return <SignInScreen initialStep="handle" />;
  }

  if (status === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.textTitle }]}>
          Couldn&apos;t load your profile
        </Text>
        <Text style={[styles.errorBody, { color: colors.textBody }]}>
          Check your connection and try again. If the problem persists, sign out and back in.
        </Text>
        <Pressable
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            void refresh();
          }}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
        <Pressable
          style={styles.signOutButton}
          onPress={() => {
            void signOut();
          }}>
          <Text style={[styles.signOutButtonText, { color: colors.textMuted }]}>
            Sign out
          </Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center'
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  signOutButton: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  signOutButtonText: {
    fontSize: 13,
    fontWeight: '600'
  }
});
