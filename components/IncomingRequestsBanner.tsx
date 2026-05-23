/**
 * Incoming friend-requests banner.
 *
 * Compact pinned card listing every pending request the viewer has
 * received, with inline Confirm / Decline actions per row. Renders
 * nothing when the list is empty.
 *
 * Reads its data and dispatchers directly from `useFriends()` so any
 * caller can drop it in without prop wiring. Used today by the Feed tab
 * (pinned above the round list) and the friends list inside the You
 * tab; designed so a future "activity" surface can render the same
 * component.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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

export function IncomingRequestsBanner({ style }: Props) {
  const { colors } = useTheme();
  const { incomingRequests, acceptIncomingRequest, declineIncomingRequest } = useFriends();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (incomingRequests.length === 0) return null;

  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.head}>
        ⏳  {incomingRequests.length === 1
          ? '1 FRIEND REQUEST'
          : `${incomingRequests.length} FRIEND REQUESTS`}
      </Text>
      {incomingRequests.map((req) => (
        <View key={req.id} style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: req.fromAvatarColor }]}>
            <Text style={styles.avatarText}>{req.fromDisplayName[0]?.toUpperCase()}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.from} numberOfLines={1}>
              <Text style={styles.fromBold}>{req.fromDisplayName}</Text>{' '}
              <Text style={styles.handle}>@{req.fromHandle}</Text>
            </Text>
            <Text style={styles.subtext}>wants to be friends</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnDanger]}
              onPress={() => declineIncomingRequest(req.id)}>
              <Text style={styles.btnDangerText}>Decline</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => acceptIncomingRequest(req.id)}>
              <Text style={styles.btnPrimaryText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    banner: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    head: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
    info: { flex: 1, minWidth: 0 },
    from: { fontSize: 12, color: '#6b5a3a' },
    fromBold: { color: colors.textTitle, fontWeight: '800' },
    handle: { color: colors.primaryDark, fontWeight: '700' },
    subtext: { fontSize: 10.5, color: '#8a7656', marginTop: 1 },
    actions: { flexDirection: 'row', gap: 6 },
    btn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7 },
    btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e0d0a8' },
    btnDangerText: { color: '#7c6b4f', fontSize: 11, fontWeight: '800' },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  });
}
