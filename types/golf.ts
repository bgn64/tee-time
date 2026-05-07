/**
 * Shared golf domain types used by the scoring prototype.
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

export type Hole = {
  number: number;
  par: number;
  yardage?: number;
};

export type CourseSource = 'catalog' | 'custom';

export type Course = {
  id: string;
  name: string;
  location: string;
  holes: Hole[];
  source: CourseSource;
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
 * Per-participant claim status on a Round.
 *
 *   pending     — claim queued; the participant hasn't acted yet.
 *   claimed     — the participant confirmed they were part of this round.
 *   not-claimed — declined, expired, or otherwise resolved as unclaimed.
 *
 * The mockup decision (`Section 5` of identity-flow-mockups.html) collapses
 * "rejected" and "never reviewed" into a single `not-claimed` surface so
 * neither side sees argument-prone wording like "Mike rejected your round."
 */
export type ClaimStatus = 'pending' | 'claimed' | 'not-claimed';

export type Round = {
  id: string;
  course: Course;
  scoringRule: ScoringRule;
  playerIds: string[];
  // Required when scoringRule === 'scramble'; absent in stroke rounds.
  teams?: Team[];
  currentHoleNumber: number;
  scores: RoundScore[];
  startedAt: string;
  completedAt?: string;
  /**
   * The roster Player.id of the user who scored this round. Today this is
   * always the local default player; once real social sync ships, friends'
   * rounds will appear in `completedRounds` too with their roster Player.id
   * here. The bulk-claim sheet uses this field to find rounds a new friend
   * scored that the local user participated in.
   *
   * Optional for backward compat: rounds completed before this field was
   * introduced are treated as owned by the local default player.
   */
  ownerId?: string;
  /**
   * Per-participant claim map. Keyed by participant playerId in both stroke
   * and scramble (a scramble claim is conceptually "yes, I was on this
   * team"). Only includes entries for participants who were linked friends
   * at the time the claim was created. Absent on rounds completed before
   * this field was introduced — treat as "no claims tracked."
   */
  claims?: Record<string, ClaimStatus>;
};
