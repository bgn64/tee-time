/**
 * SignInScreen — magic-link OTP sign-in for an invite-only app.
 *
 * Two-step state machine:
 *   1. email — input email, "Send code". Email is trimmed + lowercased
 *      ONCE on submit and the normalized value is stored in state so the
 *      verify step uses exactly the same address regardless of what's
 *      typed in the input afterwards.
 *   2. code  — enter the 6-digit code from the inbox, "Verify".
 *
 * On successful verify, the Supabase auth-state listener (wired in
 * AuthGate + system.ts) flips the session and PowerSync connects.
 *
 * No register step — Supabase is called with `shouldCreateUser: false`
 * so unknown emails are rejected at the API.
 */

import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import { useSystem } from '@/library/powersync/system';
import { showAlert } from '@/library/utils/alert';
import { OtpInput } from './OtpInput';

type Step = 'email' | 'code';

export function SignInScreen() {
  const { colors } = useTheme();
  const system = useSystem();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = React.useState<Step>('email');
  const [emailDraft, setEmailDraft] = React.useState('');
  // Normalized address used for verifyOtp — set once on "Send code" so
  // edits to the input field after the code is sent don't break verify.
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const onSendCode = async () => {
    const normalized = emailDraft.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(normalized)) {
      showAlert('Enter your email', 'Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await system.supabaseConnector.sendMagicCode(normalized);
      setPendingEmail(normalized);
      setCode('');
      setStep('code');
    } catch (err: any) {
      showAlert(
        'Could not send code',
        err?.message ?? 'Check your email address and try again. This app is invite only.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyCode = async () => {
    if (!pendingEmail) {
      setStep('email');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      showAlert('Invalid code', 'Enter the 6-digit code from your email.');
      return;
    }
    setSubmitting(true);
    try {
      await system.supabaseConnector.verifyMagicCode(pendingEmail, code);
      // AuthGate's onAuthStateChange listener will flip the gate.
    } catch (err: any) {
      showAlert('Invalid code', err?.message ?? 'That code didn\'t work. Try again or resend.');
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (!pendingEmail) {
      setStep('email');
      return;
    }
    setSubmitting(true);
    try {
      await system.supabaseConnector.sendMagicCode(pendingEmail);
      setCode('');
    } catch (err: any) {
      showAlert('Could not resend code', err?.message ?? 'Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const onBackToEmail = () => {
    setStep('email');
    setCode('');
    setPendingEmail(null);
  };

  const emailValid = /\S+@\S+\.\S+/.test(emailDraft.trim());
  const codeValid = /^\d{6}$/.test(code);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.body}>
        {step === 'email' ? (
          <>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              Enter the email your invite was sent to. We&apos;ll send you a one-time code.
            </Text>

            <Text style={styles.fieldLabel}>Email</Text>
            <View style={[styles.field, emailValid && styles.fieldValid]}>
              <TextInput
                style={styles.fieldInput}
                value={emailDraft}
                onChangeText={setEmailDraft}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                autoFocus
                editable={!submitting}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={onSendCode}
                returnKeyType="send"
              />
            </View>

            <Pressable
              style={[
                styles.primaryButton,
                (!emailValid || submitting) && styles.primaryButtonDisabled
              ]}
              onPress={onSendCode}
              disabled={!emailValid || submitting}>
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Send code</Text>
              )}
            </Pressable>

            <Text style={styles.caption}>
              This app is invite only. If your email isn&apos;t recognized, ask the admin to invite you.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{' '}
              <Text style={styles.subtitleEm}>{pendingEmail}</Text>.
            </Text>

            <View style={otpRowStyles.wrap}>
              <OtpInput
                value={code}
                onChange={setCode}
                onSubmit={onVerifyCode}
                autoFocus
                disabled={submitting}
              />
            </View>

            <Pressable
              style={[
                styles.primaryButton,
                (!codeValid || submitting) && styles.primaryButtonDisabled
              ]}
              onPress={onVerifyCode}
              disabled={!codeValid || submitting}>
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify</Text>
              )}
            </Pressable>

            <Pressable style={styles.linkButton} onPress={onResend} disabled={submitting}>
              <Text style={styles.linkButtonText}>Resend code</Text>
            </Pressable>

            <Pressable style={styles.linkButton} onPress={onBackToEmail} disabled={submitting}>
              <Text style={styles.linkButtonTextMuted}>Use a different email</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// OTP row spacing wrapper — keeps the input visually separated from the
// surrounding form copy in both light and dark modes.
const otpRowStyles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 16
  }
});

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    body: {
      flex: 1,
      padding: 24,
      paddingTop: 48,
      maxWidth: 480,
      width: '100%',
      alignSelf: 'center'
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 10
    },
    subtitle: {
      fontSize: 14,
      color: colors.textBody,
      lineHeight: 20,
      marginBottom: 28
    },
    subtitleEm: {
      fontWeight: '800',
      color: colors.textTitle
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 6
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
      marginBottom: 8
    },
    fieldValid: {
      borderColor: colors.primary
    },
    fieldInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: colors.textTitle,
      padding: 0
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 18
    },
    primaryButtonDisabled: {
      opacity: 0.4
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3
    },
    linkButton: {
      paddingVertical: 10,
      alignItems: 'center'
    },
    linkButtonText: {
      color: colors.primaryDark,
      fontSize: 13,
      fontWeight: '700'
    },
    linkButtonTextMuted: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600'
    },
    caption: {
      marginTop: 20,
      color: colors.textMuted,
      textAlign: 'center',
      fontSize: 12,
      lineHeight: 17
    }
  });
}
