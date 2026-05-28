/**
 * ScrambleBody — the team-config panel for the Format screen when
 * `scoringRule === 'scramble'`. Controlled component: team-config
 * state (`groups`, `teamIds`, `teeIdByTeam`) lives in the parent
 * (`format.tsx`) so toggling stroke ↔ scramble preserves the user's
 * work. Only transient selection state (`selectedPlayerId`,
 * `pickerTeamId`) lives here.
 *
 * Layout: vertical stack of full-width team rows (chips left, tee
 * pill right) matching the stroke flow's per-player rows. No
 * "TEAMS" section label, no per-row team name header, no player
 * count — the chips themselves identify the team.
 *
 * Interaction model (direct-tap, no inline copy):
 *   - Tap a chip → that player becomes "selected" (accent outline).
 *     Other team rows light up as destinations (accent dashed
 *     border, contents dimmed to read as a single tappable card).
 *     The "+" row appears at the end of the stack IFF the source
 *     team has > 1 player.
 *   - Tap anywhere in a destination row → moves the selected player
 *     into that team. Chips + tee pill inside destinations are
 *     non-interactive (the bucket-level Pressable consumes the touch
 *     via pointerEvents: 'none' on the contents).
 *   - Tap the source row's selected chip → deselects. Tap a
 *     different chip in the source row → switches selection.
 *   - Tap "+" → creates a new singleton with the selected player.
 *
 * All instructional text is removed — visual affordances carry the
 * meaning (dashed accent = "tap here", dimmed contents = "the row,
 * not the individual chips, is the button now").
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  TeamBucketsRow,
  type TeamBucketView,
} from '@/components/scoring/TeamBucketsRow';
import { TeePickerSheet } from '@/components/scoring/TeePickerSheet';
import { newTeamId } from '@/library/golf/ids';
import { buildTeamsFromGroups } from '@/library/golf/teams';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ResolvedParticipant } from '@/library/golf/useParticipantResolver';
import type { Tee, Team } from '@/types/golf';

type Props = {
  playerIds: readonly string[];
  resolver: ReadonlyMap<string, ResolvedParticipant>;
  /** Participant key of the signed-in user, if they're playing. Used to label their team-name token. */
  selfParticipantKey?: string;
  /** First name (or other short label) for the signed-in user. Falls back to displayName when absent. */
  firstNameForSelf?: string;
  /** Course-defined tees. Empty array hides the tee pill. */
  courseTees: readonly Tee[];
  /** Default tee for the course; seeded onto newly-created teams. */
  defaultTeeId?: string;

  /** Controlled state — owned by the parent (`format.tsx`). */
  groups: string[][];
  setGroups: React.Dispatch<React.SetStateAction<string[][]>>;
  teamIds: string[];
  setTeamIds: React.Dispatch<React.SetStateAction<string[]>>;
  teeIdByTeam: Record<string, string | undefined>;
  setTeeIdByTeam: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
};

