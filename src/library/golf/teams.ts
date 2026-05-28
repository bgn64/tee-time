/**
 * Team naming + color derivation for scramble rounds.
 *
 * v2 model: groups are dynamic. A "Team" carries an internal id and a
 * list of participantKeys; its display `name` and `color` are derived
 * from its members rather than user-edited. If members shuffle, the
 * team's identity (id) survives, but its name/color recompute
 * automatically.
 *
 * Rules:
 *   · Display name = Oxford-comma join of members' displayNames. When
 *     the default participant is in the team and the caller supplies a
 *     `firstNameForSelf` (e.g. "Ben"), that label is used in place of
 *     the resolved displayName. If `firstNameForSelf` is
 *     omitted/empty, we fall through to the standard displayName
 *     lookup (NOT the literal "You").
 *   · Color = the default participant's color when they're in the
 *     team; otherwise the first member's color. Falls back to a
 *     palette fallback if no member has a color set.
 *   · A singleton (1-member) team shows just that participant's name.
 *
 * These helpers are pure — caller supplies all inputs. No React hooks,
 * no PowerSync imports; safe to call from non-component code.
 */

import { newTeamId } from './ids';
import type { Team } from '@/types/golf';

export const TEAM_FALLBACK_COLORS = ['#7cb342', '#4a90e2', '#9c5dde', '#ff8f00'];

/**
 * Subset of `ResolvedParticipant` the helpers actually need. Kept
 * structural so callers can pass either the resolver's full record or
 * any other source (e.g. seeded test fixtures) without coupling to the
 * full resolver shape.
 */
export type ResolvedForTeam = {
  displayName?: string;
  avatarColor?: string;
};

export function deriveTeamName(
  memberIds: string[],
  resolve: (id: string) => ResolvedForTeam | undefined,
  defaultPlayerId: string | null,
  firstNameForSelf?: string
): string {
  if (memberIds.length === 0) return 'Empty group';
  const labels = memberIds.map((id) => {
    if (
      defaultPlayerId &&
      id === defaultPlayerId &&
      firstNameForSelf &&
      firstNameForSelf.length > 0
    ) {
      return firstNameForSelf;
    }
    const p = resolve(id);
    const name = p?.displayName?.trim();
    return name && name.length > 0 ? name : 'Player';
  });
  return joinWithAnd(labels);
}

export function deriveTeamColor(
  memberIds: string[],
  resolve: (id: string) => ResolvedForTeam | undefined,
  defaultPlayerId: string | null,
  teamIndex: number
): string {
  if (defaultPlayerId && memberIds.includes(defaultPlayerId)) {
    const me = resolve(defaultPlayerId);
    if (me?.avatarColor) return me.avatarColor;
  }
  for (const id of memberIds) {
    const p = resolve(id);
    if (p?.avatarColor) return p.avatarColor;
  }
  return TEAM_FALLBACK_COLORS[teamIndex % TEAM_FALLBACK_COLORS.length];
}

/** ["A"] → "A"; ["A","B"] → "A & B"; ["A","B","C"] → "A, B & C"; etc. */
export function joinWithAnd(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}

/**
 * Build the full `Team[]` payload to ship to `startRound`. Caller owns
 * the `groups` array — each inner array is the participantKeys of one
 * group, preserving insertion order. We assign stable team ids based
 * on a monotonically-increasing counter so they survive within-session
 * member shuffles.
 *
 * `existingTeamIds` lets the caller carry forward ids across renders
 * so a team that stays alive doesn't get a fresh id every keystroke.
 */
export function buildTeamsFromGroups(
  groups: string[][],
  resolve: (id: string) => ResolvedForTeam | undefined,
  defaultPlayerId: string | null,
  existingTeamIds: string[] = [],
  firstNameForSelf?: string
): Team[] {
  return groups.map((memberIds, i) => ({
    id: existingTeamIds[i] ?? newTeamId(),
    name: deriveTeamName(memberIds, resolve, defaultPlayerId, firstNameForSelf),
    color: deriveTeamColor(memberIds, resolve, defaultPlayerId, i),
    playerIds: memberIds,
  }));
}

/**
 * Default scramble configuration: everyone on one team. The user can
 * split into more teams explicitly via the team-config UI. Differs
 * from the pre-rewrite app, which alternated players into two
 * separate teams — this milestone is opinionated about defaults.
 */
export function defaultScrambleGroups(playerIds: string[]): string[][] {
  if (playerIds.length === 0) return [];
  return [playerIds];
}

/**
 * Seed value for the scramble team-config UI's three pieces of
 * mutable state: the per-team member lists (`groups`), the parallel
 * stable team ids (`teamIds`), and the per-team tee map
 * (`teeIdByTeam`). Computed in one place so the ids in `teamIds` and
 * `teeIdByTeam` are guaranteed to match — historically these were
 * seeded from two separate `Date.now()` calls that could desync.
 */
export function buildInitialScrambleState(
  playerIds: readonly string[],
  defaultTeeId: string | undefined
): {
  groups: string[][];
  teamIds: string[];
  teeIdByTeam: Record<string, string | undefined>;
} {
  const groups = defaultScrambleGroups([...playerIds]);
  const teamIds = groups.map(() => newTeamId());
  const teeIdByTeam: Record<string, string | undefined> = {};
  for (const id of teamIds) teeIdByTeam[id] = defaultTeeId;
  return { groups, teamIds, teeIdByTeam };
}
