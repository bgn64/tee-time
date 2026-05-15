/**
 * SocialContext — regression coverage for the navigator-unmount bug
 * (refactor plan Phase 1.1).
 *
 * The provider used to key its initial-pull and realtime-subscribe
 * effects off the whole `account` object. Any reference change
 * (TOKEN_REFRESHED, avatar-color edit, display-name update) re-ran the
 * pull and flipped `hydrated` back to `false`, which unmounted the
 * splash gate and reset navigation. These tests pin the new contract:
 *
 *   · `hydrated` is a one-way latch.
 *   · Initial pull + channel subscribe run exactly once per
 *     `accountUserId` — cosmetic account changes don't re-fire either.
 *   · Realtime handler builds outgoing-request rows from the CURRENT
 *     self profile (handle / displayName / avatarColor), not a closure
 *     captured at subscribe time.
 *   · Sign-out clears state but keeps the latch up.
 *   · Sign-in re-pulls with the new user's data.
 */

jest.mock('@/state/supabaseClient');

import { act, waitFor } from '@testing-library/react-native';

import { useAccount } from '@/state/AccountContext';
import { useSocial } from '@/state/SocialContext';

import {
  mockSupabaseCallLog,
  mockSupabaseChannelSubscribeCount,
  mockSupabaseEmitAuthEvent,
  mockSupabaseEmitChannel,
  mockSupabaseGetTable,
  mockSupabaseReset,
  mockSupabaseSeedRpc,
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
  renderHookWithProviders,
} from './test-utils';

// =============================================================================
// Fixtures
// =============================================================================

const aliceSession = {
  user: { id: 'user-alice', email: 'alice@example.com', user_metadata: {} },
};

const bobSession = {
  user: { id: 'user-bob', email: 'bob@example.com', user_metadata: {} },
};

const aliceProfile = {
  user_id: 'user-alice',
  handle: 'alice',
  display_name: 'Alice',
  avatar_color: '#aaaaaa',
  created_at: '2025-01-01T00:00:00Z',
};

const bobProfile = {
  user_id: 'user-bob',
  handle: 'bob',
  display_name: 'Bob',
  avatar_color: '#bbbbbb',
  created_at: '2025-01-01T00:00:00Z',
};

const carolProfile = {
  user_id: 'user-carol',
  handle: 'carol',
  display_name: 'Carol',
  avatar_color: '#cccccc',
  created_at: '2025-01-01T00:00:00Z',
};

// Renders both useSocial and useAccount in the same hook so tests can
// inspect / drive both surfaces from a single `result.current`.
function useSocialAndAccount() {
  return {
    social: useSocial(),
    account: useAccount(),
  };
}

function countFriendshipsSelects(): number {
  return mockSupabaseCallLog().filter(
    (c: { kind: string; args: any[] }) =>
      c.kind === 'from.select' && c.args[0]?.table === 'friendships'
  ).length;
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  mockSupabaseReset();
});

describe('SocialContext — hydrated latches', () => {
  test('hydrated stays true through a cosmetic account change (TOKEN_REFRESHED)', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.account.account?.handle).toBe('alice');
    });

    // Simulate a cosmetic profile edit + token refresh: bump the avatar
    // color in the profiles mock so refreshFromSession() picks up a new
    // value, then emit TOKEN_REFRESHED with the same userId.
    mockSupabaseSeedTable('profiles', [
      { ...aliceProfile, avatar_color: '#ff00ff' },
    ]);

    await act(async () => {
      mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', aliceSession);
    });

    await waitFor(() => {
      expect(result.current.account.account?.avatarColor).toBe('#ff00ff');
    });

    expect(result.current.social.hydrated).toBe(true);
  });

  test('initial pull runs exactly once per accountUserId across cosmetic changes', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.handle).toBe('alice');
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.social.syncing).toBe(false);
    });

    expect(countFriendshipsSelects()).toBe(1);

    // Cosmetic change — TOKEN_REFRESHED with same userId, mutated profile.
    mockSupabaseSeedTable('profiles', [
      { ...aliceProfile, display_name: 'Alice Updated' },
    ]);

    await act(async () => {
      mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', aliceSession);
    });

    await waitFor(() => {
      expect(result.current.account.account?.displayName).toBe('Alice Updated');
    });

    expect(countFriendshipsSelects()).toBe(1);
  });

  test('channel subscribed exactly once per accountUserId across cosmetic changes', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.handle).toBe('alice');
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.social.syncing).toBe(false);
    });

    expect(mockSupabaseChannelSubscribeCount('friends-and-requests')).toBe(1);

    mockSupabaseSeedTable('profiles', [
      { ...aliceProfile, avatar_color: '#deadbe' },
    ]);

    await act(async () => {
      mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', aliceSession);
    });

    await waitFor(() => {
      expect(result.current.account.account?.avatarColor).toBe('#deadbe');
    });

    expect(mockSupabaseChannelSubscribeCount('friends-and-requests')).toBe(1);
  });
});

