/**
 * Team naming + color derivation for scramble rounds.
 *
 * v2 model: groups are dynamic. A "Team" carries an internal id and a
 * list of player ids; its display `name` and `color` are derived from
 * its members rather than user-edited. If members shuffle, the team's
 * identity (id) survives, but its name/color recompute automatically.
 *
 * Rules:
 *   · Display name = Oxford-comma join of members' displayNames. When
 *     the default player is in the team and the caller supplies a
 *     `firstNameForSelf` (e.g. "Ben"), that label is used in place of
 *     the player's nickname/displayName. If `firstNameForSelf` is
 *     omitted/empty, we fall through to the standard
 *     displayName/nickname lookup (NOT the literal "You").
 *   · Color = the default-player's color when they're in the team;
 *     otherwise the first member's color. Falls back to a palette
 *     fallback if no member has a color set.
 *   · A singleton (1-member) team shows just that player's name.
 *
 * These helpers are pure — caller supplies all inputs. No React hooks,
 * no `state/` imports; safe to call from non-component code.
 */

import type { Player, Team } from '@/types/golf';

export const TEAM_FALLBACK_COLORS = ['#7cb342', '#4a90e2', '#9c5dde', '#ff8f00'];

export function deriveTeamName(
  memberIds: string[],
  resolvePlayer: (id: string) => Player | undefined,
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
    const p = resolvePlayer(id);
    return p?.displayName ?? p?.nickname ?? 'Player';
  });
  return joinWithAnd(labels);
}

export function deriveTeamColor(
  memberIds: string[],
  resolvePlayer: (id: string) => Player | undefined,
  defaultPlayerId: string | null,
  teamIndex: number
): string {
  if (defaultPlayerId && memberIds.includes(defaultPlayerId)) {
    const me = resolvePlayer(defaultPlayerId);
    if (me?.color) return me.color;
  }
  for (const id of memberIds) {
    const p = resolvePlayer(id);
    if (p?.color) return p.color;
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
 * the `groups` array — each inner array is the playerIds of one group,
 * preserving insertion order. We assign stable team ids based on a
 * monotonically-increasing counter so they survive within-session
 * member shuffles.
 *
 * `existingTeamIds` lets the caller carry forward ids across renders
 * so a team that stays alive doesn't get a fresh id every keystroke.
 */
export function buildTeamsFromGroups(
  groups: string[][],
  resolvePlayer: (id: string) => Player | undefined,
  defaultPlayerId: string | null,
  existingTeamIds: string[] = [],
  firstNameForSelf?: string
): Team[] {
  return groups.map((memberIds, i) => ({
    id: existingTeamIds[i] ?? `team-${i + 1}-${Date.now()}`,
    name: deriveTeamName(memberIds, resolvePlayer, defaultPlayerId, firstNameForSelf),
    color: deriveTeamColor(memberIds, resolvePlayer, defaultPlayerId, i),
    playerIds: memberIds,
  }));
}

/**
 * Default pair-up for scramble: split the selected players into two
 * groups by alternating order. With N players, even-indexed go to
 * group 0 and odd-indexed go to group 1. For 1 player → 1 group; for
 * 3 → 2-1 split; for 4 → 2-2 split.
 */
export function defaultScrambleGroups(playerIds: string[]): string[][] {
  if (playerIds.length <= 1) return playerIds.length === 0 ? [] : [playerIds];
  const a: string[] = [];
  const b: string[] = [];
  playerIds.forEach((id, i) => {
    if (i % 2 === 0) a.push(id);
    else b.push(id);
  });
  return b.length > 0 ? [a, b] : [a];
}
