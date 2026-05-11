/**
 * Format selection — Step 2 of the Score-tab round-setup flow.
 *
 * Receives `courseId` + comma-separated `playerIds` via URL params.
 * Lets the user pick Stroke (default) or Scramble. In Scramble the
 * players are auto-grouped into pairs; the user can re-group via a
 * "Move to..." bottom sheet on any member chip. Groups are dynamic —
 * no fixed Team 1/2 slots. A group's display name and color are
 * derived from its members at render time.
 *
 * Tap "Start round" → calls `startRound(...)` and replaces into
 * `/scoring`.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildTeamsFromGroups,
  defaultScrambleGroups,
  deriveTeamColor,
  deriveTeamName,
} from '@/lib/teams';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import type { ScoringRule } from '@/types/golf';

export default function FormatScreen() {
  const { courseId, playerIds: rawPlayerIds } = useLocalSearchParams<{
    courseId: string;
    playerIds: string;
  }>();
  const { courses, startRound } = useGolfRound();
  const { getPlayer, defaultPlayerId } = usePlayers();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Players', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const playerIds = useMemo<string[]>(
    () => (rawPlayerIds ? rawPlayerIds.split(',').filter(Boolean) : []),
    [rawPlayerIds]
  );
  const course = courses.find((c) => c.id === courseId);

  const [scoringRule, setScoringRule] = useState<ScoringRule>('stroke');
  // Scramble groups: each inner array is one team's playerIds. Lazy
  // init pairs the players via the default split.
  const [groups, setGroups] = useState<string[][]>(() =>
    defaultScrambleGroups(playerIds)
  );
  // Stable per-group team ids preserved across renders so a member
  // shuffle doesn't generate a fresh id every keystroke.
  const [groupIds] = useState<string[]>(() =>
    Array.from({ length: 4 }, (_, i) => `team-${i + 1}-${Date.now()}`)
  );

  // "Move X" bottom sheet state. `moveSource` carries the playerId we
  // tapped + the index of the group they currently belong to.
  const [moveSource, setMoveSource] = useState<{ playerId: string; fromGroup: number } | null>(
    null
  );

  const resolveName = useCallback(
    (playerId: string) => {
      if (defaultPlayerId && playerId === defaultPlayerId) return 'You';
      const p = getPlayer(playerId);
      return p?.displayName ?? p?.nickname ?? 'Player';
    },
    [defaultPlayerId, getPlayer]
  );

  function moveMember(playerId: string, fromGroup: number, toGroup: number | 'new') {
    setGroups((prev) => {
      const next = prev.map((g) => g.filter((id) => id !== playerId));
      if (toGroup === 'new') {
        next.push([playerId]);
      } else {
        next[toGroup] = [...next[toGroup], playerId];
      }
      // Drop any empty group resulting from the move.
      return next.filter((g) => g.length > 0);
    });
  }

  function handleStart() {
    if (!courseId || playerIds.length === 0) return;
    if (scoringRule === 'stroke') {
      startRound(courseId, playerIds, 'stroke');
    } else {
      const teams = buildTeamsFromGroups(groups, getPlayer, defaultPlayerId, groupIds);
      startRound(courseId, groups.flat(), 'scramble', teams);
    }
    router.replace('/(tabs)/(score)/scoring');
  }

  const subtitleNames = playerIds.map(resolveName).join(', ');

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Choose a format</Text>
        {course && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {course.name} · {subtitleNames}
          </Text>
        )}

        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggle, scoringRule === 'stroke' && styles.toggleActive]}
            onPress={() => setScoringRule('stroke')}>
            <Text
              style={[
                styles.toggleText,
                scoringRule === 'stroke' && styles.toggleTextActive,
              ]}>
              Stroke
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggle, scoringRule === 'scramble' && styles.toggleActive]}
            onPress={() => setScoringRule('scramble')}>
            <Text
              style={[
                styles.toggleText,
                scoringRule === 'scramble' && styles.toggleTextActive,
              ]}>
              Scramble
            </Text>
          </Pressable>
        </View>

        {scoringRule === 'stroke' ? (
          <StrokeBody
            styles={styles}
            colors={colors}
            playerIds={playerIds}
            resolveName={resolveName}
            getPlayer={getPlayer}
            defaultPlayerId={defaultPlayerId}
          />
        ) : (
          <ScrambleBody
            styles={styles}
            colors={colors}
            groups={groups}
            resolveName={resolveName}
            getPlayer={getPlayer}
            defaultPlayerId={defaultPlayerId}
            onTapMember={(playerId, fromGroup) =>
              setMoveSource({ playerId, fromGroup })
            }
          />
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.nextBtn} onPress={handleStart}>
          <Text style={styles.nextBtnText}>Start round</Text>
        </Pressable>
      </View>

      <MoveSheet
        styles={styles}
        colors={colors}
        moveSource={moveSource}
        groups={groups}
        resolveName={resolveName}
        getPlayer={getPlayer}
        defaultPlayerId={defaultPlayerId}
        onClose={() => setMoveSource(null)}
        onPick={(toGroup) => {
          if (!moveSource) return;
          moveMember(moveSource.playerId, moveSource.fromGroup, toGroup);
          setMoveSource(null);
        }}
      />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;
type ThemeColors = ReturnType<typeof useTheme>['colors'];

function StrokeBody({
  styles,
  colors,
  playerIds,
  resolveName,
  getPlayer,
  defaultPlayerId,
}: {
  styles: Styles;
  colors: ThemeColors;
  playerIds: string[];
  resolveName: (id: string) => string;
  getPlayer: (id: string) => ReturnType<typeof useGolfRound>['courses'][number] extends never
    ? never
    : ReturnType<typeof usePlayers>['getPlayer'] extends (id: string) => infer R
    ? R
    : never;
  defaultPlayerId: string | null;
}) {
  return (
    <>
      <View style={styles.help}>
        <Text style={styles.helpHead}>Stroke play.</Text>
        <Text style={styles.helpBody}>
          Everyone scores for themselves. Lowest total wins.
        </Text>
      </View>
      <Text style={styles.sectionLabel}>SCORING FOR</Text>
      <View style={styles.list}>
        {playerIds.map((id) => {
          const p = getPlayer(id);
          const isYou = defaultPlayerId === id;
          const color = p?.color ?? colors.primary;
          const letter = (p?.displayName ?? p?.nickname ?? '?')[0]?.toUpperCase() ?? '?';
          return (
            <View key={id} style={styles.rowCard}>
              <View style={[styles.rowAvatar, { backgroundColor: color }]}>
                <Text style={styles.rowAvatarText}>{letter}</Text>
              </View>
              <Text style={styles.rowName}>{isYou ? 'You' : resolveName(id)}</Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function ScrambleBody({
  styles,
  colors,
  groups,
  resolveName,
  getPlayer,
  defaultPlayerId,
  onTapMember,
}: {
  styles: Styles;
  colors: ThemeColors;
  groups: string[][];
  resolveName: (id: string) => string;
  getPlayer: ReturnType<typeof usePlayers>['getPlayer'];
  defaultPlayerId: string | null;
  onTapMember: (playerId: string, fromGroup: number) => void;
}) {
  return (
    <>
      <View style={styles.help}>
        <Text style={styles.helpHead}>Scramble.</Text>
        <Text style={styles.helpBody}>
          Players in the same group share one ball per hole. Tap a player to move them
          between groups.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>GROUPS</Text>
      <View style={styles.list}>
        {groups.map((members, i) => {
          const teamName = deriveTeamName(members, getPlayer, defaultPlayerId);
          const teamColor = deriveTeamColor(members, getPlayer, defaultPlayerId, i);
          return (
            <View
              key={i}
              style={[styles.teamCard, { borderLeftColor: teamColor }]}>
              <View style={styles.teamHead}>
                <Text style={[styles.teamName, { color: teamColor }]} numberOfLines={1}>
                  {teamName}
                </Text>
                <Text style={styles.teamCount}>
                  {members.length === 1 ? '1 player' : `${members.length} players`}
                </Text>
              </View>
              <View style={styles.teamMembers}>
                {members.map((id) => {
                  const p = getPlayer(id);
                  const isYou = defaultPlayerId === id;
                  const color = p?.color ?? colors.primary;
                  const letter =
                    (p?.displayName ?? p?.nickname ?? '?')[0]?.toUpperCase() ?? '?';
                  return (
                    <Pressable
                      key={id}
                      style={styles.memberChip}
                      onPress={() => onTapMember(id, i)}>
                      <View style={[styles.memberAvatar, { backgroundColor: color }]}>
                        <Text style={styles.memberAvatarText}>{letter}</Text>
                      </View>
                      <Text style={styles.memberLabel}>{isYou ? 'You' : resolveName(id)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function MoveSheet({
  styles,
  colors,
  moveSource,
  groups,
  resolveName,
  getPlayer,
  defaultPlayerId,
  onClose,
  onPick,
}: {
  styles: Styles;
  colors: ThemeColors;
  moveSource: { playerId: string; fromGroup: number } | null;
  groups: string[][];
  resolveName: (id: string) => string;
  getPlayer: ReturnType<typeof usePlayers>['getPlayer'];
  defaultPlayerId: string | null;
  onClose: () => void;
  onPick: (toGroup: number | 'new') => void;
}) {
  const visible = moveSource !== null;
  const movedName = moveSource ? resolveName(moveSource.playerId) : '';
  const currentGroup = moveSource ? groups[moveSource.fromGroup] : null;
  const currentName = currentGroup
    ? deriveTeamName(currentGroup, getPlayer, defaultPlayerId)
    : '';
  const currentColor = currentGroup
    ? deriveTeamColor(currentGroup, getPlayer, defaultPlayerId, moveSource!.fromGroup)
    : colors.primary;

  const wouldSplit = currentGroup && currentGroup.length > 1;
  const splitRemainingNames = wouldSplit
    ? deriveTeamName(
        currentGroup.filter((id) => id !== moveSource!.playerId),
        getPlayer,
        defaultPlayerId
      )
    : '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrab} />
          <Text style={styles.sheetTitle}>Move {movedName}</Text>
          {currentGroup && (
            <Text style={styles.sheetSubtitle}>
              Currently in <Text style={{ color: currentColor, fontWeight: '800' }}>{currentName}</Text>.
            </Text>
          )}

          <View style={styles.sheetList}>
            {groups.map((members, i) => {
              if (!moveSource || moveSource.fromGroup === i) return null;
              const name = deriveTeamName(members, getPlayer, defaultPlayerId);
              const color = deriveTeamColor(members, getPlayer, defaultPlayerId, i);
              return (
                <Pressable
                  key={i}
                  style={[styles.sheetItem, { borderColor: color, backgroundColor: `${color}1f` }]}
                  onPress={() => onPick(i)}>
                  <View style={styles.sheetItemAvatars}>
                    {members.slice(0, 3).map((id, idx) => {
                      const p = getPlayer(id);
                      const c = p?.color ?? color;
                      const letter =
                        (p?.displayName ?? p?.nickname ?? '?')[0]?.toUpperCase() ?? '?';
                      return (
                        <View
                          key={id}
                          style={[
                            styles.sheetItemAvatar,
                            { backgroundColor: c, marginLeft: idx === 0 ? 0 : -8 },
                          ]}>
                          <Text style={styles.sheetItemAvatarText}>{letter}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.sheetItemInfo}>
                    <Text style={styles.sheetItemTitle} numberOfLines={1}>
                      Join {name}
                    </Text>
                    <Text style={styles.sheetItemBody}>
                      {members.length} {members.length === 1 ? 'player' : 'players'} in this group
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {wouldSplit && (
              <Pressable style={styles.sheetItemNeutral} onPress={() => onPick('new')}>
                <View style={styles.sheetItemAvatarDashed}>
                  <Text style={styles.sheetItemAvatarDashedText}>+</Text>
                </View>
                <View style={styles.sheetItemInfo}>
                  <Text style={styles.sheetItemTitle}>Move to their own group</Text>
                  <Text style={styles.sheetItemBody}>
                    {currentGroup!.length === 2
                      ? `Splits "${currentName}" — ${splitRemainingNames} would be alone.`
                      : `Splits "${currentName}".`}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          <Pressable style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 24 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textTitle },
    subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 14 },

    toggleRow: {
      flexDirection: 'row',
      gap: 6,
      backgroundColor: colors.chipBg,
      borderRadius: 12,
      padding: 4,
      marginBottom: 14,
    },
    toggle: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8 },
    toggleActive: { backgroundColor: colors.cardBg },
    toggleText: { fontSize: 12.5, fontWeight: '800', color: colors.textMuted },
    toggleTextActive: { color: colors.textTitle },

    help: {
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    helpHead: { fontSize: 12, fontWeight: '800', color: colors.textTitle, marginBottom: 2 },
    helpBody: { fontSize: 11.5, color: colors.textMuted, lineHeight: 17 },

    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 8,
      marginLeft: 2,
    },

    list: { gap: 8 },

    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    rowAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowAvatarText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
    rowName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textTitle },

    teamCard: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderLeftWidth: 3,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    teamHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    teamName: { flex: 1, fontSize: 13, fontWeight: '800' },
    teamCount: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
    teamMembers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    memberChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.chipBg,
      borderRadius: 999,
      paddingLeft: 4,
      paddingRight: 9,
      paddingVertical: 3,
    },
    memberAvatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberAvatarText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
    memberLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textTitle },

    footer: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 20,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    nextBtn: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 22,
      paddingVertical: 14,
    },
    nextBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },

    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 22,
      maxHeight: '85%',
    },
    sheetGrab: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    sheetTitle: { fontSize: 14, fontWeight: '800', color: colors.textTitle, marginBottom: 4 },
    sheetSubtitle: { fontSize: 11.5, color: colors.textMuted, marginBottom: 12 },
    sheetList: { gap: 7 },
    sheetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sheetItemNeutral: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.chipBg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sheetItemAvatars: { flexDirection: 'row' },
    sheetItemAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: '#ffffff',
    },
    sheetItemAvatarText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
    sheetItemAvatarDashed: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetItemAvatarDashedText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
    sheetItemInfo: { flex: 1, minWidth: 0 },
    sheetItemTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textTitle },
    sheetItemBody: { fontSize: 10.5, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
    sheetCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
    sheetCancelText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  });
}
