/**
 * Sign-in flow — three-step state machine in one route.
 *
 *   1. SSO sheet — pick Apple or Google.
 *   2. Handle picker — choose @handle (regex-validated). Default seeded
 *      from the user's existing default-player name when possible so the
 *      handle feels personal.
 *   3. All set — profile preview + Continue button.
 *
 * Steps are local component state (`step` enum), not nested routes. The
 * flow is linear and back-navigation needs to step *within* the modal,
 * not pop the stack — so a step machine is simpler than three screens.
 *
 * Lives outside `(tabs)` so the tab bar disappears for the duration of
 * the flow. AppHeader stays visible; we set our own slots via
 * `useScreenHeader` (back/cancel on the left).
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAccount, isValidHandle } from '@/state/AccountContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Account, AuthProvider } from '@/types/account';

type Step = 'sso' | 'handle' | 'done';

/**
 * Suggest a handle from a player display name. Strips non-alphanumerics,
 * lowercases, collapses spaces, and trims to satisfy HANDLE_REGEX.
 */
function suggestHandleFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
  // Must start with a letter; if it doesn't, prepend "u".
  const startsWithLetter = /^[a-z]/.test(slug);
  const seeded = startsWithLetter ? slug : `u${slug}`;
  return seeded.slice(0, 20);
}

export default function SignInScreen() {
  const { colors } = useTheme();
  const { signIn } = useAccount();
  const { defaultPlayerId, getPlayer } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState<Step>('sso');
  const [provider, setProvider] = useState<AuthProvider | null>(null);
  const [handle, setHandle] = useState<string>(() => {
    const name = defaultPlayerId ? getPlayer(defaultPlayerId)?.nickname : undefined;
    return name ? suggestHandleFromName(name) : '';
  });
  const [submitting, setSubmitting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<Account | null>(null);

  // Header reflects the current step.
  useScreenHeader({
    left:
      step === 'sso'
        ? { kind: 'back', label: 'Cancel', onPress: () => router.back() }
        : step === 'handle'
        ? { kind: 'back', label: 'Back', onPress: () => setStep('sso') }
        : { kind: 'text', text: 'WELCOME' },
    right: { kind: 'none' },
  });

  const onPickProvider = (p: AuthProvider) => {
    setProvider(p);
    setStep('handle');
  };

  const onConfirmHandle = async () => {
    if (!provider) return;
    if (!isValidHandle(handle)) {
      Alert.alert(
        'Invalid handle',
        'Handles are 3-20 characters, start with a letter, and can include lowercase letters, numbers, dots, and underscores.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const acct = await signIn(provider, handle);
      setCreatedAccount(acct);
      setStep('done');
    } finally {
      setSubmitting(false);
    }
  };

  const onFinish = () => {
    router.back();
  };

  if (step === 'sso') {
    return (
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.title}>Sign in to Tee Time</Text>
          <Text style={styles.subtitle}>
            Back up your rounds and connect with friends. You can keep playing
            locally without an account — sign in any time.
          </Text>

          <View style={styles.ssoStack}>
            <Pressable
              style={[styles.ssoButton, styles.ssoApple]}
              onPress={() => onPickProvider('apple')}>
              <Text style={styles.ssoIcon}></Text>
              <Text style={styles.ssoAppleText}>Sign in with Apple</Text>
            </Pressable>
            <Pressable
              style={[styles.ssoButton, styles.ssoGoogle]}
              onPress={() => onPickProvider('google')}>
              <Text style={styles.ssoGoogleIcon}>G</Text>
              <Text style={styles.ssoGoogleText}>Sign in with Google</Text>
            </Pressable>
          </View>

          <Text style={styles.stubFooter}>
            Stub mode — both buttons fake a successful SSO. Real auth lands
            once Supabase is wired in.
          </Text>
        </View>
      </View>
    );
  }

  if (step === 'handle') {
    const valid = isValidHandle(handle);
    return (
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.title}>Pick your @handle</Text>
          <Text style={styles.subtitle}>
            Friends find you by your handle. Lowercase letters, numbers, dots,
            and underscores. 3-20 characters.
          </Text>

          <View style={[styles.handleField, valid && styles.handleFieldValid]}>
            <Text style={styles.handleAt}>@</Text>
            <TextInput
              style={styles.handleInput}
              value={handle}
              onChangeText={(t) => setHandle(t.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              autoFocus
              maxLength={20}
              placeholder="yourhandle"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <Text style={styles.handleHint}>
            {valid
              ? '✓ Looks good'
              : '3-20 chars, start with a letter, lowercase only.'}
          </Text>

          <Pressable
            style={[styles.primaryButton, (!valid || submitting) && styles.primaryButtonDisabled]}
            onPress={onConfirmHandle}
            disabled={!valid || submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // step === 'done'
  if (!createdAccount) {
    // Defensive — shouldn't happen because we only enter `done` after success.
    return null;
  }
  const initial = createdAccount.displayName[0]?.toUpperCase() ?? '?';
  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <View style={styles.doneCheck}>
          <Text style={styles.doneCheckIcon}>✓</Text>
        </View>
        <Text style={styles.title}>You're all set</Text>
        <Text style={styles.subtitle}>
          Your account is ready. Find friends by their @handle to start sharing
          rounds.
        </Text>

        <View style={styles.profilePreview}>
          <View style={[styles.profileAvatar, { backgroundColor: createdAccount.avatarColor }]}>
            <Text style={styles.profileAvatarText}>{initial}</Text>
          </View>
          <Text style={styles.profileName}>{createdAccount.displayName}</Text>
          <Text style={styles.profileHandle}>@{createdAccount.handle}</Text>
        </View>

        <Pressable style={styles.primaryButton} onPress={onFinish}>
          <Text style={styles.primaryButtonText}>Continue to Tee Time</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    body: {
      flex: 1,
      padding: 24,
      paddingTop: 32,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 28,
    },

    // SSO step
    ssoStack: {
      gap: 12,
    },
    ssoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 14,
      borderRadius: 12,
    },
    ssoApple: {
      backgroundColor: '#000000',
    },
    ssoIcon: {
      fontSize: 20,
      color: '#ffffff',
    },
    ssoAppleText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },
    ssoGoogle: {
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: colors.border,
    },
    ssoGoogleIcon: {
      fontSize: 18,
      fontWeight: '900',
      color: '#4285f4',
    },
    ssoGoogleText: {
      color: '#3c4043',
      fontSize: 15,
      fontWeight: '700',
    },
    stubFooter: {
      marginTop: 24,
      fontSize: 11,
      color: colors.textMuted,
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 16,
    },

    // Handle step
    handleField: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    handleFieldValid: {
      borderColor: colors.primary,
    },
    handleAt: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textMuted,
      marginRight: 4,
    },
    handleInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: colors.textTitle,
      padding: 0,
    },
    handleHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 28,
    },

    // Done step
    doneCheck: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      alignSelf: 'flex-start',
    },
    doneCheckIcon: {
      fontSize: 32,
      color: '#ffffff',
      fontWeight: '900',
    },
    profilePreview: {
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 20,
      marginBottom: 28,
    },
    profileAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    profileAvatarText: {
      fontSize: 28,
      fontWeight: '800',
      color: '#ffffff',
    },
    profileName: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.textTitle,
    },
    profileHandle: {
      marginTop: 2,
      fontSize: 13,
      color: colors.primaryDark,
      fontWeight: '700',
    },

    // Shared
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButtonDisabled: {
      opacity: 0.4,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
  });
}
