/**
 * HandleStep — handle picker form used inside SignInScreen's new
 * `handle` step (and reachable directly from AuthGate when a user is
 * signed in but never finished their profile).
 *
 * Inputs:
 *   · Display name (free text, required, trimmed)
 *   · Handle      (validated against the same regex the server
 *                  CHECK constraint enforces — see `handles.ts`)
 *
 * On submit calls `useAccount().completeProfile(handle, displayName)`
 * which hits the `complete_profile` RPC and updates AccountContext.
 * Surfacing errors:
 *   · Invalid handle / empty name caught client-side before submit.
 *   · Duplicate handle (Postgres 23505) → friendly "handle is taken".
 *   · All other errors → "Something went wrong" with the raw message.
 *
 * Component is responsible for its own keyboard handling because it's
 * embedded inside SignInScreen's already-existing KeyboardAvoidingView.
 */

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassSurface, NeonButton } from '@/components/aurora';
import { useAccount } from '@/library/social/AccountContext';
import { isValidHandle, normalizeHandle } from '@/library/social/handles';
import { useTheme } from '@/library/theme/ThemeContext';
import { showAlert } from '@/library/utils/alert';

export function HandleStep() {
  const { colors } = useTheme();
  const { completeProfile } = useAccount();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [displayName, setDisplayName] = React.useState('');
  const [handle, setHandle] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const normalizedHandle = normalizeHandle(handle);
  const trimmedName = displayName.trim();
  const handleValid = isValidHandle(normalizedHandle);
  const nameValid = trimmedName.length > 0;
  const canSubmit = handleValid && nameValid && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await completeProfile(normalizedHandle, trimmedName);
      // AccountContext.status flips to 'ready' on success; the
      // AuthGate re-renders the gated tree.
    } catch (err: any) {
      // 23505 = unique violation. Could be either profiles_pkey
      // (the user already has a row — RPC is idempotent so this is
      // unlikely) or the handle UNIQUE constraint.
      const code: string | undefined = err?.code;
      const message: string = err?.message ?? '';
      if (code === '23505' || /duplicate key/i.test(message)) {
        showAlert(
          'That handle is taken',
          'Pick another @handle. Lowercase letters, digits, dots, and underscores only.'
        );
      } else {
        showAlert(
          'Could not finish your profile',
          message || 'Something went wrong. Check your connection and try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>Finish your profile</Text>
      <Text style={styles.subtitle}>
        Pick a display name and a unique @handle so friends can find you.
      </Text>

      <Text style={styles.fieldLabel}>Display name</Text>
      <GlassSurface style={[styles.field, nameValid && styles.fieldValid]}>
        <TextInput
          style={styles.fieldInput}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          editable={!submitting}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          returnKeyType="next"
        />
      </GlassSurface>

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>@Handle</Text>
      <GlassSurface style={[styles.field, handleValid && styles.fieldValid]}>
        <Text style={styles.fieldPrefix}>@</Text>
        <TextInput
          style={styles.fieldInput}
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          editable={!submitting}
          placeholder="yourhandle"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
        />
      </GlassSurface>
      <Text style={styles.helper}>
        3–20 chars. Start with a letter; lowercase letters, digits, dots, and underscores only.
      </Text>

      <NeonButton
        label={submitting ? 'Saving…' : 'Continue'}
        onPress={onSubmit}
        disabled={!canSubmit}
        style={styles.primaryButton}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
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
      marginBottom: 24
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 6
    },
    fieldLabelSpaced: { marginTop: 16 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.glassFill2,
      borderRadius: 12,
      borderColor: colors.glassStroke,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    fieldValid: { borderColor: colors.lime },
    fieldPrefix: {
      color: colors.textMuted,
      fontWeight: '700',
      fontSize: 17,
      marginRight: 4
    },
    fieldInput: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.textTitle,
      padding: 0
    },
    helper: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 8
    },
    primaryButton: { marginTop: 22 }
  });
}
