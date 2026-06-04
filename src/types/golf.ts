/**
 * Domain types for the Score tab.
 *
 * Trimmed port of the destination tee-time app's `types/golf.ts`. We
 * intentionally drop the optional fields tied to features that aren't
 * in scope for the source app's first scoring milestone:
 *
 *   - linked-friend metadata (`linkedUserId`, mentionedUserIds,
 *     caption, isLiveShareable) — no friend graph yet
 *   - Course catalog (we ship seeded local data)
 *
 * `Hole.yardages` is a sparse `Record<teeId, number>`. The destination
 * app derives a single `Hole.yardage` for the active tee at render
 * time; we keep that field too as a fallback for unparameterized
 * displays.
 */

export type ScoringRule = 'stroke' | 'scramble';

export type HoleRange = 'all' | 'front9' | 'back9';

export type Tee = {
  id: string;
  name: string;
  /** CSS hex (e.g. "#4a90e2") OR a TeamAvatarCluster-known name (e.g. "Blue"). */
  color?: string;
  /**
   * Canonical tee colour token name. When set, `teeColor.assignTeeColors`
   * uses this instead of hashing `id`. Useful for custom courses where
   * the editor explicitly assigns one of the canonical tee names
   * (Blue / White / Red / Gold) or one of the fallback palette slots.
   */
  colorToken?: string;
  slope?: number;
  rating?: number;
  totalYardage?: number;
  /**
   * Per-tee per-hole rows. When present, takes precedence over
   * `Course.holes[*].par` / `.handicapIndex` / `.yardages[id]` for
   * any hole in the array. Missing entries fall back to the
   * course-level `Hole` row's scalar values via `getHoleStats()`.
   *
   * Populated by:
   *   - `enrichCatalogCourse()` for opengolf courses → all rows
   *     share the same scalar `par`/`handicapIndex` (Branch B; the
   *     upstream API doesn't expose per-tee divergence today). The
   *     per-tee `yardage` comes from `holes[*].yardages[tee.name]`.
   *   - Custom course editor (future) → per-tee divergent values
   *     supported.
   *
   * When `holes` is empty / undefined the scorecard collapses every
   * tee into a single "PAR" + "HCP" row for the round and reads from
   * `Course.holes[*]` instead.
   */
  holes?: CourseTeeHole[];
};

/**
 * Per-tee per-hole row. The data shape that `course_tee_holes` (server)
 * and `Tee.holes` (client) both use.
 *
 * `handicapIndex` is the stroke-index value (1–18) — what golfers call
 * "handicap" on a scorecard. We name it `handicapIndex` here to mirror
 * the existing `Hole.handicapIndex` field and to avoid confusion with
 * a player's handicap rating.
 *
 * All three numeric fields are optional even though `par` is logically
 * required: a tee row may exist with par-only or yardage-only data,
 * and the render path falls back to the scalar `Hole` row for missing
 * pieces.
 */
export type CourseTeeHole = {
  holeNumber: number;
  par?: number;
  handicapIndex?: number;
  yardage?: number;
};

export type Hole = {
  number: number;
  par: number;
  /**
   * Per-hole stroke index when known. Captured by the OpenGolfAPI
   * enrichment path as a scalar (one value per hole, not per tee).
   * Per-tee divergence lives on `Tee.holes[].handicapIndex`.
   */
  handicapIndex?: number;
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

/**
 * A scramble team. `id` is stable across member shuffles and is what
 * scores are keyed by (`RoundScore.scorerId === team.id` in scramble
 * rounds). `name` + `color` are snapshots derived from members at
 * `startRound` time so old rounds keep displaying with the same
 * identity even if the underlying player names/colors change. The
 * snapshot is also what cold-load surfaces (feed, round detail, list
 * stats) read from — no need to re-derive on every render.
 */
export type Team = {
  id: string;
  name: string;
  color: string;
  /** participantKeys (user:* / custom:*) — NOT raw user ids. */
  playerIds: string[];
};

/**
 * `scorerId` is opaque text. In a stroke round it's the
 * participantKey of the player whose strokes are recorded. In a
 * scramble round it's the team id (one row per team per hole). The
 * scoring helpers don't care which kind it is — they just dedupe and
 * sum on the field — so most pure helpers (`playerProgress`,
 * `getRoundTotalRelative`, `replaceScore`) work unchanged across both
 * modes.
 */
export type RoundScore = {
  scorerId: string;
  holeNumber: number;
  strokes: number;
};

/**
 * Per-player metadata on a round. No linked-friend snapshots in this
 * milestone (just localDisplayName/Color for custom players, plus an
 * optional `teamId` for scramble rounds).
 *
 * `localDisplayName` / `localDisplayColor` are an optional snapshot
 * captured at `startRound` time. They're populated **only for
 * `custom:` participants** so that a friend viewing the round in
 * their feed (where the owner's `custom_players` rows do NOT sync)
 * still sees the owner's nickname for them ("Dad") instead of a
 * placeholder. `user:` participants don't need a snapshot — friend
 * `profiles` sync via `friend_profiles`, and non-friend app users
 * fall back to the resolver's online Supabase fetch.
 *
 * The resolver consults the snapshot only when the local
 * `custom_players` row can't be found. The owner's own renders
 * always read the live row, so a rename propagates to historic
 * scorecards on their device. Friends keep seeing the
 * point-in-time snapshot — acceptable trade-off given the alternative
 * is "Removed player" everywhere.
 */
export type RoundParticipant = {
  participantKey: string;
  teeId?: string;
  localDisplayName?: string;
  localDisplayColor?: string;
  /**
   * Set for scramble rounds only. Points at the `Team.id` this
   * participant is on. Lets components map a participant → their
   * team's scorerId without scanning `round.teams[].playerIds`.
   */
  teamId?: string;
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
  /** Canonical last live activity timestamp, currently backed by `scorecards.updated_at`. */
  lastScoreAt?: string;
  completedAt?: string;
  ownerUserId?: string;
  participants: RoundParticipant[];
  /**
   * Scramble teams. Always populated when `scoringRule === 'scramble'`;
   * empty array (or undefined) for stroke rounds. The team rows define
   * the score rows — each team's `id` is used as the scorers' opaque
   * `scorerId` for that round.
   */
  teams?: Team[];
  /**
   * Per-hole-details stat keys enabled for this round. Set at round
   * creation, immutable thereafter. Empty array = no stats tracked.
   * Same set applies to every scorer in `trackedScorerIds`.
   */
  enabledStatKeys: string[];
  /**
   * Scorer ids that have stats tracked for them. Empty array = no
   * tracking. For the common "track stats for myself only" case
   * this contains just the signed-in user's scorerId.
   */
  trackedScorerIds: string[];
};
