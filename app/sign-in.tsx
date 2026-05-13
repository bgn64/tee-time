/**
 * Sign-in flow — multi-step state machine for Magic-Link OTP auth.
 *
 *   1. email   — input email, "Send code".
 *   2. code    — input 6-digit code from the inbox, "Verify".
 *   3. handle  — first-sign-in only: pick a unique @handle and create the
 *                profile row.
 *   4. done    — success; tap to dismiss.
 *
 * Step transitions are driven by AccountContext state plus local user
 * intent. Once `verifyMagicCode` resolves successfully, AccountContext's
 * onAuthStateChange handler will populate either `account` (existing user)
 * or `needsProfile = true` (first-time user). We watch both flags here and
 * advance the step accordingly.
 *
 * Lives outside `(tabs)` so the tab bar disappears for the duration of the
 * flow. AppHeader stays visible; we set our own slots via `useScreenHeader`.
 */

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { showAlert } from '@/lib/dialog';

import { isValidHandle, useAccount } from '@/state/AccountContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';

type Step = 'email' | 'code' | 'handle' | 'done';

export default function SignInScreen() {
  const { colors } = useTheme();
  const { account, needsProfile, sendMagicCode, verifyMagicCode, completeProfile, signInWithGoogle } = useAccount();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [handle, setHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // After OTP verification, AccountContext flips one of two flags. React to
  // them to advance the wizard:
  //   · `needsProfile === true`  → we're on `code`, move to `handle`.
  //   · `account !== null`       → we're done.
  useEffect(() => {
    if (account && step !== 'done') {
      setStep('done');
    } else if (needsProfile && (step === 'code' || step === 'email')) {
      setStep('handle');
    }
  }, [account, needsProfile, step]);

  useScreenHeader({
    left:
      step === 'email'
        ? { kind: 'back', label: 'Cancel', onPress: () => router.back() }
        : step === 'code'
        ? { kind: 'back', label: 'Email', onPress: () => setStep('email') }
        : { kind: 'text', text: 'WELCOME' },
    right: { kind: 'none' },
  });

  const onSendCode = async () => {
    setSubmitting(true);
    const result = await sendMagicCode(email);
    setSubmitting(false);
    if (!result.ok) {
      showAlert('Could not send code', result.error);
      return;
    }
    setStep('code');
  };

  const onGoogle = async () => {
    setSubmitting(true);
    const result = await signInWithGoogle();
    // signInWithOAuth navigates the browser away — only get here on
    // an error before the redirect.
    if (!result.ok) {
      setSubmitting(false);
      showAlert('Could not sign in with Google', result.error);
    }
  };

  const onVerifyCode = async () => {
    setSubmitting(true);
    const result = await verifyMagicCode(code);
    setSubmitting(false);
    if (!result.ok) {
      showAlert('Invalid code', result.error);
      return;
    }
    // Auth state listener will move step to 'handle' or 'done'.
  };

  const onCompleteProfile = async () => {
    if (!isValidHandle(handle)) {
      showAlert(
        'Invalid handle',
        'Handles are 3-20 characters, start with a letter, and can include lowercase letters, numbers, dots, and underscores.'
      );
      return;
    }
    setSubmitting(true);
    const result = await completeProfile(handle);
    setSubmitting(false);
    if (!result.ok) {
      showAlert('Could not create profile', result.error);
      return;
    }
    // refreshFromSession will populate account → step flips to 'done'.
  };

  const onFinish = () => {
    router.back();
  };

  if (step === 'email') {
    const valid = /\S+@\S+\.\S+/.test(email);
    return (
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.title}>Sign in to Tee Time</Text>
          <Text style={styles.subtitle}>
            Back up your rounds and connect with friends.
          </Text>

          {Platform.OS === 'web' ? (
            <>
              <Pressable
                style={[styles.googleButton, submitting && styles.primaryButtonDisabled]}
                onPress={onGoogle}
                disabled={submitting}>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or with email</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          ) : null}

          <View style={[styles.field, valid && styles.fieldValid]}>
            <TextInput
              style={styles.fieldInput}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              autoFocus
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, (!valid || submitting) && styles.primaryButtonDisabled]}
            onPress={onSendCode}
            disabled={!valid || submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Send code</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 'code') {
    // Supabase OTP length is configurable (6-10 digits depending on project
    // settings). Stay flexible rather than hardcoding to 6.
    const valid = /^\d{6,10}$/.test(code);
    return (
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a code to <Text style={styles.subtitleEm}>{email}</Text>. It expires in
            an hour.
          </Text>

          <View style={[styles.field, valid && styles.fieldValid]}>
            <TextInput
              style={[styles.fieldInput, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 10))}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              autoFocus
              maxLength={10}
              placeholder="enter code"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, (!valid || submitting) && styles.primaryButtonDisabled]}
            onPress={onVerifyCode}
            disabled={!valid || submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify</Text>
            )}
          </Pressable>

          <Pressable style={styles.linkButton} onPress={onSendCode} disabled={submitting}>
            <Text style={styles.linkButtonText}>Resend code</Text>
          </Pressable>
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
            Friends find you by your handle. Lowercase letters, numbers, dots, and underscores.
            3-20 characters.
          </Text>

          <View style={[styles.field, valid && styles.fieldValid]}>
            <Text style={styles.fieldPrefix}>@</Text>
            <TextInput
              style={styles.fieldInput}
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

          <Text style={styles.fieldHint}>
            {valid
              ? '✓ Looks good — uniqueness is checked when you continue.'
              : '3-20 chars, start with a letter, lowercase only.'}
          </Text>

          <Pressable
            style={[styles.primaryButton, (!valid || submitting) && styles.primaryButtonDisabled]}
            onPress={onCompleteProfile}
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
  if (!account) {
    return null;
  }
  const initial = account.displayName[0]?.toUpperCase() ?? '?';
  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <View style={styles.doneCheck}>
          <Text style={styles.doneCheckIcon}>✓</Text>
        </View>
        <Text style={styles.title}>You're all set</Text>
        <Text style={styles.subtitle}>
          Your account is ready. Find friends by their @handle to start sharing rounds.
        </Text>

        <View style={styles.profilePreview}>
          <View style={[styles.profileAvatar, { backgroundColor: account.avatarColor }]}>
            <Text style={styles.profileAvatarText}>{initial}</Text>
          </View>
          <Text style={styles.profileName}>{account.displayName}</Text>
          <Text style={styles.profileHandle}>@{account.handle}</Text>
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
    subtitleEm: {
      fontWeight: '800',
      color: colors.textTitle,
    },
    field: {
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
    fieldValid: {
      borderColor: colors.primary,
    },
    fieldPrefix: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textMuted,
      marginRight: 4,
    },
    fieldInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: colors.textTitle,
      padding: 0,
    },
    codeInput: {
      letterSpacing: 8,
      fontSize: 22,
      textAlign: 'center',
    },
    fieldHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 28,
    },
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
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 18,
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
    linkButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    linkButtonText: {
      color: colors.primaryDark,
      fontSize: 13,
      fontWeight: '700',
    },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 12,
      marginTop: 12,
    },
    googleG: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#4285f4',
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 22,
      fontWeight: '800',
      fontSize: 14,
    },
    googleButtonText: {
      color: colors.textTitle,
      fontSize: 14.5,
      fontWeight: '700',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 18,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
  });
}
