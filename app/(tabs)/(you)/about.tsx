/**
 * About screen — Phase 1 placeholder. App version, credits, links live here later.
 *
 * Hosts dev-only affordances behind a `__DEV__` gate:
 *   · Reset all data — wipes every persisted AsyncStorage key the app owns
 *     and reloads the JS bundle so contexts re-hydrate from empty storage.
 *   · Auto-accept outgoing friend requests — toggle that flips outgoing
 *     pending requests to accepted after a short timer (Step 8 stub).
 *   · Auto-claim pending claims — toggle that flips pending claim entries
 *     on completed rounds to claimed after a short timer.
 *   · Inject incoming request — picker over directory entries that aren't
 *     yet a friend or pending; injects a fake incoming friend request so
 *     the user can exercise the accept-and-bulk-claim flow without a real
 *     second device.
 *
 * Production builds skip the dev block entirely and show only the
 * placeholder ComingSoon.
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  DevSettings,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ComingSoon } from '@/components/ComingSoon';
import { useScreenHeader } from '@/state/HeaderContext';
import { clearAll } from '@/state/persistence';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

export default function AboutScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'You', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const handleReset = () => {
    Alert.alert(
      'Reset all data?',
      'This wipes the saved roster, courses, rounds, theme, account, and friends, then reloads the app. Dev-only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearAll();
            DevSettings.reload();
          },
        },
      ]
    );
  };

  if (!__DEV__) {
    return (
      <ComingSoon
        icon="ⓘ"
        title="About Tee Time"
        body="Version, credits, and the changelog will appear here once there's a story to tell."
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ComingSoon
        icon="ⓘ"
        title="About Tee Time"
        body="Version, credits, and the changelog will appear here once there's a story to tell."
      />

      <View style={styles.devSection}>
        <Text style={styles.devLabel}>DEVELOPER</Text>

        <SocialDevToggles styles={styles} colors={colors} />

        <View style={styles.divider} />

        <Pressable style={styles.dangerButton} onPress={handleReset}>
          <Text style={styles.dangerButtonText}>Reset all data</Text>
        </Pressable>
        <Text style={styles.devHint}>
          Wipes persisted storage and reloads. Seed data returns on next launch.
        </Text>
      </View>
    </ScrollView>
  );
}

type StylesArg = ReturnType<typeof makeStyles>;
type ColorsArg = ReturnType<typeof useTheme>['colors'];

function SocialDevToggles({ styles, colors }: { styles: StylesArg; colors: ColorsArg }) {
  const {
    autoAcceptOutgoing,
    setAutoAcceptOutgoing,
    autoClaimPending,
    setAutoClaimPending,
    directory,
    incomingRequests,
    outgoingRequests,
    friends,
    injectStubIncomingRequest,
  } = useSocial();
  const { allPlayers } = usePlayers();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Directory entries we can sensibly inject from: not already a friend, not
  // already pending incoming, not already linked to a roster entry of ours.
  const linkedUserIds = new Set(
    allPlayers.map((p) => p.userId).filter((u): u is string => !!u)
  );
  const pendingIncomingFrom = new Set(
    incomingRequests.filter((r) => r.status === 'pending').map((r) => r.fromUserId)
  );
  const pendingOutgoingTo = new Set(
    outgoingRequests.filter((r) => r.status === 'pending').map((r) => r.toUserId)
  );
  const friendsSet = new Set(friends);
  const candidates = directory.filter(
    (d) =>
      !friendsSet.has(d.userId) &&
      !pendingIncomingFrom.has(d.userId) &&
      !pendingOutgoingTo.has(d.userId) &&
      !linkedUserIds.has(d.userId)
  );

  return (
    <>
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Auto-accept outgoing</Text>
          <Text style={styles.toggleHint}>
            Pending requests flip to accepted after ~5s. Off keeps them pending.
          </Text>
        </View>
        <Switch
          value={autoAcceptOutgoing}
          onValueChange={setAutoAcceptOutgoing}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Auto-claim pending</Text>
          <Text style={styles.toggleHint}>
            Pending claim chips on rounds flip to CLAIMED after ~8s.
          </Text>
        </View>
        <Switch
          value={autoClaimPending}
          onValueChange={setAutoClaimPending}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>

      <Pressable
        style={[styles.injectButton, candidates.length === 0 && styles.injectButtonDisabled]}
        onPress={() => candidates.length > 0 && setPickerOpen(true)}
        disabled={candidates.length === 0}>
        <Text style={styles.injectButtonText}>
          {candidates.length === 0
            ? 'No directory entries available to inject'
            : 'Inject incoming request from…'}
        </Text>
      </Pressable>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)} />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Inject incoming request from</Text>
            <ScrollView style={styles.pickerList}>
              {candidates.map((d) => (
                <Pressable
                  key={d.userId}
                  style={styles.pickerRow}
                  onPress={() => {
                    injectStubIncomingRequest(d.userId);
                    setPickerOpen(false);
                  }}>
                  <View style={[styles.pickerAvatar, { backgroundColor: d.avatarColor }]}>
                    <Text style={styles.pickerAvatarText}>
                      {d.displayName[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.pickerInfo}>
                    <Text style={styles.pickerName}>{d.displayName}</Text>
                    <Text style={styles.pickerHandleText}>@{d.handle}</Text>
                  </View>
                  {d.seedPlayerId && (
                    <Text style={styles.pickerNote}>(matches roster)</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.pickerCancel} onPress={() => setPickerOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingBottom: 40,
    },
    devSection: {
      marginHorizontal: 20,
      marginTop: 8,
      padding: 16,
      borderRadius: 14,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    devLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    toggleInfo: {
      flex: 1,
      minWidth: 0,
    },
    toggleLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    toggleHint: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
      lineHeight: 16,
    },
    injectButton: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
      paddingVertical: 11,
      alignItems: 'center',
      marginTop: 10,
    },
    injectButtonDisabled: {
      opacity: 0.5,
    },
    injectButtonText: {
      color: colors.textMuted,
      fontWeight: '700',
      fontSize: 12,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    dangerButton: {
      backgroundColor: '#dc2626',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    dangerButtonText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 14,
      letterSpacing: 0.3,
    },
    devHint: {
      marginTop: 8,
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
    },

    // Picker modal
    pickerOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    pickerBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    pickerSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 20,
      paddingBottom: 30,
      maxHeight: '70%',
    },
    pickerHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 14,
    },
    pickerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
    },
    pickerList: {
      maxHeight: 350,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      padding: 10,
      marginBottom: 6,
    },
    pickerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerAvatarText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13,
    },
    pickerInfo: {
      flex: 1,
      minWidth: 0,
    },
    pickerName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    pickerHandleText: {
      fontSize: 11,
      color: colors.primaryDark,
      fontWeight: '600',
      marginTop: 1,
    },
    pickerNote: {
      fontSize: 10,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    pickerCancel: {
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    pickerCancelText: {
      color: colors.textMuted,
      fontWeight: '700',
      fontSize: 13,
    },
  });
}
