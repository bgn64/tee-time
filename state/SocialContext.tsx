/**
 * Social context — friends, friend requests, claim resolution.
 *
 * Phase 3 step 8 ships this layer as a local stub that fakes "the other side
 * of the conversation" with two timers and a dev-only injection helper.
 * Real Supabase wiring later will replace the timers with subscription-driven
 * state changes; the public surface (sendFriendRequest, acceptIncomingRequest,
 * etc.) stays the same.
 *
 * Side-channels:
 *   1. Auto-accept outgoing — when `autoAcceptOutgoing` is true, every newly
 *      pending outgoing request flips to `accepted` after AUTO_ACCEPT_DELAY_MS.
 *   2. Auto-claim pending — when `autoClaimPending` is true, every Round
 *      claim entry marked `pending` flips to `claimed` after
 *      AUTO_CLAIM_DELAY_MS.
 *
 * Both timers are gated on the toggle being true; flipping the toggle off
 * cancels in-flight timers immediately.
 */

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { STUB_FRIEND_DIRECTORY } from '@/data/friend-directory';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { usePlayers } from '@/state/PlayerContext';
import { Player, Round } from '@/types/golf';
import { FriendRequest, StubDirectoryEntry } from '@/types/social';

const AUTO_ACCEPT_DELAY_MS = 5000;
const AUTO_CLAIM_DELAY_MS = 8000;

type PersistedSocial = {
  friends: string[];
  outgoingRequests: FriendRequest[];
  incomingRequests: FriendRequest[];
};

const EMPTY_SOCIAL: PersistedSocial = {
  friends: [],
  outgoingRequests: [],
  incomingRequests: [],
};

