/**
 * Tests for `AccountContext.refreshFromSession`'s shallow-equality
 * short-circuit (Phase 2.1).
 *
 * Regression coverage: `onAuthStateChange` fires `TOKEN_REFRESHED`
 * roughly hourly. Before this fix every fire constructed a fresh
 * `Account` object and replaced the `account` state reference, which
 * cascaded through every consumer keyed on `account` (SocialContext
 * re-pulls, splash gate, etc.). The fix is a module-level shallow-equal
 * check + functional setter so identical payloads preserve the prior
 * reference.
 */

jest.mock('@/state/supabaseClient');

import { act, waitFor } from '@testing-library/react-native';

import { useAccount } from '@/state/AccountContext';

import {
  mockSupabaseReset,
  mockSupabaseEmitAuthEvent,
  mockSupabaseSeedTable,
  renderHookWithProviders,
} from './test-utils';

type ProfileRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
  created_at: string;
};

const SEED_USER_ID = 'u-1';
const SEED_EMAIL = 'alice@example.com';

const baseProfile: ProfileRow = {
  user_id: SEED_USER_ID,
  handle: 'alice',
  display_name: 'Alice',
  avatar_color: '#abcdef',
  created_at: '2024-01-01T00:00:00.000Z',
};

function makeSession(userId = SEED_USER_ID, email = SEED_EMAIL) {
  // Fresh object literal each call so we exercise the reference-vs-value
  // distinction the refactor cares about.
  return {
    access_token: 'tok-' + Math.random().toString(36).slice(2),
    user: {
      id: userId,
      email,
      user_metadata: {},
    },
  };
}

// Allow `refreshFromSession`'s async chain (await getSession + await
// from('profiles')...) to settle. Each `await` is a microtask tick; we
// flush enough of them to cover the longest path.
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockSupabaseReset();
});

describe('AccountContext.refreshFromSession', () => {
  test('first sign-in produces an account with the seeded handle', async () => {
    const { result } = renderHookWithProviders(() => useAccount(), {
      session: makeSession(),
      profiles: [baseProfile],
    });

    await waitFor(() => {
      expect(result.current.account).not.toBeNull();
    });

    expect(result.current.account?.userId).toBe(SEED_USER_ID);
    expect(result.current.account?.handle).toBe('alice');
    expect(result.current.account?.displayName).toBe('Alice');
    expect(result.current.account?.avatarColor).toBe('#abcdef');
    expect(result.current.account?.email).toBe(SEED_EMAIL);
    expect(result.current.needsProfile).toBe(false);
  });

  test('TOKEN_REFRESHED with identical session+profile preserves account reference', async () => {
    const { result } = renderHookWithProviders(() => useAccount(), {
      session: makeSession(),
      profiles: [baseProfile],
    });

    await waitFor(() => {
      expect(result.current.account).not.toBeNull();
    });

    const before = result.current.account;
    expect(before).not.toBeNull();

    // Fire TOKEN_REFRESHED with a brand-new session object reference but
    // the same userId/email. The profile row in the mocked table is
    // unchanged. The reducer should bail out via shallowEqualAccount.
    await act(async () => {
      mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', makeSession());
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(result.current.account).toBe(before);
  });

  test('TOKEN_REFRESHED with a real field change yields a new reference', async () => {
    const { result } = renderHookWithProviders(() => useAccount(), {
      session: makeSession(),
      profiles: [baseProfile],
    });

    await waitFor(() => {
      expect(result.current.account).not.toBeNull();
    });

    const before = result.current.account;
    expect(before?.displayName).toBe('Alice');

    // Mutate the persisted row, then fire TOKEN_REFRESHED.
    mockSupabaseSeedTable('profiles', [
      { ...baseProfile, display_name: 'Alice (renamed)' },
    ]);

    await act(async () => {
      mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', makeSession());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.account?.displayName).toBe('Alice (renamed)');
    });

    expect(result.current.account).not.toBe(before);
  });

  test('SIGNED_OUT clears account', async () => {
    const { result } = renderHookWithProviders(() => useAccount(), {
      session: makeSession(),
      profiles: [baseProfile],
    });

    await waitFor(() => {
      expect(result.current.account).not.toBeNull();
    });

    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(result.current.account).toBeNull();
    expect(result.current.needsProfile).toBe(false);
  });
});
