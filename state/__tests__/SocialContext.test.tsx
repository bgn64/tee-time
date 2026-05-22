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
  mockSupabaseEmitAuthEvent,
  mockSupabaseGetTable,
  mockSupabaseReset,
  mockSupabaseSeedRpc,
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
  mockSupabaseSetTableError,
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

// =============================================================================
// Phase 1.4 (refresh-only era) — `acceptIncomingRequest` is the sole
// roster-auto-create path now that the realtime `friendships` INSERT
// handler is gone. The deterministic id (`player-${userId}`) + DB
// partial-unique index (migration 018) still matter: a stale-id retry
// from the offline write queue must collapse onto the same row, not
// mint a duplicate. This test pins that contract for the surviving
// path.
// =============================================================================

describe('SocialContext — Phase 1.4 accept path creates exactly one roster row', () => {
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

  test('acceptIncomingRequest yields exactly one roster row keyed on the friend', async () => {
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

    await act(async () => {
      await result.current.social.acceptIncomingRequest('req-incoming-from-bob');
    });

    // Allow the fire-and-forget cloud upsert to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Cloud-side: the new `onConflict: owner_user_id,linked_user_id`
    // clause means a stale-id retry can't produce a second row.
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

  test('returns {ok:true} on success (refresh-shape contract)', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
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

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.social.refreshFriendsAndRequests();
    });

    expect(outcome).toEqual({ ok: true });
    // State unchanged from the successful pull.
    expect(result.current.social.friends).toEqual(['user-bob']);
  });

  test('returns {ok:false, error} when the friendships pull errors and leaves local state unchanged', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
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

    // Mid-refresh transient: token race, 5xx, network drop. Single-shot
    // error against `friendships` — subsequent selects succeed.
    mockSupabaseSetTableError('friendships', {
      message: 'token expired',
      code: '401',
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.social.refreshFriendsAndRequests();
    });

    expect(outcome?.ok).toBe(false);
    expect(outcome?.error).toBe('token expired');
    // Local state survives unchanged — bob is still in the friends list
    // (no blink-to-empty on transient failure).
    expect(result.current.social.friends).toEqual(['user-bob']);
    // Sync spinner is back down so the UI doesn't get stuck.
    expect(result.current.social.syncing).toBe(false);

    warnSpy.mockRestore();
  });

  test('returns {ok:false, error} when the friend_requests pull errors and leaves local state unchanged', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
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

    // Single-shot error on the OTHER half of the refresh's parallel
    // selects. The friendships half succeeds; the friend_requests
    // half errors. The refresh must still report ok:false and not
    // half-apply state.
    mockSupabaseSetTableError('friend_requests', {
      message: 'service unavailable',
      code: '503',
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.social.refreshFriendsAndRequests();
    });

    expect(outcome?.ok).toBe(false);
    expect(outcome?.error).toBe('service unavailable');
    expect(result.current.social.friends).toEqual(['user-bob']);
    expect(result.current.social.syncing).toBe(false);

    warnSpy.mockRestore();
  });
});

describe('SocialContext.refreshProfiles', () => {
  test('overwrites profileCache entries with fresh cloud data (picks up display-name / avatar edits)', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob' },
      { user_id: 'user-bob', friend_user_id: 'user-alice' },
    ]);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.social.profileCache['user-bob']?.displayName).toBe('Bob');
    });

    // Simulate Bob editing his profile from another device.
    mockSupabaseSeedTable('profiles', [
      aliceProfile,
      { ...bobProfile, display_name: 'Robert', avatar_color: '#000000' },
    ]);

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.social.refreshProfiles(['user-bob']);
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.social.profileCache['user-bob']?.displayName).toBe('Robert');
    expect(result.current.social.profileCache['user-bob']?.avatarColor).toBe('#000000');
  });

  test('returns {ok:true} as a no-op when signed out', async () => {
    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
    });
    expect(result.current.account.account).toBeNull();

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.social.refreshProfiles(['user-bob']);
    });

    expect(outcome).toEqual({ ok: true });
  });

  test('returns {ok:true} when called with an empty id list (skips the network round-trip)', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
    });

    const callsBefore = mockSupabaseCallLog().filter(
      (c: { kind: string; args: any[] }) =>
        c.kind === 'from.select' && c.args[0]?.table === 'profiles'
    ).length;

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.social.refreshProfiles([]);
    });

    expect(outcome).toEqual({ ok: true });
    // Empty input short-circuits before any select fires.
    const callsAfter = mockSupabaseCallLog().filter(
      (c: { kind: string; args: any[] }) =>
        c.kind === 'from.select' && c.args[0]?.table === 'profiles'
    ).length;
    expect(callsAfter).toBe(callsBefore);
  });

  test('returns {ok:false, error} on transient supabase error and leaves profileCache unchanged', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob' },
      { user_id: 'user-bob', friend_user_id: 'user-alice' },
    ]);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.hydrated).toBe(true);
      expect(result.current.social.profileCache['user-bob']?.displayName).toBe('Bob');
    });
    const cacheBefore = result.current.social.profileCache;

    mockSupabaseSetTableError('profiles', {
      message: 'service unavailable',
      code: '503',
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.social.refreshProfiles(['user-bob']);
    });

    expect(outcome?.ok).toBe(false);
    expect(outcome?.error).toBe('service unavailable');
    // Cache preserved on failure — no blink to "missing profile" state.
    expect(result.current.social.profileCache).toBe(cacheBefore);

    warnSpy.mockRestore();
  });
});

describe('SocialContext.ensureProfilesCached force option', () => {
  test('without force: short-circuits when ids are already cached', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob' },
      { user_id: 'user-bob', friend_user_id: 'user-alice' },
    ]);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.profileCache['user-bob']?.displayName).toBe('Bob');
    });

    // Edit Bob's profile on the server but DON'T pass force — cached
    // entry should remain stale.
    mockSupabaseSeedTable('profiles', [
      aliceProfile,
      { ...bobProfile, display_name: 'Robert' },
    ]);

    await act(async () => {
      await result.current.social.ensureProfilesCached(['user-bob']);
    });

    expect(result.current.social.profileCache['user-bob']?.displayName).toBe('Bob');
  });

  test('with {force:true}: re-pulls already-cached ids and overwrites the cache', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: 'user-alice', friend_user_id: 'user-bob' },
      { user_id: 'user-bob', friend_user_id: 'user-alice' },
    ]);

    const { result } = renderHookWithProviders(useSocialAndAccount);

    await waitFor(() => {
      expect(result.current.social.profileCache['user-bob']?.displayName).toBe('Bob');
    });

    mockSupabaseSeedTable('profiles', [
      aliceProfile,
      { ...bobProfile, display_name: 'Robert' },
    ]);

    await act(async () => {
      await result.current.social.ensureProfilesCached(['user-bob'], { force: true });
    });

    expect(result.current.social.profileCache['user-bob']?.displayName).toBe('Robert');
  });
});