describe('SocialContext — realtime handler uses current account fields', () => {
  test('outgoing friend_requests INSERT picks up latest self handle / displayName / avatarColor', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.account.account?.handle).toBe('alice');
    });

    // Simulate the avatar-color picker + display-name editor on the You
    // tab: bump both fields in the profiles mock and emit TOKEN_REFRESHED.
    // The new SocialContext must read these latest values via accountRef
    // when constructing realtime-generated outgoing rows.
    mockSupabaseSeedTable('profiles', [
      {
        ...aliceProfile,
        display_name: 'Alice The Great',
        avatar_color: '#feedf0',
      },
      bobProfile,
    ]);

    await act(async () => {
      mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', aliceSession);
    });

    await waitFor(() => {
      expect(result.current.account.account?.displayName).toBe('Alice The Great');
      expect(result.current.account.account?.avatarColor).toBe('#feedf0');
    });

    // Now fire a realtime INSERT representing Alice's sendFriendRequest
    // to Bob arriving back over the wire.
    await act(async () => {
      mockSupabaseEmitChannel(
        'friends-and-requests',
        'friend_requests',
        'INSERT',
        {
          new: {
            id: 'req-1',
            from_user_id: 'user-alice',
            to_user_id: 'user-bob',
            status: 'pending',
            source_player_id: null,
            created_at: '2025-02-01T00:00:00Z',
          },
        }
      );
    });

    await waitFor(() => {
      expect(result.current.social.outgoingRequests).toHaveLength(1);
    });

    const out = result.current.social.outgoingRequests[0];
    expect(out.fromUserId).toBe('user-alice');
    expect(out.fromHandle).toBe('alice');
    expect(out.fromDisplayName).toBe('Alice The Great');
    expect(out.fromAvatarColor).toBe('#feedf0');
    expect(out.toUserId).toBe('user-bob');
    expect(out.toHandle).toBe('bob');
  });
});

describe('SocialContext — sign-out / sign-in cycle', () => {
  test('sign-out clears state but keeps hydrated latched', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob', created_at: '2025-01-02T00:00:00Z' },
      { user_id: 'user-bob', friend_user_id: 'user-alice', created_at: '2025-01-02T00:00:00Z' },
    ]);
    mockSupabaseSeedTable('friend_requests', [
      {
        id: 'req-in',
        from_user_id: 'user-bob',
        to_user_id: 'user-alice',
        status: 'pending',
        source_player_id: null,
        created_at: '2025-01-03T00:00:00Z',
      },
    ]);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.social.friends).toEqual(['user-bob']);
      expect(result.current.social.incomingRequests).toHaveLength(1);
    });

    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(result.current.account.account).toBeNull();
    });

    expect(result.current.social.hydrated).toBe(true);
    expect(result.current.social.friends).toEqual([]);
    expect(result.current.social.incomingRequests).toEqual([]);
    expect(result.current.social.outgoingRequests).toEqual([]);
    expect(result.current.social.syncing).toBe(false);
  });

  test('sign-in re-pulls with the new user’s friendships', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile, carolProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob', created_at: '2025-01-02T00:00:00Z' },
      { user_id: 'user-bob', friend_user_id: 'user-alice', created_at: '2025-01-02T00:00:00Z' },
    ]);
    mockSupabaseSeedTable('friend_requests', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.social.friends).toEqual(['user-bob']);
    });

    // Sign out.
    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
    });

    await waitFor(() => expect(result.current.social.friends).toEqual([]));

    // Reset friendships to bob's view (bob is friends with carol now).
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-bob', friend_user_id: 'user-carol', created_at: '2025-01-05T00:00:00Z' },
      { user_id: 'user-carol', friend_user_id: 'user-bob', created_at: '2025-01-05T00:00:00Z' },
    ]);

    // Sign in as bob.
    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_IN', bobSession);
    });

    await waitFor(() => {
      expect(result.current.account.account?.handle).toBe('bob');
      expect(result.current.social.friends).toEqual(['user-carol']);
    });

    expect(result.current.social.hydrated).toBe(true);
  });
});

