/**
 * Branded Supabase invite confirmation route.
 *
 * Invite emails link here with `token_hash` instead of sending users directly
 * to the Supabase project URL. The route verifies the token, lets the existing
 * AccountProvider pick up the new session, then hands off to the normal
 * profile-completion flow.
 */

import type { EmailOtpType } from '@supabase/supabase-js';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAccount } from '@/state/AccountContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { supabase } from '@/state/supabaseClient';
import { useTheme } from '@/state/ThemeContext';

type ConfirmStatus = 'verifying' | 'success' | 'error';

const SUPPORTED_CONFIRM_TYPES = new Set<EmailOtpType>(['invite']);

export default function AuthConfirmScreen() {
  const params = useLocalSearchParams();
  const { account, needsProfile } = useAccount();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [status, setStatus] = useState<ConfirmStatus>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tokenHash = firstParam(params.token_hash);
  const confirmType = getConfirmType(firstParam(params.type));

  useScreenHeader({
    left: { kind: 'text', text: 'INVITE' },
    right: { kind: 'none' },
  });

  useEffect(() => {
    let cancelled = false;

    const verifyInvite = async () => {
      if (!tokenHash) {
        setStatus('error');
        setErrorMessage('This invite link is missing its verification token.');
        return;
      }
      if (!confirmType) {
        setStatus('error');
        setErrorMessage('This invite link is not a supported Tee Time sign-in link.');
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: confirmType,
      });

      if (cancelled) return;
      if (error) {
        setStatus('error');
        setErrorMessage(error.message);
        return;
      }

      setStatus('success');
    };

    verifyInvite();

    return () => {
      cancelled = true;
    };
  }, [confirmType, tokenHash]);

  useEffect(() => {
    if (status !== 'success') return;
    if (needsProfile) {
      router.replace('/sign-in');
      return;
    }
    if (account) {
      router.replace('/');
    }
  }, [account, needsProfile, status]);

  const title =
    status === 'error'
      ? 'Invite link problem'
      : status === 'success'
        ? 'Invite accepted'
        : 'Accepting your invite';
  const subtitle =
    status === 'error'
      ? errorMessage ?? 'This invite link may be expired or already used.'
      : status === 'success'
        ? 'Your invitation was accepted. We’re taking you to the next step.'
        : 'We’re confirming your Tee Time invitation and getting your account ready. This should only take a moment.';

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            {status === 'verifying' ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <Text style={[styles.heroIcon, status === 'error' && styles.heroIconError]}>
                {status === 'success' ? '✓' : '!'}
              </Text>
            )}
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusDot}>
              <Text style={styles.statusDotText}>
                {status === 'error' ? '!' : status === 'success' ? '✓' : '1'}
              </Text>
            </View>
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>
                {status === 'error' ? 'Unable to verify invite' : 'Private invite link'}
              </Text>
              <Text style={styles.statusCopy}>
                {status === 'error'
                  ? 'Request a new invitation or return to sign in if you already accepted this one.'
                  : 'This page securely verifies the invitation from your email before sending you into Tee Time.'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryButton, status === 'verifying' && styles.primaryButtonBusy]}
            onPress={() => router.replace(status === 'error' ? '/sign-in' : '/')}
            disabled={status === 'verifying'}>
            <Text style={styles.primaryButtonText}>
              {status === 'error'
                ? 'Back to sign in'
                : status === 'success'
                  ? 'Continue'
                  : 'Verifying invite...'}
            </Text>
          </Pressable>
          {status === 'error' ? (
            <Pressable style={styles.secondaryButton} onPress={() => router.replace('/')}>
              <Text style={styles.secondaryButtonText}>Go to Tee Time</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.caption}>
          If this screen does not continue automatically, the invite may be expired or already
          used.
        </Text>
      </View>
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getConfirmType(value: string | undefined): EmailOtpType | null {
  if (!value) return 'invite';
  return SUPPORTED_CONFIRM_TYPES.has(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 42,
      paddingBottom: 24,
    },
    hero: {
      alignItems: 'center',
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    heroIcon: {
      fontSize: 42,
      fontWeight: '900',
      color: colors.primaryDark,
      lineHeight: 46,
    },
    heroIconError: {
      color: colors.accent,
    },
    title: {
      marginBottom: 10,
      color: colors.textTitle,
      fontSize: 25,
      lineHeight: 30,
      fontWeight: '900',
      textAlign: 'center',
    },
    subtitle: {
      maxWidth: 310,
      color: colors.textBody,
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
    },
    statusCard: {
      marginTop: 28,
      padding: 15,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.cardBg,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
    },
    statusDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    statusDotText: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: '900',
    },
    statusText: {
      flex: 1,
    },
    statusTitle: {
      color: colors.textTitle,
      fontSize: 13,
      fontWeight: '900',
      marginBottom: 3,
    },
    statusCopy: {
      color: colors.textBody,
      fontSize: 12.5,
      lineHeight: 18,
    },
    actions: {
      marginTop: 'auto',
      gap: 10,
    },
    primaryButton: {
      height: 50,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonBusy: {
      opacity: 0.72,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    secondaryButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
    caption: {
      marginTop: 18,
      color: colors.textMuted,
      textAlign: 'center',
      fontSize: 11.5,
      lineHeight: 16,
    },
  });
}
