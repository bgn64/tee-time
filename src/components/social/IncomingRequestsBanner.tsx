/**
 * Incoming friend-requests banner.
 *
 * Compact pinned card listing every pending request the viewer has
 * received, with inline Confirm / Decline actions per row. Renders
 * nothing when the list is empty.
 *
 * Reads its data and dispatchers directly from `useFriends()` so any
 * caller can drop it in without prop wiring. Mounted today at the top
 * of the Home tab; designed so a future "activity" surface can render
 * the same component.
 *
 * Ported from the destination tee-time app's
 * `components/IncomingRequestsBanner.tsx`, themed via this app's
 * token set (no `noticeBg`/`noticeBorder` etc. tokens — mapped to
 * cardBg/border/accent/textTitle/textMuted instead).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

type Props = {
  style?: { marginBottom?: number; marginTop?: number; marginHorizontal?: number };
};

export function IncomingRequestsBanner({ style }: Props) {
  const { colors } = useTheme();
  const { incomingRequests, acceptIncomingRequest, declineIncomingRequest } = useFriends();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  if (incomingRequests.length === 0) return null;

  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.head}>
        ⏳{'  '}
        {incomingRequests.length === 1
          ? '1 FRIEND REQUEST'
          : `${incomingRequests.length} FRIEND REQUESTS`}
      </Text>
      {incomingRequests.map((req) => (
        <View key={req.id} style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: req.fromAvatarColor }]}>
            <Text style={styles.avatarText}>
              {req.fromDisplayName[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.from} numberOfLines={1}>
              <Text style={styles.fromBold}>{req.fromDisplayName || req.fromHandle}</Text>{' '}
              {req.fromHandle ? <Text style={styles.handle}>@{req.fromHandle}</Text> : null}
            </Text>
            <Text style={styles.subtext}>wants to be friends</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                styles.btnDanger,
                pressed && styles.btnPressed
              ]}
              onPress={() => {
                void declineIncomingRequest(req.id).catch(() => undefined);
              }}>
              <Text style={styles.btnDangerText}>Decline</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                pressed && styles.btnPressed
              ]}
              onPress={() => {
                void acceptIncomingRequest(req.id).catch(() => undefined);
              }}>
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
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12
    },
    head: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.6,
      marginBottom: 8
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
    info: { flex: 1, minWidth: 0 },
    from: { fontSize: 12, color: colors.textBody },
    fromBold: { color: colors.textTitle, fontWeight: '800' },
    handle: { color: colors.primaryDark, fontWeight: '700' },
    subtext: { fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
    actions: { flexDirection: 'row', gap: 6 },
    btn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7 },
    btnDanger: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border
    },
    btnDangerText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
    btnPressed: { opacity: 0.7 }
  });
}
