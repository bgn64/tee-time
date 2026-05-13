/**
 * DevAccountPicker — dev-only quick-login panel on the sign-in screen.
 *
 * Renders one circular avatar per row in `constants/devTestAccounts.ts`.
 * Tap a face → `supabase.auth.signInWithPassword` with the seeded
 * credentials → the existing `onAuthStateChange` plumbing in
 * `AccountContext` populates the rest. Pairs with the
 * `scripts/seed-test-users.ts` script that materializes these accounts.
 *
 * Gated entirely behind `__DEV__` so production bundles don't ship it.
 * Inside `__DEV__` we additionally bail out when the Supabase URL
 * doesn't look like a dev endpoint (localhost / 127.0.0.1 / *.supabase.local)
 * so a dev build accidentally pointed at prod still hides the picker.
 *
 * Combine with browser profiles for parallel multi-account testing:
 * Chrome / Edge → People → Add — one profile per test user — pin a
 * shortcut for each. Each profile has its own localStorage so the
 * Supabase session doesn't collide across windows. Open all four
 * profiles side-by-side, tap the matching face in each, done.
 */

import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DEV_TEST_ACCOUNTS,
  type DevTestAccount,
} from '@/constants/devTestAccounts';
import { showAlert } from '@/lib/dialog';
import { useAccount } from '@/state/AccountContext';
import { useTheme } from '@/state/ThemeContext';

function isDevSupabaseTarget(): boolean {
  // EXPO_PUBLIC_* envvars are inlined at build time. We accept the
  // common local Supabase hostnames; supabase.co is also allowed
  // because the developer's personal dev project lives there and the
  // outer `__DEV__` gate keeps this off production bundles regardless.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  return (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('host.docker.internal') ||
    url.includes('.supabase.local') ||
    url.includes('kong:8000') ||
    url.includes('.supabase.co')
  );
}

export function DevAccountPicker() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signInWithPassword } = useAccount();
  const [busy, setBusy] = useState<string | null>(null);

  // Hard gate: never render outside dev builds.
  if (!__DEV__) return null;
  if (!isDevSupabaseTarget()) return null;

  const onTap = async (acc: DevTestAccount) => {
    setBusy(acc.handle);
    const r = await signInWithPassword(acc.email, acc.password);
    setBusy(null);
    if (!r.ok) {
      showAlert(
        `Could not sign in as ${acc.handle}`,
        r.error +
          '\n\nDid you run `npm run seed:test-users`? You also need ' +
          'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.'
      );
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.devChip}>
          <Text style={styles.devChipText}>DEV</Text>
        </View>
        <Text style={styles.headerText}>Quick login</Text>
      </View>
      <View style={styles.row}>
        {DEV_TEST_ACCOUNTS.map((acc) => {
          const isBusy = busy === acc.handle;
          return (
            <Pressable
              key={acc.handle}
              accessibilityRole="button"
              accessibilityLabel={`Sign in as ${acc.displayName}`}
              style={({ pressed }) => [
                styles.tile,
                pressed && styles.tilePressed,
                isBusy && styles.tileBusy,
              ]}
              onPress={() => void onTap(acc)}
              disabled={!!busy}>
              <View style={[styles.avatar, { backgroundColor: acc.avatarColor }]}>
                {isBusy ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.avatarText}>
                    {acc.displayName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={styles.tileName}>{acc.displayName}</Text>
              <Text style={styles.tileHandle}>@{acc.handle}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        Run <Text style={styles.kbd}>npm run seed:test-users</Text> if these don't work.
        {Platform.OS === 'web'
          ? ' For parallel testing, open each in a separate browser profile.'
          : ''}
      </Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      marginBottom: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: 12,
      backgroundColor: colors.cardBg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    devChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: '#d24a3a',
    },
    devChipText: {
      color: '#ffffff',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1,
    },
    headerText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
      letterSpacing: 0.4,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tile: {
      flexBasis: '22%',
      flexGrow: 1,
      minWidth: 72,
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tilePressed: {
      opacity: 0.7,
    },
    tileBusy: {
      opacity: 0.5,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '800',
    },
    tileName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textTitle,
    },
    tileHandle: {
      marginTop: 1,
      fontSize: 10,
      color: colors.textMuted,
    },
    hint: {
      marginTop: 10,
      fontSize: 10.5,
      color: colors.textMuted,
      lineHeight: 15,
    },
    kbd: {
      fontFamily: 'SpaceMono',
      fontSize: 10,
      color: colors.primaryDark,
    },
  });
}
