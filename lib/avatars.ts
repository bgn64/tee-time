/**
 * Pure helpers that drive avatar rendering on the Rounds list card.
 *
 * These power the per-participant cluster that replaces the old
 * "one avatar per team" scramble fallback: stroke rounds get a flat
 * row of individuals, scramble rounds get the same individuals
 * grouped by team. Each individual carries the tee they played, so
 * the card can show a small tee-color chip beside them.
 *
 * Kept pure (no React, no contexts) so the logic is unit-testable in
 * isolation. The screen passes in the round, a `getPlayer` lookup,
 * and a fallback color; helpers return plain data the screen renders.
 *
 * Truncation policy: a flat cap on the number of individuals rendered
 * (`MAX_AVATAR_INDIVIDUALS`). When the round has more participants,
 * the trailing entries are collapsed into a single `"+N"` chip. The
 * cap applies to the total across all teams in scramble rounds; teams
 * are filled in `round.teams[]` order until the cap is reached, so a
 * team may be partially represented or omitted entirely if earlier
 * teams used up the budget. This keeps the card compact without
 * trying to be clever about per-team fairness.
 */
import type { Player, Round, RoundParticipant, Tee } from '@/types/golf';

export const MAX_AVATAR_INDIVIDUALS = 4;

/**
 * Canonical tee-color hex map. Mirrors the same names used by the tee
 * picker UI (`components/TeePickerSheet.tsx`). Some upstream catalog data
 * stores tee colors as named strings (e.g. "blue", "white") instead of
 * hex, so we resolve both. Keys are lowercased.
 */
const TEE_COLOR_HEX: Record<string, string> = {
  black: '#1a1a1a',
  blue: '#4a90e2',
  white: '#ddd6c4',
  gold: '#c9a64a',
  red: '#d54848',
  green: '#7cb342',
  yellow: '#f5d020',
  burgundy: '#722f37',
};

/** Resolve a `Tee` row to its rendered swatch color. Returns undefined
 *  when neither the explicit `color` field nor the tee name maps to a
 *  known color — callers should render no chip in that case. */
export function resolveTeeSwatch(tee: Tee | undefined): string | undefined {
  if (!tee) return undefined;
  if (tee.color) {
    const known = TEE_COLOR_HEX[tee.color.toLowerCase()];
    if (known) return known;
    if (tee.color.startsWith('#')) return tee.color;
  }
  const byName = TEE_COLOR_HEX[tee.name.toLowerCase()];
  return byName;
}

export type AvatarEntry = {
  /** Stable key for React lists; the participant's `participantKey`. */
  participantKey: string;
  /** Display name to render initials from. */
  name: string;
  /** Avatar background color. */
  color: string;
  /** Tee played, when known. Absent if the participant has no `teeId`. */
  teeId?: string;
  /** Resolved tee color. Absent when the tee can't be found on the round's course. */
  teeColor?: string;
  /** Resolved tee name (e.g. "Blue"). Absent when the tee can't be resolved. */
  teeName?: string;
  /** Team membership, only set in scramble rounds. */
  teamId?: string;
  /** Team color, mirrored from `round.teams[]` when teamId is set. */
  teamColor?: string;
};

export type TeamGroup = {
  /** Team id from `round.teams[]`; `null` for the synthetic "no team" group. */
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  members: AvatarEntry[];
};

export type ResolveParticipant = (
  participant: RoundParticipant
) => { name: string; color: string };

/**
 * Default name/color resolver wired around the rounds screen's
 * `getPlayer` lookup. Mirrors the inline resolution the screen used
 * before this helper existed: linked participants resolve through the
 * roster, local participants use their snapshot fields.
 */
export function makeRosterResolver(
  getPlayer: (id: string) => Player | undefined,
  fallbackColor: string
): ResolveParticipant {
  return (p: RoundParticipant) => {
    if (p.linkedUserId) {
      const rosterMatch = getPlayer(p.participantKey);
      return {
        name: rosterMatch?.displayName ?? rosterMatch?.nickname ?? 'Friend',
        color: rosterMatch?.color ?? fallbackColor,
      };
    }
    return {
      name: p.localDisplayName ?? 'Player',
      color: p.localDisplayColor ?? fallbackColor,
    };
  };
}