type SocialContextValue = {
  friends: string[];
  outgoingRequests: FriendRequest[];
  incomingRequests: FriendRequest[];
  directory: StubDirectoryEntry[];

  /** Lowercase-prefix match against directory handles. Local-only. */
  searchHandle: (q: string) => StubDirectoryEntry[];

  /** Outgoing pending request between this device's account and `target`. */
  sendFriendRequest: (target: StubDirectoryEntry, sourcePlayerId?: string) => void;

  /**
   * Resolve an incoming friend request by accepting it. Links or creates a
   * roster Player for the new friend, adds the friend's userId to the
   * friends list, and returns the shared completed rounds so the caller can
   * surface a bulk-claim sheet.
   */
  acceptIncomingRequest: (requestId: string) => {
    newFriendUserId: string;
    matchedPlayerId: string;
    sharedRounds: Round[];
  } | null;

  declineIncomingRequest: (requestId: string) => void;

  /** Dev-only: inject an incoming request from a directory entry. */
  injectStubIncomingRequest: (directoryUserId: string) => void;

  autoAcceptOutgoing: boolean;
  setAutoAcceptOutgoing: (v: boolean) => void;
  autoClaimPending: boolean;
  setAutoClaimPending: (v: boolean) => void;

  hydrated: boolean;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function SocialProvider({ children }: PropsWithChildren) {
  const [friends, setFriends] = useState<string[]>(EMPTY_SOCIAL.friends);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>(
    EMPTY_SOCIAL.outgoingRequests
  );
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>(
    EMPTY_SOCIAL.incomingRequests
  );
  const [autoAcceptOutgoing, setAutoAcceptOutgoing] = useState(true);
  const [autoClaimPending, setAutoClaimPending] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const { account } = useAccount();
  const { allPlayers, addPlayer, linkPlayer, getPlayer } = usePlayers();
  const { completedRounds, setRoundClaim } = useGolfRound();

  // Hydrate all four social keys on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<PersistedSocial>(STORAGE_KEYS.SOCIAL, EMPTY_SOCIAL),
      loadJSON<boolean>(STORAGE_KEYS.AUTO_ACCEPT_OUTGOING, true),
      loadJSON<boolean>(STORAGE_KEYS.AUTO_CLAIM_PENDING, true),
    ]).then(([social, autoAccept, autoClaim]) => {
      if (cancelled) return;
      setFriends(social.friends);
      setOutgoingRequests(social.outgoingRequests);
      setIncomingRequests(social.incomingRequests);
      setAutoAcceptOutgoing(autoAccept);
      setAutoClaimPending(autoClaim);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the three social arrays as a single blob — they mutate together
  // often enough that splitting them would mostly mean three writes for
  // every accept-flow call.
  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.SOCIAL, {
      friends,
      outgoingRequests,
      incomingRequests,
    } satisfies PersistedSocial);
  }, [friends, outgoingRequests, incomingRequests, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.AUTO_ACCEPT_OUTGOING, autoAcceptOutgoing);
  }, [autoAcceptOutgoing, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.AUTO_CLAIM_PENDING, autoClaimPending);
  }, [autoClaimPending, hydrated]);

  const searchHandle = useCallback((q: string): StubDirectoryEntry[] => {
    const trimmed = q.trim().toLowerCase().replace(/^@/, '');
    if (!trimmed) return [];
    return STUB_FRIEND_DIRECTORY.filter((d) => d.handle.toLowerCase().startsWith(trimmed));
  }, []);

  const sendFriendRequest = useCallback(
    (target: StubDirectoryEntry, sourcePlayerId?: string) => {
      if (!account) {
        // Defensive: the UI should already gate this, but bail rather than
        // create an outgoing request with no `from` identity.
        return;
      }
      // Don't double-send to the same target.
      if (outgoingRequests.some((r) => r.toUserId === target.userId && r.status === 'pending')) {
        return;
      }
      const req: FriendRequest = {
        id: `req-out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fromUserId: account.userId,
        fromHandle: account.handle,
        fromDisplayName: account.displayName,
        fromAvatarColor: account.avatarColor,
        toUserId: target.userId,
        toHandle: target.handle,
        sourcePlayerId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      setOutgoingRequests((prev) => [...prev, req]);
    },
    [account, outgoingRequests]
  );

  /**
   * Resolve a single accepted outgoing request: link or create the roster
   * Player, add to friends list, mark the request accepted.
   */
  const consumeAcceptedOutgoing = useCallback(
    (req: FriendRequest) => {
      const directoryEntry = STUB_FRIEND_DIRECTORY.find((d) => d.userId === req.toUserId);
      const link = {
        userId: req.toUserId,
        displayName: directoryEntry?.displayName ?? req.toHandle,
        handle: req.toHandle,
      };

      if (req.sourcePlayerId) {
        // Source-rooted: link the existing roster row Ben tapped from.
        linkPlayer(req.sourcePlayerId, link);
      } else if (directoryEntry?.seedPlayerId && getPlayer(directoryEntry.seedPlayerId)) {
        // Sourceless but the directory entry maps onto a seed Player that's
        // currently unlinked: prefer linking it over creating a duplicate.
        const existing = getPlayer(directoryEntry.seedPlayerId);
        if (existing && !existing.userId) {
          linkPlayer(directoryEntry.seedPlayerId, link);
        }
      } else if (directoryEntry) {
        // Truly fresh: create a new Player.
        const newPlayer: Player = {
          id: `player-${directoryEntry.userId}-${Date.now()}`,
          nickname: directoryEntry.displayName,
          displayName: directoryEntry.displayName,
          handle: directoryEntry.handle,
          color: directoryEntry.avatarColor,
          userId: directoryEntry.userId,
        };
        addPlayer(newPlayer);
      }

      setFriends((prev) => (prev.includes(req.toUserId) ? prev : [...prev, req.toUserId]));
      setOutgoingRequests((prev) =>
        prev.map((r) => (r.id === req.id ? { ...r, status: 'accepted' as const } : r))
      );
    },
    [addPlayer, getPlayer, linkPlayer]
  );

  // Auto-accept outgoing — schedule a timer per pending request.
  const outgoingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    if (!hydrated) return;

    if (!autoAcceptOutgoing) {
      // Toggled off: clear any pending timers.
      outgoingTimers.current.forEach((t) => clearTimeout(t));
      outgoingTimers.current.clear();
      return;
    }

    for (const req of outgoingRequests) {
      if (req.status !== 'pending') continue;
      if (outgoingTimers.current.has(req.id)) continue;
      const timer = setTimeout(() => {
        outgoingTimers.current.delete(req.id);
        consumeAcceptedOutgoing(req);
      }, AUTO_ACCEPT_DELAY_MS);
      outgoingTimers.current.set(req.id, timer);
    }

    return () => {
      // On unmount only — not on every re-run — clean up any survivors.
      // Effect re-runs preserve the timers map so timers schedule once.
    };
  }, [autoAcceptOutgoing, outgoingRequests, hydrated, consumeAcceptedOutgoing]);

  // Final cleanup on unmount.
  useEffect(
    () => () => {
      outgoingTimers.current.forEach((t) => clearTimeout(t));
      outgoingTimers.current.clear();
    },
    []
  );

  const acceptIncomingRequest = useCallback(
    (requestId: string) => {
      const req = incomingRequests.find((r) => r.id === requestId);
      if (!req) return null;

      const directoryEntry = STUB_FRIEND_DIRECTORY.find((d) => d.userId === req.fromUserId);
      const link = {
        userId: req.fromUserId,
        displayName: req.fromDisplayName,
        handle: req.fromHandle,
      };

      // Decide which roster Player ends up linked.
      let matchedPlayerId: string;
      if (directoryEntry?.seedPlayerId) {
        const existing = getPlayer(directoryEntry.seedPlayerId);
        if (existing && !existing.userId) {
          linkPlayer(directoryEntry.seedPlayerId, link);
          matchedPlayerId = directoryEntry.seedPlayerId;
        } else {
          // Seed already taken (e.g. linked to someone else); fall through
          // to fresh-create.
          matchedPlayerId = `player-${req.fromUserId}-${Date.now()}`;
          addPlayer({
            id: matchedPlayerId,
            nickname: req.fromDisplayName,
            displayName: req.fromDisplayName,
            handle: req.fromHandle,
            color: req.fromAvatarColor,
            userId: req.fromUserId,
          });
        }
      } else {
        matchedPlayerId = `player-${req.fromUserId}-${Date.now()}`;
        addPlayer({
          id: matchedPlayerId,
          nickname: req.fromDisplayName,
          displayName: req.fromDisplayName,
          handle: req.fromHandle,
          color: req.fromAvatarColor,
          userId: req.fromUserId,
        });
      }

      setFriends((prev) => (prev.includes(req.fromUserId) ? prev : [...prev, req.fromUserId]));
      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));

      const sharedRounds = completedRounds.filter((r) => r.playerIds.includes(matchedPlayerId));

      return {
        newFriendUserId: req.fromUserId,
        matchedPlayerId,
        sharedRounds,
      };
    },
    [incomingRequests, getPlayer, linkPlayer, addPlayer, completedRounds]
  );

  const declineIncomingRequest = useCallback((requestId: string) => {
    setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
  }, []);

  const injectStubIncomingRequest = useCallback(
    (directoryUserId: string) => {
      const entry = STUB_FRIEND_DIRECTORY.find((d) => d.userId === directoryUserId);
      if (!entry) return;
      // Don't inject duplicates.
      if (incomingRequests.some((r) => r.fromUserId === entry.userId && r.status === 'pending')) {
        return;
      }
      const req: FriendRequest = {
        id: `req-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fromUserId: entry.userId,
        fromHandle: entry.handle,
        fromDisplayName: entry.displayName,
        fromAvatarColor: entry.avatarColor,
        toUserId: account?.userId ?? 'self',
        toHandle: account?.handle ?? 'self',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      setIncomingRequests((prev) => [...prev, req]);
    },
    [account, incomingRequests]
  );

  // Auto-claim pending — sweep claim entries on completed rounds.
  const claimTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    if (!hydrated) return;

    if (!autoClaimPending) {
      claimTimers.current.forEach((t) => clearTimeout(t));
      claimTimers.current.clear();
      return;
    }

    for (const round of completedRounds) {
      if (!round.claims) continue;
      for (const [participantId, status] of Object.entries(round.claims)) {
        if (status !== 'pending') continue;
        const key = `${round.id}:${participantId}`;
        if (claimTimers.current.has(key)) continue;
        const timer = setTimeout(() => {
          claimTimers.current.delete(key);
          setRoundClaim(round.id, participantId, 'claimed');
        }, AUTO_CLAIM_DELAY_MS);
        claimTimers.current.set(key, timer);
      }
    }
  }, [autoClaimPending, completedRounds, hydrated, setRoundClaim]);

  useEffect(
    () => () => {
      claimTimers.current.forEach((t) => clearTimeout(t));
      claimTimers.current.clear();
    },
    []
  );

  // Touch allPlayers in the deps of nothing here (silences a linter false
  // positive about unused destructure). It's pulled in for completeness;
  // future actions like player-merge will reference it.
  void allPlayers;

  const value = useMemo<SocialContextValue>(
    () => ({
      friends,
      outgoingRequests,
      incomingRequests,
      directory: STUB_FRIEND_DIRECTORY,
      searchHandle,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      injectStubIncomingRequest,
      autoAcceptOutgoing,
      setAutoAcceptOutgoing,
      autoClaimPending,
      setAutoClaimPending,
      hydrated,
    }),
    [
      friends,
      outgoingRequests,
      incomingRequests,
      searchHandle,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      injectStubIncomingRequest,
      autoAcceptOutgoing,
      autoClaimPending,
      hydrated,
    ]
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) {
    throw new Error('useSocial must be used inside SocialProvider.');
  }
  return context;
}
