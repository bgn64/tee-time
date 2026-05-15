/**
 * Settings — central hub for non-profile configuration.
 *
 * Reached from the profile-icon menu in the app header. Lists every
 * preference, support, and account-management surface in three sections:
 *
 *   Preferences:
 *     · Theme              → /(you)/theme            (existing screen)
 *     · Notifications      → /(you)/notifications    (existing screen)
 *     · Location           → /onboarding/location    (re-runs the primer
 *                                                    when off/denied;
 *                                                    no-op when granted)
 *
 *   Support:
 *     · About              → /(you)/about            (existing screen)
 *     · Show onboarding    → /onboarding/welcome     (re-runs the primer
 *                                                    chain so users can
 *                                                    revisit the tour)
 *
 *   Account (signed-in only):
 *     · Account details    → /(you)/account          (existing screen)
 *     · Sign out           confirm + supabase.auth.signOut()
 *
 * The You-tab landing no longer carries any of these — the profile-icon
 * + this screen are the only entry points.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { themeNames } from '@/constants/themes';
import { confirm } from '@/lib/dialog';
import { useAccount } from '@/state/AccountContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useLocation } from '@/state/LocationContext';
import { useOnboarding } from '@/state/OnboardingContext';
import { useTheme } from '@/state/ThemeContext';

export default function SettingsScreen() {
  const { colors, themeName } = useTheme();
  const { account, signOut } = useAccount();
  const { status: locationStatus, openSystemSettings } = useLocation();
  const { setStatus: setPrimerStatus } = useOnboarding();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Back', onPress: () => router.back() },
    right: { kind: 'none' },
  });

  const themeLabel = useMemo(
    () => themeNames.find((t) => t.key === themeName)?.label ?? 'Light',
    [themeName]
  );

  const locationSubtitle =
    locationStatus === 'granted'
      ? 'On · sorting by distance'
      : locationStatus === 'denied'
      ? 'Denied — tap to open settings'
      : 'Off — tap to enable';

  const onLocation = async () => {
    if (locationStatus === 'granted') return;
    if (locationStatus === 'denied') {
      await openSystemSettings();
      return;
    }
    setPrimerStatus('location', 'not_seen');
    router.push('/onboarding/location');
  };

  const onSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message:
        'Your local rounds and roster stay on this device. You can sign in again any time.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    await signOut();
    router.replace('/(tabs)/(you)');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      <Text style={styles.sectionLabel}>Preferences</Text>
      <View style={styles.card}>
        <SettingsRow
          styles={styles}
          icon="🎨"
          label="Theme"
          subtitle={themeLabel}
          onPress={() => router.push('/settings/theme')}
        />
        <SettingsRow
          styles={styles}
          icon="🔔"
          label="Notifications"
          subtitle="Reminders &amp; activity"
          onPress={() => router.push('/settings/notifications')}
        />
        <SettingsRow
          styles={styles}
          icon="📍"
          label="Location"
          subtitle={locationSubtitle}
          onPress={onLocation}
          last
        />
      </View>

      <Text style={styles.sectionLabel}>Support</Text>
      <View style={styles.card}>
        <SettingsRow
          styles={styles}
          icon="ⓘ"
          label="About"
          subtitle="Version, credits, &amp; data sources"
          onPress={() => router.push('/settings/about')}
        />
        <SettingsRow
          styles={styles}
          icon="✦"
          label="Show onboarding tour"
          subtitle="Re-run the welcome screens"
          onPress={() => router.push('/onboarding/welcome')}
          last
        />
      </View>

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.card}>
        {account ? (
          <>
            <SettingsRow
              styles={styles}
              icon="👤"
              label="Account details"
              subtitle={`@${account.handle}`}
              onPress={() => router.push('/settings/account')}
            />
            <SettingsRow
              styles={styles}
              icon="⤴"
              label="Sign out"
              warn
              onPress={onSignOut}
              last
            />
          </>
        ) : (
          <SettingsRow
            styles={styles}
            icon="↪"
            label="Sign in"
            subtitle="Back up rounds &amp; connect with friends"
            onPress={() => router.push('/sign-in')}
            last
          />
        )}
      </View>
    </ScrollView>
  );
}

type RowProps = {
  styles: ReturnType<typeof makeStyles>;
  icon: string;
  label: string;
  subtitle?: string;
  warn?: boolean;
  last?: boolean;
  onPress: () => void;
};

function SettingsRow({ styles, icon, label, subtitle, warn, last, onPress }: RowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorderBottom,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}>
      <View style={[styles.iconWrap, warn && styles.iconWrapWarn]}>
        <Text style={[styles.iconText, warn && styles.iconTextWarn]}>{icon}</Text>
      </View>
      <View style={styles.meat}>
        <Text style={[styles.label, warn && styles.labelWarn]}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    heading: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 6,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginTop: 18,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    rowBorderBottom: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowPressed: {
      backgroundColor: colors.chipBg,
    },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapWarn: {
      backgroundColor: '#fde8e8',
    },
    iconText: {
      fontSize: 15,
      color: colors.primaryDark,
    },
    iconTextWarn: {
      color: '#c53030',
    },
    meat: { flex: 1 },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    labelWarn: {
      color: '#c53030',
    },
    subtitle: {
      fontSize: 11.5,
      color: colors.textMuted,
      marginTop: 1,
    },
    chev: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
    },
  });
}
