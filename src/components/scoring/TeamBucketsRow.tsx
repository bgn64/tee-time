/**
 * TeamBucketsRow — vertical stack of `TeamBucket` rows for the
 * scramble team-config UI, matching the per-player stack used by
 * the stroke flow. Renders one full-width row per team plus an
 * optional trailing "+" row driven by `newTeamSlot`. The slot is
 * null when no chip is selected or when the selected chip is
 * already alone on a team (in which case moving to a new team alone
 * would be a no-op re-id of the same group). When shown, the slot
 * is a single red-accent "+" — no copy.
 *
 * Pure shell. Per-row selection-mode decoration lives in
 * `TeamBucket`; this file just stacks them.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import { TeamBucket, type BucketMember } from './TeamBucket';
import type { ThemeColors } from '@/library/theme/themes';
import type { Tee } from '@/types/golf';

export type TeamBucketView = {
  id: string;
  members: BucketMember[];
  tee?: Tee;
  /** Bucket is a valid move destination — gets accent border + dimmed contents. */
  isDestination?: boolean;
};

export type NewTeamSlotDescriptor = {
  /** Required handler — the slot is never rendered in a disabled state. */
  onTap: () => void;
};

type Props = {
  teams: readonly TeamBucketView[];
  selectedPlayerId?: string | null;
  onTapChip: (teamId: string, playerId: string) => void;
  /** Fires when a destination row is tapped (whole-row target). */
  onTapBucket?: (teamId: string) => void;
  /** Pass `null` to hide the tee pill on every row. */
  onPickTeeForTeam: ((teamId: string) => void) | null;
  /** Pass `null` to hide the "+" row entirely. */
  newTeamSlot: NewTeamSlotDescriptor | null;
};

export function TeamBucketsRow({
  teams,
  selectedPlayerId,
  onTapChip,
  onTapBucket,
  onPickTeeForTeam,
  newTeamSlot,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stack}>
      {teams.map((team) => (
        <TeamBucket
          key={team.id}
          members={team.members}
          tee={team.tee}
          onPickTee={onPickTeeForTeam ? () => onPickTeeForTeam(team.id) : null}
          selectedPlayerId={selectedPlayerId}
          isDestination={!!team.isDestination}
          onTapBucket={
            team.isDestination && onTapBucket
              ? () => onTapBucket(team.id)
              : null
          }
          onTapChip={(playerId) => onTapChip(team.id, playerId)}
        />
      ))}
      {newTeamSlot ? (
        <Pressable
          onPress={newTeamSlot.onTap}
          style={({ pressed }) => [
            styles.addRow,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Move to a new team alone">
          <Text style={styles.addPlus}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    stack: {
      gap: 8,
    },
    addRow: {
      borderRadius: 18,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.cyan,
      backgroundColor: colors.glowCyan,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPlus: {
      color: colors.cyan,
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 26,
    },
  });
}
