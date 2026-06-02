import { column, Schema, Table } from '@powersync/common';

export const SCORECARDS_TABLE = 'scorecards';
export const SCORECARD_SCORES_TABLE = 'scorecard_scores';
export const SCORECARD_ACHIEVEMENT_TAGS_TABLE = 'scorecard_achievement_tags';
export const SCORECARD_TRACKED_STATS_TABLE = 'scorecard_tracked_stats';
export const PROFILES_TABLE = 'profiles';
export const FRIENDSHIPS_TABLE = 'friendships';
export const FRIEND_REQUESTS_TABLE = 'friend_requests';
export const CUSTOM_PLAYERS_TABLE = 'custom_players';
export const COMMENTS_TABLE = 'comments';
export const ROUND_LIKES_TABLE = 'round_likes';

// JSON-shaped columns (course_snapshot, participants, player_ids,
// teams) are declared as `column.text` here because PowerSync's local
// SQLite only supports TEXT/INTEGER/REAL. Serialization happens at the
// read/write boundary inside `RoundContext`; the upload connector also
// re-parses these columns before forwarding to Supabase (where they're
// jsonb).
const scorecards = new Table(
  {
    owner_user_id: column.text,
    course_id: column.text,
    course_snapshot: column.text,
    scoring_rule: column.text,
    player_ids: column.text,
    participants: column.text,
    teams: column.text,
    hole_range: column.text,
    started_at: column.text,
    completed_at: column.text,
    updated_at: column.text
  },
  { indexes: { owner: ['owner_user_id'] } }
);

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

// Off-app players the signed-in user plays rounds with (e.g. "Dad",
// "Mike"). Soft-deleted via `deleted_at` rather than removed — the
// sync stream replicates ALL rows including tombstoned ones so the
// scorecard participant resolver keeps rendering them in historic
// rounds. The picker filters `deleted_at IS NULL` locally.
const custom_players = new Table(
  {
    owner_user_id: column.text,
    nickname: column.text,
    avatar_color: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text
  },
  { indexes: { by_owner: ['owner_user_id'] } }
);

// Round comments — flat thread keyed to a scorecard. Anyone with
// scorecard visibility (owner or friend-of-owner) can read and
// write per the RLS policies in migration 007. Soft-deleted via
// `deleted_at`; the row stays in sync so other viewers don't see
// stale local copies, but the UI filters `deleted_at IS NOT NULL`.
const comments = new Table(
  {
    round_id: column.text,
    author_user_id: column.text,
    body: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text
  },
  { indexes: { by_round: ['round_id'] } }
);

// Round likes — at-most-one row per (round, liker). Hard-delete on
// toggle-off (no soft-delete; see migration 013's note). Sync streams
// scope by `owner_user_id` (denormalized on the row by the server-side
// trigger), so clients leave that column null on insert.
const round_likes = new Table(
  {
    round_id: column.text,
    liker_user_id: column.text,
    owner_user_id: column.text,
    created_at: column.text
  },
  {
    indexes: {
      by_round: ['round_id'],
      by_round_liker: ['round_id', 'liker_user_id']
    }
  }
);

// Per-(scorer, hole) achievement tags. `tags` is a JSON array of
// opaque string keys (the client owns the vocabulary in
// `src/library/golf/achievementTags.ts`). PowerSync local SQLite
// stores it as TEXT; the upload connector re-parses it into jsonb
// before posting to Supabase (see SupabaseConnector's
// JSON_COLUMNS_BY_TABLE map). `owner_user_id` is filled by the
// server-side trigger from the parent scorecards row.
const scorecard_achievement_tags = new Table(
  {
    scorecard_id: column.text,
    owner_user_id: column.text,
    scorer_id: column.text,
    hole_number: column.integer,
    tags: column.text,
    updated_at: column.text
  },
  {
    indexes: {
      by_scorecard: ['scorecard_id'],
      by_scorer_hole: ['scorecard_id', 'scorer_id', 'hole_number']
    }
  }
);

// Per-(scorer, round) tracked-stats overrides. Storage convention:
// row absent = use defaults; row with empty list = scorer turned
// every tag off; row with non-empty list = use as-is. `enabled_tags`
// is a JSON array of TagKey strings stored as TEXT locally; the
// upload connector re-parses to jsonb.
const scorecard_tracked_stats = new Table(
  {
    scorecard_id: column.text,
    owner_user_id: column.text,
    scorer_id: column.text,
    enabled_tags: column.text,
    updated_at: column.text
  },
  {
    indexes: {
      by_scorecard: ['scorecard_id'],
      by_scorer: ['scorecard_id', 'scorer_id']
    }
  }
);

export const AppSchema = new Schema({
  scorecards,
  scorecard_scores,
  profiles,
  friendships,
  friend_requests,
  custom_players,
  comments,
  round_likes,
  scorecard_achievement_tags,
  scorecard_tracked_stats
});

export type Database = (typeof AppSchema)['types'];
export type ScorecardRecord = Database['scorecards'];
export type ScorecardScoreRecord = Database['scorecard_scores'];
export type ProfileRecord = Database['profiles'];
export type FriendshipRecord = Database['friendships'];
export type FriendRequestRecord = Database['friend_requests'];
export type CustomPlayerRecord = Database['custom_players'];
export type CommentRecord = Database['comments'];
export type RoundLikeRecord = Database['round_likes'];
export type ScorecardAchievementTagRecord = Database['scorecard_achievement_tags'];
export type ScorecardTrackedStatsRecord = Database['scorecard_tracked_stats'];
