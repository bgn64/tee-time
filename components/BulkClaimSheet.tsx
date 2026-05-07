/**
 * BulkClaimSheet — modal-style sheet shown right after accepting an
 * incoming friend request that has shared past rounds.
 *
 * Three actions:
 *   · Claim all   — flip every shared round's claim entry for this friend
 *                   to `claimed`.
 *   · Reject all  — flip them to `not-claimed`.
 *   · Review later— close without flipping; entries stay `pending`.
 *
 * Per the mockup decision, the sheet is skipped entirely when there are no
 * shared rounds; this component assumes `rounds.length > 0` (the parent
 * gates the render on that).
 */

import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRoundDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function getRoundTotalRelative(round: Round): number {
  let total = 0;
  for (const score of round.scores) {
    const hole = round.course.holes.find((h) => h.number === score.holeNumber);
    if (hole) total += score.strokes - hole.par;
  }
  return total;
}

function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

export type BulkClaimSheetProps = {
  friendName: string;
  /** The roster Player.id of the friend on this device. Claim entries are keyed by playerId. */
  friendPlayerId: string;
  rounds: Round[];
  onClose: () => void;
};

export function BulkClaimSheet({
  friendName,
  friendPlayerId,
  rounds,
  onClose,
}: BulkClaimSheetProps) {
  const { colors } = useTheme();
  const { setRoundClaim } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const apply = (status: 'claimed' | 'not-claimed') => {
    for (const round of rounds) {
      setRoundClaim(round.id, friendPlayerId, status);
    }
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.head}>FRIEND ADDED</Text>
          <Text style={styles.title}>{friendName} is now your friend</Text>
          <Text style={styles.body}>
            You've recorded {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'} together.
            Claim them now to add them to {friendName}'s history, or review them one at a time
            later.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rounds.map((round) => {
              const rel = getRoundTotalRelative(round);
              return (
                <View key={round.id} style={styles.roundRow}>
                  <View style={styles.roundInfo}>
                    <Text style={styles.roundCourse} numberOfLines={1}>
                      {round.course.name}
                    </Text>
                    <Text style={styles.roundMeta}>
                      {round.scoringRule === 'scramble' ? 'Scramble' : 'Stroke'} ·{' '}
                      {formatRoundDate(round.completedAt ?? round.startedAt)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.roundScore,
                      rel > 0 && styles.scoreOver,
                      rel < 0 && styles.scoreUnder,
                    ]}>
                    {formatScore(rel)}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => onClose()}>
              <Text style={styles.btnSecondaryText}>Review later</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnDanger]}
              onPress={() => apply('not-claimed')}>
              <Text style={styles.btnDangerText}>Reject all</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => apply('claimed')}>
              <Text style={styles.btnPrimaryText}>Claim all</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 20,
      paddingBottom: 32,
      maxHeight: '80%',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 14,
    },
    head: {
      fontSize: 10,
      letterSpacing: 0.7,
      fontWeight: '800',
      color: colors.primary,
      marginBottom: 4,
    },
    title: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 8,
    },
    body: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 14,
    },
    list: {
      maxHeight: 240,
    },
    listContent: {
      gap: 6,
    },
    roundRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    roundInfo: {
      flex: 1,
      minWidth: 0,
    },
    roundCourse: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    roundMeta: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    roundScore: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    scoreOver: { color: colors.accent },
    scoreUnder: { color: colors.primaryDark },
    actions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
    },
    btn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
    },
    btnSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    btnSecondaryText: {
      color: colors.textMuted,
      fontWeight: '800',
      fontSize: 12,
    },
    btnDanger: {
      backgroundColor: '#dc2626',
    },
    btnDangerText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 12,
    },
    btnPrimary: {
      backgroundColor: colors.primary,
    },
    btnPrimaryText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 12,
    },
  });
}
