/**
 * Account screen — post-sign-in detail page with sign-out action.
 *
 * Reached from the You-tab Account grid card when the user is signed in.
 * Shows the active account's profile (avatar, displayName, @handle, provider)
 * and lets the user sign out. The card itself doesn't expose this route when
 * signed out — instead it routes to the /sign-in modal.
 *
 * If the user lands here without an account (deep link, race), we redirect
 * them back to the You tab.
 */

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { confirm, showAlert } from '@/lib/dialog';
import { useAccount } from '@/state/AccountContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';

const PROVIDER_LABEL = {
  apple: 'Apple',
  google: 'Google',
  email: 'Email (magic link)',
} as const;

export default function AccountScreen() {
  const { colors } = useTheme();
  const { account, signOut, updateDisplayName } = useAccount();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Display-name editing state. Default to the current value; reset
  // whenever the account changes.
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(account?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (account?.displayName) setDraftName(account.displayName);
  }, [account?.displayName]);

  useScreenHeader({
    left: { kind: 'back', label: 'Settings', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  // Defensive redirect: this screen is only meaningful while signed in.
  useEffect(() => {
    if (!account) {
      router.replace('/(tabs)/(you)');
    }
  }, [account]);

  if (!account) {
    return null;
  }

  const initial = account.displayName[0]?.toUpperCase() ?? '?';

  const onSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message:
        'Your local rounds and roster stay on this device. You can sign in again any time.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    signOut();
  };

  const onSaveName = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      showAlert('Display name', 'Cannot be empty.');
      return;
    }
    if (trimmed === account?.displayName) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    const result = await updateDisplayName(trimmed);
    setSaving(false);
    if (!result.ok) {
      showAlert('Could not update', result.error);
      return;
    }
    setEditingName(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: account.avatarColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        {editingName ? (
          <View style={styles.nameEditWrap}>
            <TextInput
              style={styles.nameInput}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              autoCapitalize="words"
              maxLength={50}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.nameEditRow}>
              <Pressable
                style={styles.nameEditBtn}
                onPress={() => {
                  setDraftName(account.displayName);
                  setEditingName(false);
                }}
                disabled={saving}>
                <Text style={styles.nameEditBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.nameEditBtn, styles.nameEditBtnPrimary]}
                onPress={onSaveName}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.nameEditBtnText, styles.nameEditBtnTextPrimary]}>
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.nameRow}
            onPress={() => setEditingName(true)}
            hitSlop={6}>
            <Text style={styles.name}>{account.displayName}</Text>
            <Text style={styles.editPencil}>✎</Text>
          </Pressable>
        )}
        <Text style={styles.handle}>@{account.handle}</Text>
      </View>

      <View style={styles.detailsCard}>
        <DetailRow styles={styles} label="Provider" value={PROVIDER_LABEL[account.provider]} />
        <View style={styles.divider} />
        <DetailRow styles={styles} label="Email" value={account.email} />
        <View style={styles.divider} />
        <DetailRow
          styles={styles}
          label="Joined"
          value={new Date(account.createdAt).toLocaleDateString()}
        />
      </View>

      <Pressable style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

type DetailRowProps = {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
};

function DetailRow({ styles, label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    profileCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 22,
      alignItems: 'center',
      marginBottom: 14,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    avatarText: {
      fontSize: 28,
      fontWeight: '800',
      color: '#ffffff',
    },
    name: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    editPencil: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    nameEditWrap: {
      width: '100%',
      gap: 8,
      marginTop: 4,
    },
    nameInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      fontWeight: '700',
      color: colors.textTitle,
      textAlign: 'center',
    },
    nameEditRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    nameEditBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
    },
    nameEditBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    nameEditBtnText: {
      color: colors.textTitle,
      fontSize: 13,
      fontWeight: '800',
    },
    nameEditBtnTextPrimary: {
      color: '#ffffff',
    },
    handle: {
      marginTop: 2,
      fontSize: 13,
      color: colors.primaryDark,
      fontWeight: '700',
    },
    detailsCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      paddingHorizontal: 14,
      marginBottom: 18,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      gap: 12,
    },
    detailLabel: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    detailValue: {
      flexShrink: 1,
      fontSize: 13,
      color: colors.textTitle,
      fontWeight: '600',
      textAlign: 'right',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
    },
    signOutButton: {
      backgroundColor: '#dc2626',
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    signOutText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
  });
}
