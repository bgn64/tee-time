/**
 * ProfileMenu — anchored dropdown menu surfaced when the user taps the
 * profile dot in the app header.
 *
 * Renders as a full-screen Modal with a tap-to-dismiss backdrop and a
 * floating menu pinned near the top-right (same modal-overlay pattern
 * as RangeDropdown / SortDropdown). The menu carries a profile
 * summary header followed by:
 *
 *   Settings              → /(tabs)/(you)/settings
 *   Theme                 → /(tabs)/(you)/theme       (shortcut)
 *   Notifications         → /(tabs)/(you)/notifications (shortcut)
 *   About                 → /(tabs)/(you)/about
 *   ───────────────
 *   Sign out (warn-styled, signed-in only)  →  confirm + supabase.auth.signOut
 *
 * When signed out the same list shows a "Sign in" item in place of the
 * profile summary header + sign-out row.
 *
 * The menu is invoked by AppHeader when right.kind === 'profile' and the
 * profile-dot is tapped. State (visible) lives in AppHeader so the menu
 * unmounts on close.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { confirm } from '@/lib/dialog';
import { useAccount } from '@/state/AccountContext';
import { useTheme } from '@/state/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileMenu({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { account, signOut } = useAccount();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const onSignOut = async () => {
    onClose();
    const ok = await confirm({
      title: 'Sign out?',
      message:
        'Your local rounds and roster stay on this device. You can sign in again any time.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    await signOut();
  };

  const initial = account?.displayName?.[0]?.toUpperCase() ?? '?';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
          {account ? (
            <Pressable
              style={[styles.row, styles.header]}
              onPress={() => go('/(tabs)/(you)')}>
              <View style={[styles.headerAv, { backgroundColor: account.avatarColor }]}>
                <Text style={styles.headerAvText}>{initial}</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {account.displayName}
                </Text>
                <Text style={styles.headerHandle} numberOfLines={1}>
                  @{account.handle}
                </Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.row, styles.header]}
              onPress={() => go('/sign-in')}>
              <View style={[styles.headerAv, { backgroundColor: colors.chipBg }]}>
                <Text style={[styles.headerAvText, { color: colors.textMuted }]}>?</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.headerName}>Sign in</Text>
                <Text style={styles.headerHandle}>Back up rounds &amp; connect</Text>
              </View>
            </Pressable>
          )}

          <MenuRow
            styles={styles}
            icon="⚙"
            label="Settings"
            onPress={() => go('/(tabs)/(you)/settings')}
          />
          <MenuRow
            styles={styles}
            icon="🎨"
            label="Theme"
            onPress={() => go('/(tabs)/(you)/theme')}
          />
          <MenuRow
            styles={styles}
            icon="🔔"
            label="Notifications"
            onPress={() => go('/(tabs)/(you)/notifications')}
          />
          <MenuRow
            styles={styles}
            icon="ⓘ"
            label="About"
            onPress={() => go('/(tabs)/(you)/about')}
            last={!account}
          />

          {account ? (
            <MenuRow
              styles={styles}
              icon="⤴"
              label="Sign out"
              warn
              last
              onPress={onSignOut}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type RowProps = {
  styles: ReturnType<typeof makeStyles>;
  icon: string;
  label: string;
  warn?: boolean;
  last?: boolean;
  onPress: () => void;
};

function MenuRow({ styles, icon, label, warn, last, onPress }: RowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorderBottom,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}>
      <Text style={[styles.icon, warn && styles.iconWarn]}>{icon}</Text>
      <Text style={[styles.label, warn && styles.labelWarn]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.22)',
    },
    menu: {
      position: 'absolute',
      // Pinned to the top-right; the AppHeader's profile dot lives at
      // ~insets.top + 14 from the top and ~14 from the right, so anchor
      // a touch below + indented to land just under the dot.
      top: 64,
      right: 12,
      width: 240,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    rowBorderBottom: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowPressed: {
      backgroundColor: colors.chipBg,
    },
    header: {
      backgroundColor: colors.background,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerAv: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerAvText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '800',
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    headerName: {
      color: colors.textTitle,
      fontSize: 13,
      fontWeight: '800',
    },
    headerHandle: {
      color: colors.primaryDark,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 1,
    },
    icon: {
      fontSize: 14,
      color: colors.primaryDark,
      width: 18,
      textAlign: 'center',
    },
    iconWarn: {
      color: '#c53030',
    },
    label: {
      fontSize: 13,
      color: colors.textTitle,
      fontWeight: '700',
    },
    labelWarn: {
      color: '#c53030',
    },
  });
}
