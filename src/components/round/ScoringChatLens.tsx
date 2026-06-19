/**
 * ScoringChatLens — the "Chat" lens on the live scoring screen: the
 * round's live comment thread + reply composer, so players can read and
 * respond mid-round without leaving scoring (mockup `04-aurora-glass.html`,
 * the Scoring · Chat lens). Reuses the round-detail `CommentsSection`.
 */

import { StyleSheet, View } from 'react-native';

import { CommentsSection } from './CommentsSection';
import { SectionLabel } from '@/components/aurora';
import type { Round } from '@/types/golf';

export function ScoringChatLens({ round }: { round: Round }) {
  return (
    <View style={styles.wrap}>
      <SectionLabel>Live comments</SectionLabel>
      <CommentsSection roundId={round.id} ownerUserId={round.ownerUserId ?? ''} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
  },
});
