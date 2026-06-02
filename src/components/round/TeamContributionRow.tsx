/**
 * TeamContributionRow — under each scramble team's aggregate tiles,
 * render the "most shots played · N" and "most tee shots played · N"
 * lines computed from shot attribution data.
 *
 * Per mockup §1: no section header — the rows just sit under the
 * aggregate tiles with a small top margin.
 *
 * When the attribution data is sparse or ambiguous (e.g. two
 * members tied for most shots, or no data recorded yet), we render
 * nothing rather than display a misleading single name. The
 * `findLeader` helper returns null on ties and empties.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import type { TeamContribution } from '@/library/golf/useRoundShotAttributions';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  contributions: readonly TeamContribution[];
  members: readonly AvatarMember[];
};

type LeaderLine = {
  member: AvatarMember;
  value: number;
};

function findLeader(
  contributions: readonly TeamContribution[],
  members: readonly AvatarMember[],
  pick: (c: TeamContribution) => number
): LeaderLine | null {
  let leader: { key: string; value: number } | null = null;
  let tied = false;
  for (const c of contributions) {
    const v = pick(c);
    if (v <= 0) continue;
    if (!leader || v > leader.value) {
      leader = { key: c.participantKey, value: v };
      tied = false;
    } else if (v === leader.value) {
      tied = true;
    }
  }
  if (!leader || tied) return null;
  const member = members.find((m) => m.id === leader.key);
  if (!member) return null;
  return { member, value: leader.value };
}

export function TeamContributionRow({ contributions, members }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const mostShots = useMemo(
    () => findLeader(contributions, members, (c) => c.shotsCount),
    [contributions, members]
  );
  const mostTeeShots = useMemo(
    () => findLeader(contributions, members, (c) => c.teeShotsCount),
    [contributions, members]
  );

  if (!mostShots && !mostTeeShots) return null;

  return (
    <View style={styles.wrap}>
      {mostShots ? (
        <View style={styles.row}>
          <TeamAvatarCluster members={[mostShots.member]} size="sm" />
          <Text style={styles.text}>
            <Text style={styles.label}>
              {mostShots.member.name.split(' ')[0]} ·{' '}
            </Text>
            most shots played{' '}
            <Text style={styles.value}>· {mostShots.value}</Text>
          </Text>
        </View>
      ) : null}
      {mostTeeShots ? (
        <View style={styles.row}>
          <TeamAvatarCluster members={[mostTeeShots.member]} size="sm" />
          <Text style={styles.text}>
            <Text style={styles.label}>
              {mostTeeShots.member.name.split(' ')[0]} ·{' '}
            </Text>
            most tee shots played{' '}
            <Text style={styles.value}>· {mostTeeShots.value}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 10,
      gap: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    text: {
      flex: 1,
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    label: {
      color: colors.textTitle,
      fontWeight: '700',
    },
    value: {
      color: colors.textTitle,
      fontWeight: '800',
    },
  });
}
