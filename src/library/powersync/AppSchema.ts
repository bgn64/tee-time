import { column, Schema, Table } from '@powersync/common';

export const LISTS_TABLE = 'lists';
export const TODOS_TABLE = 'todos';
export const SCORECARDS_TABLE = 'scorecards';
export const SCORECARD_SCORES_TABLE = 'scorecard_scores';
export const PROFILES_TABLE = 'profiles';
export const FRIENDSHIPS_TABLE = 'friendships';
export const FRIEND_REQUESTS_TABLE = 'friend_requests';

const todos = new Table(
  {
    list_id: column.text,
    created_at: column.text,
    completed_at: column.text,
    description: column.text,
    created_by: column.text,
    completed_by: column.text,
    completed: column.integer
  },
  { indexes: { list: ['list_id'] } }
);

const lists = new Table({
  created_at: column.text,
  name: column.text,
  owner_id: column.text
});

// JSON-shaped columns (course_snapshot, participants, player_ids) are
// declared as `column.text` here because PowerSync's local SQLite only
// supports TEXT/INTEGER/REAL. Serialization happens at the read/write
// boundary inside `RoundContext`; the upload connector also re-parses
// these columns before forwarding to Supabase (where they're jsonb).
const scorecards = new Table({
  owner_user_id: column.text,
  course_id: column.text,
  course_snapshot: column.text,
  scoring_rule: column.text,
  player_ids: column.text,
  participants: column.text,
  hole_range: column.text,
  started_at: column.text,
  completed_at: column.text,
  updated_at: column.text
});

// Per-cell score rows. owner_user_id is denormalized for sync-rule
// scoping; the server-side trigger copies it from the parent scorecard
// row on insert, so clients leave it null.
const scorecard_scores = new Table(
  {
    scorecard_id: column.text,
    scorer_id: column.text,
    hole_number: column.integer,
    strokes: column.integer,
    owner_user_id: column.text,
    updated_at: column.text
  },
  { indexes: { by_scorecard: ['scorecard_id'] } }
);

// Public profile rows. The server-side PK is `user_id`, but PowerSync
// requires a single-column `id`, so the sync streams alias
// `user_id AS id`. Locally we read profiles by `id` (== the user id).
const profiles = new Table(
  {
    handle: column.text,
    display_name: column.text,
    avatar_color: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { by_handle: ['handle'] } }
);

// Half-edges for the signed-in user: one row per (me, friend) pair.
// The reciprocal (friend, me) row syncs to the friend's device via
// their own subscription. Index by friend_user_id for joins back to
// the profile row.
const friendships = new Table(
  {
    user_id: column.text,
    friend_user_id: column.text,
    created_at: column.text
  },
  { indexes: { by_friend: ['friend_user_id'] } }
);

// Pending friend requests in either direction (filtered server-side
// by the `status = 'pending'` clause in the sync rule, so accepted /
// declined / expired rows never reach the client).
const friend_requests = new Table(
  {
    from_user_id: column.text,
    to_user_id: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { by_to: ['to_user_id'], by_from: ['from_user_id'] } }
);

export const AppSchema = new Schema({
  todos,
  lists,
  scorecards,
  scorecard_scores,
  profiles,
  friendships,
  friend_requests
});

export type Database = (typeof AppSchema)['types'];
export type TodoRecord = Database['todos'];
export type ListRecord = Database['lists'];
export type ScorecardRecord = Database['scorecards'];
export type ScorecardScoreRecord = Database['scorecard_scores'];
export type ProfileRecord = Database['profiles'];
export type FriendshipRecord = Database['friendships'];
export type FriendRequestRecord = Database['friend_requests'];
