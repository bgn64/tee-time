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
 * Per-participant confirmation status on a Round.
 *
 *   pending    — friend hasn't acted yet on the scorer's claim that they
 *                played this round. Pre-confirmation the scorer retains full
 *                edit-rights over the friend's score; the friend's scoreline
 *                is rendered blurred to other observers.
 *   confirmed  — friend confirmed (or is the scorer themselves, or is an
 *                unlinked player whose authority remains with the scorer).
 *
 * Hard-deleted on deny / leave; there is no separate "denied" status.
 */
export type ConfirmationStatus = 'pending' | 'confirmed';

/**
 * One row per (round, scorer). For stroke rounds participants map 1:1 with
 * players; for scramble there's still one row per player but `teamId` ties
 * them to the team whose scoreline they share.
 */
export type RoundParticipant = {
  /**
   * Local Player.id, preserved verbatim across user accounts. It's the key
   * used in `Round.scores[].scorerId` for stroke rounds.
   */
  participantKey: string;
  /** Set when the participant has been linked to a real account. */
  linkedUserId?: string;
  status: ConfirmationStatus;
  /** Snapshot of the nickname captured at participant-row creation. */
  displayName: string;
  displayColor?: string;
  /** Set in scramble rounds; references `Round.teams[].id`. */
  teamId?: string;
};

export type Round = {
  id: string;
  course: Course;
  scoringRule: ScoringRule;
  /**
   * Local Player.ids for the round's participants. Preserved for backward
   * compatibility with code paths that key off it; the canonical participant
   * list under the v6 redesign is `participants[]`.
   */
  playerIds: string[];
  // Required when scoringRule === 'scramble'; absent in stroke rounds.
  teams?: Team[];
  currentHoleNumber: number;
  scores: RoundScore[];
  startedAt: string;
  completedAt?: string;
  /**
   * The user_id of the original scorer. Mutable: transfers to a confirmed
   * linked participant when the original owner leaves the round.
   */
  ownerUserId?: string;
  /**
   * Local Player.id of the scorer. Convenience pointer for code that wants
   * to look up the scorer's roster row without joining via ownerUserId.
   * Optional for in-flight rounds and for cloud-sourced rounds where the
   * scorer is a friend whose roster row we don't have.
   */
  ownerId?: string;
  /**
   * One entry per scorer (stroke) or per team-roster-member (scramble).
   * Drives confirmation banners, blur rendering, and edit-rights logic.
   * Absent on rounds completed before the v6 redesign.
   */
  participants?: RoundParticipant[];
};