export function ScrambleBody({
  playerIds,
  resolver,
  selfParticipantKey,
  firstNameForSelf,
  courseTees,
  defaultTeeId,
  groups,
  setGroups,
  teamIds,
  setTeamIds,
  teeIdByTeam,
  setTeeIdByTeam,
}: Props) {
  const { colors } = useTheme();

  // Transient selection state — local. Lost on toggle to stroke,
  // which is fine (it's a mid-action UI affordance, not data).
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [pickerTeamId, setPickerTeamId] = useState<string | null>(null);

  // Derive `Team[]` (with names + colors) from groups + resolver. This
  // recomputes on every render — name/color depend on the live
  // resolver, but `id` is held stable via the parallel `teamIds`
  // array so React keys + score writes stay coherent.
  const teams = useMemo<Team[]>(() => {
    return buildTeamsFromGroups(
      groups,
      (id) => {
        const r = resolver.get(id);
        return r ? { displayName: r.displayName, avatarColor: r.avatarColor } : undefined;
      },
      selfParticipantKey ?? null,
      teamIds,
      firstNameForSelf
    );
  }, [groups, teamIds, resolver, selfParticipantKey, firstNameForSelf]);

  function dropTeamTeeId(teamId: string) {
    setTeeIdByTeam((prev) => {
      if (!(teamId in prev)) return prev;
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
  }

  function movePlayerToTeam(playerId: string, destTeamId: string) {
    const sourceIdx = groups.findIndex((g) => g.includes(playerId));
    const destIdx = teamIds.indexOf(destTeamId);
    if (sourceIdx === -1 || destIdx === -1 || teamIds[sourceIdx] === destTeamId) {
      // No-op move (source == dest or invalid). Treat as a cancel.
      setSelectedPlayerId(null);
      return;
    }
    const nextGroups = groups.map((g) => [...g]);
    nextGroups[sourceIdx] = nextGroups[sourceIdx].filter((p) => p !== playerId);
    nextGroups[destIdx].push(playerId);

    let nextIds = teamIds;
    if (nextGroups[sourceIdx].length === 0) {
      const droppedId = teamIds[sourceIdx];
      nextGroups.splice(sourceIdx, 1);
      nextIds = teamIds.filter((_, i) => i !== sourceIdx);
      dropTeamTeeId(droppedId);
    }

    setGroups(nextGroups);
    setTeamIds(nextIds);
    setSelectedPlayerId(null);
  }

  function moveSelectedToNewSingleton() {
    if (!selectedPlayerId) return;
    const playerId = selectedPlayerId;
    const sourceIdx = groups.findIndex((g) => g.includes(playerId));
    if (sourceIdx === -1) return;
    // Source is already a singleton — moving to a "new team alone"
    // would just re-id the team with no visible effect. Bail.
    if (groups[sourceIdx].length <= 1) {
      setSelectedPlayerId(null);
      return;
    }

    const nextGroups = groups.map((g) => [...g]);
    nextGroups[sourceIdx] = nextGroups[sourceIdx].filter((p) => p !== playerId);
    const nextIds = [...teamIds];
    const newId = newTeamId();
    nextGroups.push([playerId]);
    nextIds.push(newId);

    setGroups(nextGroups);
    setTeamIds(nextIds);
    setTeeIdByTeam((prev) => ({ ...prev, [newId]: defaultTeeId }));
    setSelectedPlayerId(null);
  }

  function handleChipTap(_teamId: string, playerId: string) {
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      return;
    }
    setSelectedPlayerId(playerId);
  }

  function handleBucketTap(teamId: string) {
    if (!selectedPlayerId) return;
    movePlayerToTeam(selectedPlayerId, teamId);
  }

  // Look up details about the currently-selected chip — used to
  // gate the "+ New team" slot (hidden when source is a singleton,
  // because the move would just re-id the same team with no visible
  // effect).
  const selectedPlayerInfo = useMemo(() => {
    if (!selectedPlayerId) return null;
    const sourceTeamId = teams.find((t) =>
      t.playerIds.includes(selectedPlayerId)
    )?.id;
    const sourceTeam = teams.find((t) => t.id === sourceTeamId);
    return {
      playerId: selectedPlayerId,
      sourceTeamId,
      sourceIsSingleton: (sourceTeam?.playerIds.length ?? 0) <= 1,
    };
  }, [selectedPlayerId, teams]);

  // Build the views fed to TeamBucketsRow. Each bucket is marked
  // source/destination — destination rows render the whole row as
  // one button (chips + tee pill inside dimmed + non-interactive).
  // No inline copy: the dashed accent border carries the affordance.
  const teamViews = useMemo<TeamBucketView[]>(() => {
    return teams.map((team) => {
      const isSource = selectedPlayerInfo?.sourceTeamId === team.id;
      const isDestination = !!selectedPlayerInfo && !isSource;
      return {
        id: team.id,
        tee: courseTees.find((t) => t.id === (teeIdByTeam[team.id] ?? defaultTeeId)),
        members: team.playerIds.map((pid) => {
          const r = resolver.get(pid);
          return {
            id: pid,
            name: r?.displayName || 'Player',
            color: r?.avatarColor || colors.primary,
          };
        }),
        isDestination,
      };
    });
  }, [
    teams,
    resolver,
    courseTees,
    teeIdByTeam,
    defaultTeeId,
    colors.primary,
    selectedPlayerInfo,
  ]);

  const hasTees = courseTees.length > 0;

  // "+ New team" slot is null (hidden) unless there's a selected
  // player whose source team has > 1 player. No helper text, no
  // "+ New team for X" copy — the slot is just a "+" affordance that
  // appears precisely when it's actionable.
  const newTeamSlot =
    selectedPlayerInfo && !selectedPlayerInfo.sourceIsSingleton
      ? { onTap: moveSelectedToNewSingleton }
      : null;

  const pickerTeamName = pickerTeamId
    ? (teams.find((t) => t.id === pickerTeamId)?.name ?? '')
    : '';

  return (
    <View>
      <TeamBucketsRow
        teams={teamViews}
        selectedPlayerId={selectedPlayerId}
        onTapChip={handleChipTap}
        onTapBucket={handleBucketTap}
        onPickTeeForTeam={hasTees ? (teamId) => setPickerTeamId(teamId) : null}
        newTeamSlot={newTeamSlot}
      />

      <TeePickerSheet
        visible={pickerTeamId !== null && hasTees}
        scorerName={pickerTeamName}
        tees={[...courseTees]}
        selectedTeeId={pickerTeamId ? (teeIdByTeam[pickerTeamId] ?? defaultTeeId) : undefined}
        onCancel={() => setPickerTeamId(null)}
        onPick={(teeId) => {
          if (!pickerTeamId) return;
          setTeeIdByTeam((prev) => ({ ...prev, [pickerTeamId]: teeId }));
          setPickerTeamId(null);
        }}
      />
    </View>
  );
}