function indexTees(tees: Tee[] | undefined): Map<string, Tee> {
  const map = new Map<string, Tee>();
  if (!tees) return map;
  for (const t of tees) map.set(t.id, t);
  return map;
}

function indexTeams(round: Round): Map<string, { name: string; color: string }> {
  const map = new Map<string, { name: string; color: string }>();
  for (const t of round.teams ?? []) {
    map.set(t.id, { name: t.name, color: t.color });
  }
  return map;
}

/**
 * Build one `AvatarEntry` per round participant.
 *
 * Stroke rounds: one entry per participant; `teamId`/`teamColor` left
 * undefined.
 * Scramble rounds: one entry per participant, `teamId`/`teamColor`
 * populated from the participant's `teamId` matched against
 * `round.teams[]`. Entries are returned in `round.participants[]`
 * order; team grouping happens via `groupByTeam`.
 *
 * Tee fields fall back to undefined when the participant has no
 * `teeId` OR the id can't be resolved against `round.course.tees`
 * — letting the renderer skip the chip on older rounds without
 * special-casing.
 */
export function buildAvatarEntries(
  round: Round,
  resolveParticipant: ResolveParticipant
): AvatarEntry[] {
  const isScramble = round.scoringRule === 'scramble';
  const teeById = indexTees(round.course.tees);
  const teamById = isScramble ? indexTeams(round) : null;

  return (round.participants ?? []).map((p) => {
    const identity = resolveParticipant(p);
    const tee = p.teeId ? teeById.get(p.teeId) : undefined;
    const team = isScramble && p.teamId ? teamById?.get(p.teamId) : undefined;

    return {
      participantKey: p.participantKey,
      name: identity.name,
      color: identity.color,
      teeId: p.teeId,
      teeColor: resolveTeeSwatch(tee),
      teeName: tee?.name,
      teamId: isScramble ? p.teamId : undefined,
      teamColor: team?.color,
    };
  });
}

/**
 * Group AvatarEntry list by team, preserving `round.teams[]` order.
 *
 * Entries with no `teamId` (e.g. stroke rounds, or scramble rounds
 * with a stray un-teamed participant) collect into a final synthetic
 * `{ teamId: null }` group. Teams that have no members in the input
 * list are omitted (the truncation may have dropped them, or the
 * round may have an empty team).
 *
 * Caller supplies the team order explicitly via `teams` rather than
 * inferring from entries so empty teams + ordering are unambiguous.
 */
export function groupByTeam(
  entries: AvatarEntry[],
  teams: ReadonlyArray<{ id: string; name: string; color: string }>
): TeamGroup[] {
  const groups = new Map<string, TeamGroup>();
  const noTeam: AvatarEntry[] = [];

  for (const e of entries) {
    if (!e.teamId) {
      noTeam.push(e);
      continue;
    }
    let g = groups.get(e.teamId);
    if (!g) {
      const t = teams.find((x) => x.id === e.teamId);
      g = {
        teamId: e.teamId,
        teamName: t?.name ?? null,
        teamColor: t?.color ?? e.teamColor ?? null,
        members: [],
      };
      groups.set(e.teamId, g);
    }
    g.members.push(e);
  }

  // Emit in `teams` order, skipping teams with no members.
  const ordered: TeamGroup[] = [];
  for (const t of teams) {
    const g = groups.get(t.id);
    if (g) ordered.push(g);
  }
  // Pick up any team that wasn't in the `teams` list (defensive — e.g.
  // a participant referencing a team that's since been deleted).
  for (const [id, g] of groups) {
    if (!teams.some((t) => t.id === id)) ordered.push(g);
  }
  if (noTeam.length > 0) {
    ordered.push({ teamId: null, teamName: null, teamColor: null, members: noTeam });
  }
  return ordered;
}

export type TruncatedEntries = {
  visible: AvatarEntry[];
  hiddenCount: number;
};

/**
 * Cap the number of individual avatars rendered on a card. Returns
 * the first `MAX_AVATAR_INDIVIDUALS` entries plus the count of the
 * remainder for a "+N" indicator.
 */
export function truncateEntries(
  entries: AvatarEntry[],
  max = MAX_AVATAR_INDIVIDUALS
): TruncatedEntries {
  if (entries.length <= max) {
    return { visible: entries, hiddenCount: 0 };
  }
  return { visible: entries.slice(0, max), hiddenCount: entries.length - max };
}
