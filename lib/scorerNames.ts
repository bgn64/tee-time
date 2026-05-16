/**
 * Shared helpers for resolving a scorer's display name as a sequence of
 * tappable segments.
 *
 * The Final score box (in `ReadOnlyScorecard.FinalTotals`) and the live
 * scoring rows (in `ScoreEntryRow`) both want the same behaviour:
 *
 *   · Every participant rendered by their first name (no "You").
 *   · Participants linked to a real account become tappable so the
 *     viewer can drill into their profile.
 *   · Scramble teams join member names with " & " / ", " so each
 *     individual member stays independently linkable (rather than
 *     baking the whole team-name into a single dead string).
 *
 * `buildNameSegments` returns one segment per participant interleaved
 * with non-linkable separator segments. The caller renders each
 * `linked` segment as a `Pressable` (bold, colored) and each plain
 * segment as a default `Text`. Routing stays at the caller — this
 * module never imports `expo-router`.
 *
 * Linked-id resolution is two-tier so it covers both lifecycle stages:
 *
 *   1. `participant.linkedUserId` — set by `buildParticipants` at
 *      `completeCurrentRound` time. Authoritative when present.
 *   2. Roster fallback — `allPlayers.find(p => p.id === participantKey)`
 *      and `roster.userId`. Live-scoring participants are seeded only
 *      with `{ participantKey, teamId, teeId }`; without this fallback
 *      no one except the viewer's own row would render as linked
 *      during a live round.
 */

import { firstName } from '@/lib/userIdentity';
import { resolveParticipantIdentity } from '@/lib/participantIdentity';
import type { Account } from '@/types/account';
import type { Player, RoundParticipant } from '@/types/golf';
import type { ProfileSummary } from '@/types/social';

/**
 * One renderable chunk of a scorer's name line. Concatenating all
 * `text` values yields the plain display string; the `linked` flag
 * tells the caller which chunks become tap targets.
 */
export type NameSegment = {
  /** Text content of this segment (a single name, or a separator like " & "). */
  text: string;
  /** True when this segment is a tappable player name. Separators are never linked. */
  linked: boolean;
  /** Navigation target id. `defaultPlayerId` for self, `userId` for friends. Null on plain text. */
  linkTargetId: string | null;
  /** Per-player accent color used to style the linked segment. Undefined on separators. */
  color?: string;
};

export type NameDeps = {
  account: Account | null;
  profileCache: Record<string, ProfileSummary>;
  /** Local roster on the viewer's device. Used both for fallback identity and to resolve linkedUserId on in-flight rounds. */
  allPlayers: Player[];
  /** Viewer's own roster id. Self-tap routes here so the friend-detail screen shows the YOU badge. */
  defaultPlayerId: string | null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a single participant to a renderable `NameSegment`.
 *
 * Display name preference (all run through `firstName` so the segment
 * fits in narrow score-row layouts):
 *   self → `account.displayName`
 *   linked friend → `profileCache[userId].displayName`, else roster name, else "Friend"
 *   local player → `participant.localDisplayName` or roster name
 */
export function participantSegment(
  p: RoundParticipant,
  deps: NameDeps
): NameSegment {
  const roster = deps.allPlayers.find((q) => q.id === p.participantKey);

  // Two-tier linkedUserId resolution. Roster fallback is gated on a
  // uuid-looking value so we don't accidentally treat the legacy
  // seed-roster's "user" sentinel id as a routable account id.
  let linkedUserId: string | undefined = p.linkedUserId;
  if (!linkedUserId && roster?.userId && UUID_REGEX.test(roster.userId)) {
    linkedUserId = roster.userId;
  }

  const isMeByUser =
    !!deps.account?.userId && linkedUserId === deps.account.userId;
  const isMeByDefault =
    !!deps.defaultPlayerId && p.participantKey === deps.defaultPlayerId;
  const isMe = isMeByUser || (isMeByDefault && !p.linkedUserId);

  let displayRaw: string | undefined;
  let color: string | undefined;
  if (isMe && deps.account) {
    displayRaw = deps.account.displayName;
    color = deps.account.avatarColor ?? roster?.color;
  } else if (linkedUserId) {
    const profile = deps.profileCache[linkedUserId];
    if (profile) {
      displayRaw = profile.displayName;
      color = profile.avatarColor ?? roster?.color;
    } else if (roster) {
      displayRaw = roster.displayName ?? roster.nickname;
      color = roster.color;
    } else {
      // resolveParticipantIdentity falls back to "Friend" here so we
      // mirror that behaviour for consistency with existing tests.
      const identity = resolveParticipantIdentity(p, {
        account: deps.account,
        profileCache: deps.profileCache,
        allPlayers: deps.allPlayers,
      });
      displayRaw = identity.displayName;
      color = identity.color;
    }
  } else {
    // Local-only participant: no profile to resolve against. Prefer
    // the snapshotted display name captured at round-completion time.
    if (p.localDisplayName) {
      displayRaw = p.localDisplayName;
      color = p.localDisplayColor ?? roster?.color;
    } else if (roster) {
      displayRaw = roster.displayName ?? roster.nickname;
      color = roster.color;
    } else {
      displayRaw = 'Player';
    }
  }

  const text = firstName(displayRaw) || displayRaw || 'Player';

  // Self routes to defaultPlayerId so the friend-detail screen surfaces
  // its YOU badge. Friends route by linkedUserId. Unresolvable local
  // players are not tappable.
  let linkTargetId: string | null = null;
  if (isMe) {
    linkTargetId = deps.defaultPlayerId ?? linkedUserId ?? null;
  } else if (linkedUserId) {
    linkTargetId = linkedUserId;
  }

  return { text, linked: !!linkTargetId, linkTargetId, color };
}

/**
 * Plain non-linkable separator. Used between member names in a multi-
 * member scramble team segment list.
 */
function sep(text: string): NameSegment {
  return { text, linked: false, linkTargetId: null };
}

/**
 * Build the full segment list for a row in the Final box or the live-
 * scoring entry block.
 *
 *   1 participant   → [<name>]
 *   2 participants  → [<a>, " & ", <b>]
 *   3+ participants → [<a>, ", ", <b>, ", ", …, " & ", <last>]
 */
export function buildNameSegments(
  participants: RoundParticipant[],
  deps: NameDeps
): NameSegment[] {
  if (participants.length === 0) return [];
  const items = participants.map((p) => participantSegment(p, deps));
  if (items.length === 1) return items;
  if (items.length === 2) return [items[0], sep(' & '), items[1]];

  const result: NameSegment[] = [];
  items.forEach((seg, i) => {
    if (i === 0) {
      result.push(seg);
    } else if (i === items.length - 1) {
      result.push(sep(' & '), seg);
    } else {
      result.push(sep(', '), seg);
    }
  });
  return result;
}

/**
 * Concatenate every segment into its plain display string. Useful for
 * places that need an unstyled label (e.g. sheet titles, accessibility
 * labels, the CustomScoreSheet heading).
 */
export function flattenSegments(segments: ReadonlyArray<NameSegment>): string {
  return segments.map((s) => s.text).join('');
}
