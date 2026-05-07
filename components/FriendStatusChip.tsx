/**
 * FriendStatusChip — small pill rendering a Round.claims status.
 *
 * Three states map to three visual treatments:
 *   pending     → amber background, "PENDING" label.
 *   claimed     → green background, "CLAIMED" label.
 *   not-claimed → muted gray background, "NOT CLAIMED" label.
 *
 * Used on the round detail to show each linked-friend participant's claim
 * state. The component is intentionally tiny — it's just a styled label —
 * but it's extracted to a component so the same look-and-feel reaches the
 * Feed cards in step 9 without copy-paste.
 */

import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';
import { ClaimStatus } from '@/types/golf';

export type FriendStatusChipProps = {
  status: ClaimStatus;
};

const LABELS: Record<ClaimStatus, string> = {
  pending: 'PENDING',
  claimed: 'CLAIMED',
  'not-claimed': 'NOT CLAIMED',
};

export function FriendStatusChip({ status }: FriendStatusChipProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const variantStyle =
    status === 'claimed'
      ? styles.claimed
      : status === 'pending'
      ? styles.pending
      : styles.notClaimed;

  return (
    <View style={[styles.chip, variantStyle]}>
      <Text style={[styles.text, status === 'pending' && styles.textOnAmber]}>
        {LABELS[status]}
      </Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    chip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: 'flex-start',
    },
    text: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: '#ffffff',
    },
    textOnAmber: {
      color: '#7c5400',
    },
    pending: {
      backgroundColor: '#fde68a',
    },
    claimed: {
      backgroundColor: colors.primary,
    },
    notClaimed: {
      backgroundColor: colors.chipBg,
    },
  });
}
