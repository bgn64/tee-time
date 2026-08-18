/**
 * FriendActionPill — the single-control friending UI on profile screens.
 *
 * Drives off `useFriends().friendStatus(targetUserId)` and renders one
 * of four variants:
 *
 *   stranger          — filled primary pill `+ Add Friend`. Single tap
 *                       fires `sendFriendRequest(target)`.
 *   incoming-pending  — SAME pill as `stranger`. The server-side
 *                       `send_friend_request` RPC atomically accepts a
 *                       reciprocal pending FR, so tapping "+ Add Friend"
 *                       when the other user has already sent you one is
 *                       the implicit accept. Decline still lives on the
 *                       Home tab's incoming-requests banner (where it's
 *                       paired with the sender's name and context).
 *   outgoing-pending  — bordered pill `Requested ▾`. Tap opens
 *                       dropdown with `Unrequest`.
 *   friend            — outlined-primary pill `Friends ✓ ▾`
 *                       (`cardBg` background, `primary` border + text).
 *                       Quieter than the filled `+ Add Friend` CTA so
 *                       the friend ↔ stranger transition is visually
 *                       loud. Tap opens dropdown with `Unfriend`
 *                       (confirms before firing).
 *   self              — renders null (own profile is read-only).
 *
 * Dropdown is implemented as a Modal + transparent backdrop — works
 * identically on web and native, no extra dependency. The popover is
 * positioned just below the pill via `onLayout` measurement.
 *
 * Used by `<ProfileScreen>`.
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent
} from 'react-native';

import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import { confirmAsync, showAlert } from '@/library/utils/alert';
import type { ProfileSummary } from '@/types/social';

type Props = {
  target: ProfileSummary;
};

export function FriendActionPill({ target }: Props) {
  const { colors } = useTheme();
  const {
    friendStatus,
    outgoingRequestTo,
    sendFriendRequest,
    cancelOutgoingRequest,
    unfriend
  } = useFriends();

  const status = friendStatus(target.userId);
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [submitting, setSubmitting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  // Anchor measurement for the dropdown popover.
  const [anchor, setAnchor] = React.useState<{ x: number; y: number; width: number } | null>(null);
  const anchorRef = React.useRef<View>(null);

  const measureAnchor = React.useCallback(() => {
    const node = anchorRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width) => {
      setAnchor({ x, y, width });
    });
  }, []);

  const onAnchorLayout = React.useCallback(
    (_e: LayoutChangeEvent) => {
      measureAnchor();
    },
    [measureAnchor]
  );

  const closeDropdown = React.useCallback(() => setOpen(false), []);

  const runAction = React.useCallback(
    async (fn: () => Promise<void>, failureTitle: string) => {
      setSubmitting(true);
      try {
        await fn();
      } catch (err: any) {
        showAlert(failureTitle, err?.message ?? 'Something went wrong. Try again.');
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  if (status === 'self') return null;

  const outgoing = status === 'outgoing-pending' ? outgoingRequestTo(target.userId) : undefined;

  // Treat 'incoming-pending' the same as 'stranger' visually + on tap.
  // The server-side send_friend_request RPC auto-accepts a reciprocal
  // pending FR atomically, so a single "+ Add Friend" tap is the
  // implicit accept. Decline lives on the Home banner where the
  // sender's name/handle is visible.
  const pillStyle = (() => {
    switch (status) {
      case 'stranger':
      case 'incoming-pending':
        return [styles.pill, styles.pillStranger];
      case 'outgoing-pending':
        return [styles.pill, styles.pillOutgoing];
      case 'friend':
        return [styles.pill, styles.pillFriend];
      default:
        return styles.pill;
    }
  })();

  const pillLabelStyle = (() => {
    switch (status) {
      case 'outgoing-pending':
        return [styles.pillLabel, styles.pillLabelOnSurface];
      case 'friend':
        return [styles.pillLabel, styles.pillLabelOnFriendSurface];
      default:
        return [styles.pillLabel, styles.pillLabelOnFill];
    }
  })();

  const pillLabel = (() => {
    switch (status) {
      case 'stranger':
      case 'incoming-pending':
        return '+ Add Friend';
      case 'outgoing-pending':
        return 'Requested  ▾';
      case 'friend':
        return 'Friends ✓  ▾';
      default:
        return '';
    }
  })();

  const onPressPill = async () => {
    if (submitting) return;
    if (status === 'stranger' || status === 'incoming-pending') {
      await runAction(
        () => sendFriendRequest(target),
        'Could not send friend request'
      );
      return;
    }
    measureAnchor();
    setOpen(true);
  };

  const dropdownTop = anchor ? anchor.y + 44 : 0;
  const dropdownLeft = anchor ? Math.max(8, anchor.x + anchor.width / 2 - 80) : 0;

  return (
    <View
      collapsable={false}
      ref={anchorRef}
      onLayout={onAnchorLayout}
      style={styles.anchor}>
      <Pressable
        accessibilityRole="button"
        onPress={onPressPill}
        disabled={submitting}
        style={({ pressed }) => [pillStyle, pressed && styles.pillPressed]}>
        {submitting ? (
          <ActivityIndicator
            color={
              status === 'outgoing-pending'
                ? colors.textTitle
                : status === 'friend'
                  ? colors.primary
                  : colors.onNeon
            }
          />
        ) : (
          <Text style={pillLabelStyle}>{pillLabel}</Text>
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeDropdown}>
        <Pressable style={styles.backdrop} onPress={closeDropdown}>
          <View
            // Stop touches inside the popover from dismissing it.
            onStartShouldSetResponder={() => true}
            style={[
              styles.popover,
              {
                top: dropdownTop,
                left: dropdownLeft
              }
            ]}>
            {status === 'outgoing-pending' && outgoing ? (
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={async () => {
                  closeDropdown();
                  await runAction(
                    () => cancelOutgoingRequest(outgoing.id),
                    'Could not cancel request'
                  );
                }}>
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Unrequest</Text>
              </Pressable>
            ) : null}

            {status === 'friend' ? (
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={async () => {
                  closeDropdown();
                  const ok = await confirmAsync(
                    'Unfriend?',
                    "You'll both stop seeing each other in friend lists. You can re-request later."
                  );
                  if (!ok) return;
                  await runAction(
                    () => unfriend(target.userId),
                    'Could not unfriend'
                  );
                }}>
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Unfriend</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    anchor: { alignSelf: 'center' },
    pill: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 14,
      minWidth: 112,
      alignItems: 'center',
      justifyContent: 'center'
    },
    pillStranger: {
      backgroundColor: colors.lime,
      borderWidth: 1,
      borderColor: colors.lime,
      shadowColor: colors.lime,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 5
    },
    pillOutgoing: {
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke
    },
    // Outlined green pill: signals "you're connected" without
    // competing visually with the bright "+ Add Friend" CTA, so the
    // friend ↔ stranger transition is unmistakable.
    pillFriend: {
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.lime
    },
    pillPressed: { opacity: 0.7 },
    pillLabel: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3
    },
    pillLabelOnFill: { color: colors.onNeon },
    pillLabelOnSurface: { color: colors.textTitle },
    pillLabelOnFriendSurface: { color: colors.lime },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.001)'
    },
    popover: {
      position: 'absolute',
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 14,
      paddingVertical: 6,
      minWidth: 160,
      shadowColor: colors.shadow,
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 6
    },
    menuItem: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 6
    },
    menuItemPressed: { backgroundColor: colors.glassFill2 },
    menuItemText: {
      fontSize: 13,
      fontWeight: '700'
    },
    menuItemTextDanger: { color: colors.accent }
  });
}
