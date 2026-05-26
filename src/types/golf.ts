/**
 * Domain types for the Score tab.
 *
 * Trimmed port of the destination tee-time app's `types/golf.ts`. We
 * intentionally drop the optional fields tied to features that aren't
 * in scope for the source app's first scoring milestone:
 *
 *   - scramble teams + RoundParticipant.teamId/localDisplay* (stroke-
 *     only)
 *   - linked-friend metadata (`linkedUserId`, mentionedUserIds,
 *     caption, isLiveShareable, lastScoreAt) — no friend graph yet
 *   - Course catalog (we ship seeded local data)
 *
 * `Hole.yardages` is a sparse `Record<teeId, number>`. The destination
 * app derives a single `Hole.yardage` for the active tee at render
 * time; we keep that field too as a fallback for unparameterized
 * displays.
 */

export type ScoringRule = 'stroke';

export type HoleRange = 'all' | 'front9' | 'back9';

export type Tee = {
  id: string;
  name: string;
  /** CSS hex (e.g. "#4a90e2") OR a TeamAvatarCluster-known name (e.g. "Blue"). */
  color?: string;
  slope?: number;
  rating?: number;
  totalYardage?: number;
};

export type Hole = {
  number: number;
  par: number;
  /** Per-tee yardages keyed by `Tee.id`. */
  yardages?: Record<string, number>;
  /** Optional fallback for displays that don't filter by tee. */
  yardage?: number;
};

export type Course = {
  id: string;
  name: string;
  location: string;
  holes: Hole[];
  tees?: Tee[];
};

export type Player = {
  id: string;
  /** Local display name. */
  nickname: string;
  color?: string;
};

export type RoundScore = {
  scorerId: string;
  holeNumber: number;
  strokes: number;
};

/**
 * Per-player metadata on a round. Stroke-only — no teamId, no linked-
 * friend snapshots.
 */
export type RoundParticipant = {
  participantKey: string;
  teeId?: string;
};

export type Round = {
  id: string;
  course: Course;
  scoringRule: ScoringRule;
  playerIds: string[];
  holeRange: HoleRange;
  currentHoleNumber: number;
  scores: RoundScore[];
  startedAt: string;
  completedAt?: string;
  ownerUserId?: string;
  participants: RoundParticipant[];
};
