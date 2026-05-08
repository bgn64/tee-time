/**
 * Social-domain types — friend requests, claim status, profile shape used
 * by handle search.
 */

import { ClaimStatus } from '@/types/golf';

export { ClaimStatus };

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
   * On *outgoing* requests, the local roster Player whose row was the
   * source of the "Connect to a friend" tap. The cloud RPC uses this to
   * link that Player to the new friend's userId on accept.
   */
  sourcePlayerId?: string;

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
