/**
 * Incoming friend-requests banner.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Avatar, GlassCard, NeonButton } from '@/components/aurora';
import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

type Props = {
  style?: StyleProp<ViewStyle>;
};

export function IncomingRequestsBanner({ style }: Props) {
  const { colors } = useTheme();
  const { incomingRequests, acceptIncomingRequest, declineIncomingRequest } = useFriends();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  if (incomingRequests.length === 0) return null;

  return (
    <View style={style}>
      {incomingRequests.map((req) => (
        <GlassCard key={req.id} padded={false} style={styles.row}>
          <Avatar
            initial={req.fromDisplayName || req.fromHandle}
            color={req.fromAvatarColor}
            size={38}
            circle
          />
          <View style={styles.info}>
            <Text style={styles.handle} numberOfLines={1}>
              @{req.fromHandle || req.fromDisplayName}
            </Text>
            <Text style={styles.subtext}>wants to connect</Text>
          </View>
          <View style={styles.actions}>
            <NeonButton
              label="Accept"
              size="sm"
              onPress={() => {
                void acceptIncomingRequest(req.id).catch(() => undefined);
              }}
            />
            <NeonButton
              label="Decline"
              size="sm"
              variant="ghost"
              onPress={() => {
                void declineIncomingRequest(req.id).catch(() => undefined);
              }}
            />
          </View>
        </GlassCard>
      ))}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      marginBottom: 8
    },
    info: {
      flex: 1,
      minWidth: 0
    },
    handle: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '900'
    },
    subtext: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2
    },
    actions: {
      flexDirection: 'row',
      gap: 6
    }
  });
}
