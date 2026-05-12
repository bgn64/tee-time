/**
 * Shared golf domain types.
 *
 * v7 model: a Round is one user's owned record of play (the artifact stored
 * server-side as a row in the `scorecards` table). The scorer is its sole
 * owner. Other named players are informational; they have no edit-rights,
 * no stats credit, no confirm/deny step, no blur. A future "import"
 * feature will let a named friend pull a scoreline onto their own Round.
 *
 * Two Rounds may be linked to the same real-world play via a shared
 * `roundId` string (the cross-scorecard identifier). Today no UX populates
 * this; it's reserved for tap-to-link or retroactive-link features later.
 *
 * Courses come from two sources (see `Course.source`):
 *   · 'opengolf' — global catalog ingested from OpenGolfAPI (ODbL).
 *   · 'custom'   — user-defined entries, private to the owning account.
 */

export type Player = {
  id: string;
  /**
   * Local-only label, user-editable. Always shown on this device. Required.
   * When a roster entry is linked to a real account, the nickname is *not*
   * overwritten — the user's chosen label sticks. Round data shipped to
   * other users uses `displayName` instead so they see the SSO-supplied
   * name rather than someone else's local nickname.
   */
  nickname: string;
  /**
   * Cloud-shared label populated from SSO at link time. Set when this Player
   * has been linked to a real user account; non-editable on this device.
   */
  displayName?: string;
  /** Account handle once linked. Cosmetic on Player; canonical handle lives in Account / directory. */
  handle?: string;
  color?: string;
  /** Set when this roster entry is linked to a real user account. */
  userId?: string;
};

/**
 * A tee box on a course. Populated for catalog courses via the lazy
 * `/v1/courses/:id/tees` enrichment. Custom courses leave `tees` empty
 * unless the user manually adds tee entries.
 */
export type Tee = {
  /** Stable tee id (per-course namespace). */
  id: string;
  /** Display name (e.g. "Blue", "Black", "Forward"). */
  name: string;
  /** CSS-style hex color used for tee marker icons. Optional. */
  color?: string;
  /** USGA slope rating. */
  slope?: number;
  /** USGA course rating. */
  rating?: number;
  /** Sum of yardages across all holes for this tee. */
  totalYardage?: number;
  /** USGA tee gender designation if applicable. */
  gender?: 'M' | 'F';
};

export type Hole = {
  number: number;
  par: number;
  /** Single-tee yardage (legacy single-tee model). */
  yardage?: number;
  /** USGA handicap index 1-18 (lower = harder). Optional. */
  handicapIndex?: number;
  /**
   * Per-tee yardages keyed by `Tee.id`. Populated by lazy enrichment for
   * catalog courses that have tee data published.
   */
  yardages?: Record<string, number>;
};

/**
 * Course source provenance.
 *   'opengolf' — global catalog, read-only.
 *   'custom'   — user-owned, full CRUD.
 */
export type CourseSource = 'opengolf' | 'custom';

export type Course = {
  id: string;
  name: string;
  /**
   * Display-ready location string, e.g. "Seattle, WA". For catalog rows
   * we compose this from `city` + `state`; for customs the user types it
   * directly.
   */
  location: string;
  holes: Hole[];
  source: CourseSource;

  // ---- Optional metadata (catalog populates; customs may or may not) ----
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  courseType?: string;
  totalPar?: number;
  totalYardage?: number;
  yearBuilt?: number;
  architect?: string;
  phone?: string;
  website?: string;
  tees?: Tee[];
  /** The OpenGolfAPI UUID for catalog rows. Stable across re-imports. */
  sourceExternalId?: string;
};

export type ScoringRule = 'stroke' | 'scramble';

export type RoundScore = {
  // In stroke rounds this is a player id; in scramble rounds it is a team id.
  scorerId: string;
  holeNumber: number;
  strokes: number;
};

export type Team = {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
};

/**
 * One entry per player named on a Round. Owned exclusively by the Round's
 * scorer; other named players cannot edit, confirm, or deny anything about
 * it. There is no participation status.
 *
 * Display name/color resolution:
 *   - Linked entries (`linkedUserId` set) render LIVE from the current
 *     profile (via `lib/participantIdentity.ts`). No snapshot fields are
 *     populated.
 *   - Local entries (no `linkedUserId`) have no profile to resolve
 *     against; their name and color are snapshotted at Round-creation
 *     time onto `localDisplayName` / `localDisplayColor`.
 */
export type RoundParticipant = {
  /**
   * Local Player.id on the scorer's device. Used as the `scorerId` key in
   * `RoundScore.scorerId` for stroke rounds.
   */
  participantKey: string;
  /** Set when the participant has been linked to a real account. */
  linkedUserId?: string;
  /** Set in scramble rounds; references `Round.teams[].id`. */
  teamId?: string;
  /** Snapshot, populated only when `linkedUserId` is absent. */
  localDisplayName?: string;
  /** Snapshot, populated only when `linkedUserId` is absent. */
  localDisplayColor?: string;
};

export type Round = {
  id: string;
  course: Course;
  scoringRule: ScoringRule;
  /**
   * Local Player.ids for every named participant. Kept as a redundant
   * client-side convenience; the canonical list is `participants[]`.
   */
  playerIds: string[];
  // Required when scoringRule === 'scramble'; absent in stroke rounds.
  teams?: Team[];
  currentHoleNumber: number;
  scores: RoundScore[];
  startedAt: string;
  completedAt?: string;
  /**
   * The user_id of the scorer. Immutable for the lifetime of the Round.
   * Account deletion cascades and drops the Round.
   */
  ownerUserId?: string;
  /**
   * One entry per scorer (stroke) or per team-roster-member (scramble).
   * Drives the participants strip, the with-you line on the feed card, and
   * the cross-device live-name resolver.
   */
  participants: RoundParticipant[];
  /**
   * Cross-Round real-world identifier. Two Rounds with the same `roundId`
   * represent independent scorecards of the same physical play. NULL by
   * default; reserved for future linking/import features.
   */
  roundId?: string;
  /**
   * User-ids of every linked participant on this Round. Informational
   * denormalization for the feed "with you" line and (future) "Rounds I'm
   * named in" discovery. NOT used for RLS — visibility is owner-or-friend-
   * of-owner only.
   */
  mentionedUserIds: string[];
};