describe('SocialContext — accept path consumes seeded RPC + ref-backed allPlayers/addPlayer', () => {
  // Smoke test that the refactor didn't break the accept flow, which
  // exercises the live `allPlayers` / `addPlayer` closure (still
  // available on the callback) AND happens to mutate roster state in
  // ways the prior implementation re-subscribed on.
  test('accepting a request from realtime-delivered friendship INSERT does not resubscribe channel', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', []);
    mockSupabaseSeedRpc('accept_friend_request', { data: null, error: null });

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => expect(result.current.social.hydrated).toBe(true));

    await waitFor(() => {
      expect(result.current.account.account?.handle).toBe('alice');
      expect(result.current.social.syncing).toBe(false);
    });

    expect(mockSupabaseChannelSubscribeCount('friends-and-requests')).toBe(1);

    // Sender-side friendship INSERT (the realtime path that auto-creates
    // a roster row). Prior implementation re-subscribed on every roster
    // mutation; new implementation must keep the channel stable.
    await act(async () => {
      mockSupabaseEmitChannel(
        'friends-and-requests',
        'friendships',
        'INSERT',
        {
          new: {
            user_id: 'user-alice',
            friend_user_id: 'user-bob',
            created_at: '2025-02-01T00:00:00Z',
          },
        }
      );
    });

    await waitFor(() => {
      expect(result.current.social.friends).toContain('user-bob');
    });

    expect(mockSupabaseChannelSubscribeCount('friends-and-requests')).toBe(1);
  });
});

// =============================================================================
// Phase 1.4 — race between `acceptIncomingRequest` and the realtime
// `friendships` INSERT handler. Both paths call `ensureRosterForFriend`;
// the deterministic id (`player-${userId}`) collapses any race to a
// single roster row, both client-side and cloud-side. This pins the
// fix for the duplicate-roster bug.
// =============================================================================

describe('SocialContext — Phase 1.4 race between accept + realtime', () => {
  const aliceUserUuid = '11111111-1111-4111-8111-111111111111';
  const bobUserUuid = '22222222-2222-4222-8222-222222222222';

  const aliceUuidSession = {
    user: { id: aliceUserUuid, email: 'alice@example.com', user_metadata: {} },
  };
  const aliceUuidProfile = {
    user_id: aliceUserUuid,
    handle: 'alice',
    display_name: 'Alice',
    avatar_color: '#aaaaaa',
    created_at: '2025-01-01T00:00:00Z',
  };
  const bobUuidProfile = {
    user_id: bobUserUuid,
    handle: 'bob',
    display_name: 'Bob',
    avatar_color: '#bbbbbb',
    created_at: '2025-01-01T00:00:00Z',
  };

  test('concurrent accept + realtime friendship INSERT yields exactly one roster row', async () => {
    mockSupabaseSeedSession(aliceUuidSession);
    mockSupabaseSeedTable('profiles', [aliceUuidProfile, bobUuidProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', [
      {
        id: 'req-incoming-from-bob',
        from_user_id: bobUserUuid,
        to_user_id: aliceUserUuid,
        status: 'pending',
        source_player_id: null,
        created_at: '2025-02-01T00:00:00Z',
      },
    ]);
    mockSupabaseSeedRpc('accept_friend_request', { data: null, error: null });
    mockSupabaseSeedTable('roster_players', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.account.account?.userId).toBe(aliceUserUuid);
      expect(result.current.social.incomingRequests).toHaveLength(1);
    });

    // Fire both paths essentially simultaneously inside the same act.
    // `acceptIncomingRequest` is the receiver-side inline call.
    // `mockSupabaseEmitChannel` simulates the realtime `friendships`
    // INSERT that arrives on the sender side and would otherwise mint
    // a second `player-${userId}-${Date.now()}` row in the buggy world.
    await act(async () => {
      const p = result.current.social.acceptIncomingRequest('req-incoming-from-bob');
      mockSupabaseEmitChannel(
        'friends-and-requests',
        'friendships',
        'INSERT',
        {
          new: {
            user_id: aliceUserUuid,
            friend_user_id: bobUserUuid,
            created_at: '2025-02-01T00:00:00Z',
          },
        }
      );
      await p;
    });

    await waitFor(() => {
      expect(result.current.social.friends).toContain(bobUserUuid);
    });

    // Allow the fire-and-forget cloud upsert from both paths to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Cloud-side: with the new `onConflict: owner_user_id,linked_user_id`
    // clause, both upserts collapse onto one row keyed on the friend.
    const cloudBobRows = mockSupabaseGetTable('roster_players').filter(
      (r: { linked_user_id?: string | null }) => r.linked_user_id === bobUserUuid
    );
    expect(cloudBobRows).toHaveLength(1);
    expect(cloudBobRows[0].id).toBe(`player-${bobUserUuid}`);
    expect(cloudBobRows[0].owner_user_id).toBe(aliceUserUuid);
  });
});

