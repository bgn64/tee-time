/**
 * Social-domain types — friend requests, profile shape used by handle search.
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

  status: FriendRequestStatus;
  createdAt: string;
};

/**
 * A discovered profile from handle search. Mirrors the public `profiles`
 * row that's safe to show in search results.
 */
export type ProfileSummary = {
  userId: string;
  handle: string;
  displayName: string;
  avatarColor: string;
};
