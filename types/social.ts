/**
 * Social-domain types — friend requests, claim status, stub directory entries.
 * Kept separate from `types/golf.ts` so the round-scoring domain stays
 * unaware of social concepts (friends, requests, accounts).
 */

import { ClaimStatus } from '@/types/golf';

export { ClaimStatus };

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export type FriendRequest = {
  id: string;
  /** Sender's userId (account.userId on Ben's side; directoryEntry.userId on Mike's side). */
  fromUserId: string;
  fromHandle: string;
  fromDisplayName: string;
  fromAvatarColor: string;

  /** Recipient's userId. */
  toUserId: string;
  toHandle: string;

  /**
   * On *outgoing* requests, the local roster Player whose row was the source
   * of the "Connect to a friend" tap. Set so the auto-accept path can link
   * that Player to the new friend's userId. Undefined for source-less flows
   * (Friends segment "+ Find friends" entry point) — those auto-create a
   * fresh roster Player on accept.
   */
  sourcePlayerId?: string;

  status: FriendRequestStatus;
  createdAt: string;
};

/**
 * A stub friend-directory entry — the fake-backend's representation of
 * "people on the platform you could befriend." When real Supabase lands,
 * this exact shape is returned by the handle-search RPC.
 */
export type StubDirectoryEntry = {
  userId: string;
  handle: string;
  displayName: string;
  avatarColor: string;
  joinedAt: string;
  /**
   * If set, this directory entry corresponds to one of the existing seed
   * Players in `data/players.ts`. The friend-request flow uses this to
   * auto-link the seed Player when the user befriends the corresponding
   * directory entry from a source-rooted search (i.e., the request was
   * launched from Mike's roster row, so on accept Mike's Player gets
   * linked rather than a duplicate created).
   */
  seedPlayerId?: string;
};
