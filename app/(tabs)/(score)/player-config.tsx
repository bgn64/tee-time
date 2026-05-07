/**
 * Player configuration screen — add/remove players before starting a round.
 * Sub-screen of the Score tab. Header left = "‹ Course" back button.
 *
 * Player count constraints (v1): 1–4. You is always present and non-removable.
 * At cap (4), Add Player and Quick-add affordances are disabled.
 *
 * Format toggle: Stroke (default) or Scramble. In Scramble mode the list splits
 * into one or more dynamically-added Team N sections, each with their own
 * + Add Player button. One team is a valid configuration. Removing a team
 * (× on the team header, only on Team 2+) merges its players into Team 1.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayerBottomSheet } from '@/components/PlayerBottomSheet';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Player, ScoringRule, Team } from '@/types/golf';

const MAX_PLAYERS = 4;
const MAX_TEAMS = 4;
const TEAM_COLORS = ['#2e7d32', '#6a1b9a', '#e65100', '#00838f'];

export default function PlayerConfigScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { startRound, courses } = useGolfRound();
  const { recentPlayers, markRecent, defaultPlayerId, getPlayer } = usePlayers();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Course', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const course = courses.find((c) => c.id === courseId);

  const [scoringRule, setScoringRule] = useState<ScoringRule>('stroke');
  const [strokeIds, setStrokeIds] = useState<string[]>(() =>
    defaultPlayerId ? [defaultPlayerId] : []
  );
  // Each inner array is one team's player ids. Index 0 is Team 1.
  const [scrambleTeams, setScrambleTeams] = useState<string[][]>([]);

  const [showSheet, setShowSheet] = useState(false);
  // null = stroke mode; number = team index in scramble mode.
  const [sheetTeamIndex, setSheetTeamIndex] = useState<number | null>(null);

  const allRoundPlayerIds =
    scoringRule === 'stroke' ? strokeIds : scrambleTeams.flat();
  const atCap = allRoundPlayerIds.length >= MAX_PLAYERS;

  function switchScoringRule(next: ScoringRule) {
    if (next === scoringRule) return;
    if (next === 'scramble') {
      // Migrate the stroke roster into Team 1.
      setScrambleTeams([strokeIds]);
    } else {
      // Merge all teams back into the stroke roster.
      setStrokeIds(scrambleTeams.flat());
      setScrambleTeams([]);
    }
    setScoringRule(next);
  }

  function openSheet(teamIndex: number | null) {
    setSheetTeamIndex(teamIndex);
    setShowSheet(true);
  }

  function addToRound(player: Player) {
    if (atCap) return;
    if (allRoundPlayerIds.includes(player.id)) return;
    if (scoringRule === 'stroke' || sheetTeamIndex === null) {
      setStrokeIds((prev) => [...prev, player.id]);
    } else {
      setScrambleTeams((prev) =>
        prev.map((t, i) => (i === sheetTeamIndex ? [...t, player.id] : t))
      );
    }
    markRecent(player.id);
  }

  function quickAdd(player: Player) {
    if (atCap) return;
    if (allRoundPlayerIds.includes(player.id)) return;
    setStrokeIds((prev) => [...prev, player.id]);
    markRecent(player.id);
  }

  function removeFromRound(playerId: string) {
    if (scoringRule === 'stroke') {
      setStrokeIds((prev) => prev.filter((id) => id !== playerId));
    } else {
      setScrambleTeams((prev) => prev.map((t) => t.filter((id) => id !== playerId)));
    }
  }

  function addTeam() {
    if (scrambleTeams.length >= MAX_TEAMS) return;
    if (allRoundPlayerIds.length >= MAX_PLAYERS) return;
    setScrambleTeams((prev) => [...prev, []]);
  }

  function removeTeam(index: number) {
    // Team 1 is the merge target — never removable.
    if (index === 0) return;
    setScrambleTeams((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const removed = prev[index];
      const remaining = prev.filter((_, i) => i !== index);
      // Merge removed team's players into Team 1.
      return remaining.map((t, i) => (i === 0 ? [...t, ...removed] : t));
    });
  }

  function handleStartRound() {
    if (!courseId) return;
    if (scoringRule === 'stroke') {
      if (strokeIds.length === 0) return;
      startRound(courseId, strokeIds, 'stroke');
    } else {
      if (scrambleTeams.length === 0) return;
      if (scrambleTeams.some((t) => t.length === 0)) return;
      const teams: Team[] = scrambleTeams.map((playerIds, i) => ({
        id: `team-${i + 1}`,
        name: `Team ${i + 1}`,
        color: TEAM_COLORS[i] ?? TEAM_COLORS[0],
        playerIds,
      }));
      startRound(courseId, scrambleTeams.flat(), 'scramble', teams);
    }
    // Locked round: replace the Score tab stack so Scoring becomes the root
    // and there's no back-stack to pop into Player Config.
    router.replace('/(tabs)/(score)/scoring');
  }

  const availableRecents = recentPlayers.filter(
    (p) => !allRoundPlayerIds.includes(p.id)
  );

  const canStart =
    scoringRule === 'stroke'
      ? strokeIds.length > 0
      : scrambleTeams.length > 0 && scrambleTeams.every((t) => t.length > 0);

  const canAddTeam =
    scoringRule === 'scramble' && scrambleTeams.length < MAX_TEAMS && !atCap;

  function renderPlayerRow(id: string) {
    const player = getPlayer(id);
    if (!player) return null;
    const isDefault = id === defaultPlayerId;
    return (
      <View key={id} style={styles.playerRow}>
        <View style={[styles.avatar, { backgroundColor: player.color || colors.primary }]}>
          <Text style={styles.avatarText}>{player.name[0]}</Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{player.name}</Text>
          {isDefault && <Text style={styles.playerTag}>Always included</Text>}
        </View>
        {!isDefault && (
          <Pressable onPress={() => removeFromRound(id)} style={styles.removeBtn}>
            <Text style={styles.removeBtnText}>×</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {course && <Text style={styles.courseContext}>{course.name}</Text>}
        <Text style={styles.title}>Who's playing?</Text>

        <Text style={styles.sectionTitle}>Format</Text>
        <View style={styles.formatRow}>
          <Pressable
            style={[styles.formatChip, scoringRule === 'stroke' && styles.formatChipActive]}
            onPress={() => switchScoringRule('stroke')}>
            <Text
              style={[
                styles.formatChipText,
                scoringRule === 'stroke' && styles.formatChipTextActive,
              ]}>
              Stroke
            </Text>
          </Pressable>
          <Pressable
            style={[styles.formatChip, scoringRule === 'scramble' && styles.formatChipActive]}
            onPress={() => switchScoringRule('scramble')}>
            <Text
              style={[
                styles.formatChipText,
                scoringRule === 'scramble' && styles.formatChipTextActive,
              ]}>
              Scramble
            </Text>
          </Pressable>
        </View>

        {scoringRule === 'stroke' ? (
          <>
            <Text style={styles.sectionTitle}>In this round</Text>
            {strokeIds.map((id) => renderPlayerRow(id))}

            <Pressable
              style={[styles.addButton, atCap && styles.addButtonDisabled]}
              onPress={() => !atCap && openSheet(null)}
              disabled={atCap}>
              <Text style={[styles.addButtonText, atCap && styles.addButtonTextDisabled]}>
                + Add Player
              </Text>
            </Pressable>

            {availableRecents.length > 0 && !atCap && (
              <>
                <Text style={styles.sectionTitle}>Quick add</Text>
                {availableRecents.map((player) => (
                  <View key={player.id} style={styles.playerRow}>
                    <View
                      style={[styles.avatar, { backgroundColor: player.color || colors.primary }]}>
                      <Text style={styles.avatarText}>{player.name[0]}</Text>
                    </View>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.name}</Text>
                      <Text style={styles.playerTag}>Recent</Text>
                    </View>
                    <Pressable onPress={() => quickAdd(player)} style={styles.addActionBtn}>
                      <Text style={styles.addActionBtnText}>+</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {scrambleTeams.map((teamPlayerIds, i) => {
              const teamColor = TEAM_COLORS[i] ?? TEAM_COLORS[0];
              const teamName = `Team ${i + 1}`;
              const canRemove = i > 0;
              return (
                <View
                  key={i}
                  style={[
                    styles.teamSection,
                    {
                      backgroundColor: hexWithAlpha(teamColor, 0.05),
                      borderColor: hexWithAlpha(teamColor, 0.2),
                    },
                  ]}>
                  <View style={styles.teamSectionHead}>
                    <Text style={[styles.teamSectionTitle, { color: teamColor }]}>
                      {teamName.toUpperCase()}
                    </Text>
                    {canRemove && (
                      <Pressable onPress={() => removeTeam(i)} style={styles.teamRemoveBtn}>
                        <Text style={styles.teamRemoveBtnText}>×</Text>
                      </Pressable>
                    )}
                  </View>
                  {teamPlayerIds.map((id) => renderPlayerRow(id))}
                  <Pressable
                    style={[styles.teamAddBtn, atCap && styles.addButtonDisabled]}
                    onPress={() => !atCap && openSheet(i)}
                    disabled={atCap}>
                    <Text
                      style={[styles.addButtonText, atCap && styles.addButtonTextDisabled]}>
                      + Add Player to {teamName}
                    </Text>
                  </Pressable>
                </View>
              );
            })}

            {canAddTeam && (
              <Pressable style={styles.addTeamBtn} onPress={addTeam}>
                <Text style={styles.addTeamBtnText}>+ Add Team</Text>
              </Pressable>
            )}

            <Text style={styles.helperText}>
              One team is fine. Removing a team merges its players into Team 1.{'\n'}
              Team total per hole = team's stroke count (one ball per team).
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.startButton, !canStart && styles.disabledButton]}
          onPress={handleStartRound}
          disabled={!canStart}>
          <Text style={styles.startButtonText}>⛳ Start Round</Text>
        </Pressable>
      </View>

      <PlayerBottomSheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        onSelectPlayer={(player) => {
          addToRound(player);
          setShowSheet(false);
        }}
        excludeIds={allRoundPlayerIds}
        atCap={atCap}
      />
    </View>
  );
}

// Build a CSS-like rgba from a hex color and an alpha (0–1).
function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 100,
    },
    courseContext: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 18,
      marginBottom: 8,
    },
    formatRow: {
      flexDirection: 'row',
      gap: 8,
    },
    formatChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
    },
    formatChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    formatChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    formatChipTextActive: {
      color: '#ffffff',
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 6,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
    playerInfo: { flex: 1, marginLeft: 10 },
    playerName: { fontSize: 14, fontWeight: '700', color: colors.textTitle },
    playerTag: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    removeBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBtnText: { fontSize: 20, fontWeight: '400', color: colors.textMuted },
    addActionBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addActionBtnText: { fontSize: 20, fontWeight: '700', color: colors.primary },
    addButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      padding: 12,
      marginTop: 4,
    },
    addButtonDisabled: { opacity: 0.4 },
    addButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    addButtonTextDisabled: { color: colors.textMuted },
    teamSection: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      marginTop: 14,
    },
    teamSectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    teamSectionTitle: {
      flex: 1,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
    },
    teamRemoveBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    teamRemoveBtnText: {
      fontSize: 20,
      fontWeight: '400',
      color: colors.textMuted,
    },
    teamAddBtn: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      padding: 10,
      marginTop: 2,
    },
    addTeamBtn: {
      alignItems: 'center',
      borderColor: colors.primary,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      padding: 12,
      marginTop: 14,
    },
    addTeamBtnText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '800',
    },
    helperText: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 12,
      textAlign: 'center',
      lineHeight: 16,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      padding: 16,
      paddingBottom: 28,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    startButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 22,
      paddingVertical: 14,
    },
    disabledButton: { opacity: 0.4 },
    startButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  });
}
