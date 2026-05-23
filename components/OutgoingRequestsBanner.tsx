/**
 * Outgoing pending-requests banner.
 *
 * Compact pinned card listing every friend request the viewer has sent
 * that hasn't been accepted/declined yet, with a small × cancel button
 * per row. Renders nothing when the list is empty.
 *
 * Reads its data and dispatchers directly from `useFriends()` so any
 * caller can drop it in without prop wiring. Used today by the Feed tab
 * and the friends list inside the You tab, mirroring the placement of
 * `IncomingRequestsBanner` so both banners stack as a single
 * "pending activity" cluster at the top of those screens.
 *
 * Visual: neutral cool-dark surface (cardBg / border / primary accent),
 * intentionally *different* from `IncomingRequestsBanner`'s warm
 * `notice*` palette so the two banners read as distinct kinds of
 * activity — "attention required" (incoming) vs. "informational
 * status" (outgoing).
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRelativeTime } from '@/lib/scoring';
import { useFriends } from '@/state/FriendsContext';
import { useTheme } from '@/state/ThemeContext';

type Props = {
  /**
   * Outer-spacing override. Defaults to `marginBottom: 12` to match the
   * spacing used at the top of the Feed and friends list. Pass `style`
   * to override.
   */
  style?: { marginBottom?: number; marginTop?: number; marginHorizontal?: number };
};

export function OutgoingRequestsBanner({ style }: Props) {
  const { colors } = useTheme();
  const { outgoingRequests, cancelOutgoingRequest } = useFriends();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (outgoingRequests.length === 0) return null;

  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.head}>
        ⏳  {outgoingRequests.length} PENDING REQUESTS
      </Text>
      {outgoingRequests.map((req, i) => {
        const avatarColor = req.toAvatarColor ?? '#888888';
        const displayName = req.toDisplayName ?? req.toHandle ?? '';
        const initial = displayName[0]?.toUpperCase() ?? '?';
        return (
          <View
            key={req.id}
            style={[styles.row, i > 0 && styles.rowDivider]}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.from} numberOfLines={1}>
                <Text style={styles.fromBold}>{displayName}</Text>{' '}
                <Text style={styles.handle}>@{req.toHandle}</Text>
              </Text>
              <Text style={styles.subtext} numberOfLines={1}>
                Sent {formatRelativeTime(req.createdAt)}
              </Text>
            </View>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => cancelOutgoingRequest(req.id)}
              accessibilityLabel={`Cancel request to ${displayName || req.toHandle}`}
              hitSlop={6}>
              <Text style={styles.cancelBtnText}>×</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    head: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
    info: { flex: 1, minWidth: 0 },
    from: { fontSize: 12, color: colors.textBody },
    fromBold: { color: colors.textTitle, fontWeight: '800' },
    handle: { color: colors.primaryDark, fontWeight: '700' },
    subtext: { fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
    cancelBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 18,
      includeFontPadding: false,
    },
  });
}
