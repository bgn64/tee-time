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
  /**
   * Recipient's display name and avatar color. Only populated on
   * outgoing requests (the viewer is the sender); incoming requests
   * leave these unset because the recipient is "me" — display info is
   * read from `account` instead.
   */
  toDisplayName?: string;
  toAvatarColor?: string;

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
