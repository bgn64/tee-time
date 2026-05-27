/**
 * Social-domain types — profiles + friend requests + the pill status enum.
 *
 * Ported (with trims) from the destination tee-time app's
 * `types/social.ts`. The `FriendStatus` union is new in this app: the
 * profile pill switches on it, and `FriendsContext.friendStatus(userId)`
 * is the pure derivation that picks one value given the local friend
 * graph state. Priority order (when multiple apply, e.g. ex-friends with a
 * stale pending FR) is documented on `FriendsContext.friendStatus`:
 *
 *     self > friend > incoming-pending > outgoing-pending > stranger
 */

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export type FriendRequest = {
  id: string;

  /** Sender's userId. */
  fromUserId: string;
  fromHandle: string;
  fromDisplayName: string;
  fromAvatarColor: string;

  /** Recipient's userId. */
  toUserId: string;
  toHandle: string;
  /**
   * Recipient's display name and avatar color. Only populated on
   * outgoing requests (the viewer is the sender). Incoming requests
   * leave these unset because the recipient is "me" — display info is
   * read from the `account` instead.
   */
  toDisplayName?: string;
  toAvatarColor?: string;

  status: FriendRequestStatus;
  createdAt: string;
};

/**
 * A discovered profile from handle search. Mirrors the public `profiles`
 * row that's safe to show in search results and on the profile screen.
 */
export type ProfileSummary = {
  userId: string;
  handle: string;
  displayName: string;
  avatarColor: string;
};

/**
 * Pill state for `<FriendActionPill>`. `friendStatus(userId)` returns
 * one of these.
 */
export type FriendStatus =
  | 'self'
  | 'friend'
  | 'incoming-pending'
  | 'outgoing-pending'
  | 'stranger';