// =============================================================================
// Phase 2.3 — explicit `refreshFriendsAndRequests` re-runs the cloud
// pull. Used by the Feed's pull-to-refresh as the missed-realtime-event
// recovery path.
// =============================================================================

describe('SocialContext.refreshFriendsAndRequests', () => {
  test('re-pulls friendships and friend_requests on demand', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile, carolProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob', created_at: '2025-01-02T00:00:00Z' },
      { user_id: 'user-bob', friend_user_id: 'user-alice', created_at: '2025-01-02T00:00:00Z' },
    ]);
    mockSupabaseSeedTable('friend_requests', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.social.friends).toEqual(['user-bob']);
      expect(result.current.social.incomingRequests).toEqual([]);
    });

    // Simulate server-side state that landed AFTER the initial sync —
    // carol befriended alice, and dave sent a friend request — and
    // realtime didn't deliver either event (offline, dropped frame).
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob', created_at: '2025-01-02T00:00:00Z' },
      { user_id: 'user-bob', friend_user_id: 'user-alice', created_at: '2025-01-02T00:00:00Z' },
      { user_id: 'user-alice', friend_user_id: 'user-carol', created_at: '2025-02-01T00:00:00Z' },
      { user_id: 'user-carol', friend_user_id: 'user-alice', created_at: '2025-02-01T00:00:00Z' },
    ]);
    mockSupabaseSeedTable('friend_requests', [
      {
        id: 'req-from-bob',
        from_user_id: 'user-bob',
        to_user_id: 'user-alice',
        status: 'pending',
        source_player_id: null,
        created_at: '2025-02-02T00:00:00Z',
      },
    ]);

    await act(async () => {
      await result.current.social.refreshFriendsAndRequests();
    });

    expect(result.current.social.friends.sort()).toEqual(['user-bob', 'user-carol']);
    expect(result.current.social.incomingRequests).toHaveLength(1);
    expect(result.current.social.incomingRequests[0].fromUserId).toBe('user-bob');
    // Latch isn't lowered by a refresh — splash gate stays open.
    expect(result.current.social.hydrated).toBe(true);
  });

  test('refresh response treats friendships as authoritative — drops rows the server no longer reports', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob', created_at: '2025-01-02T00:00:00Z' },
      { user_id: 'user-bob', friend_user_id: 'user-alice', created_at: '2025-01-02T00:00:00Z' },
    ]);
    mockSupabaseSeedTable('friend_requests', []);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.friends).toEqual(['user-bob']);
    });

    // Friend was unfriended server-side; realtime DELETE never arrived.
    mockSupabaseSeedTable('friendships', []);

    await act(async () => {
      await result.current.social.refreshFriendsAndRequests();
    });

    // Refresh response is authoritative — bob is gone. Comment in
    // SocialContext documents this as the deliberate trade-off vs.
    // a per-row merge (which would need to know how to translate a
    // missing row into a DELETE, which can't be done safely without
    // a server-snapshot timestamp).
    expect(result.current.social.friends).toEqual([]);
  });
});
