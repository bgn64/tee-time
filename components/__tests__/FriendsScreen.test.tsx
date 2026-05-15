/**
 * FriendsScreen — covers the profileCache fallback path added in Phase 1.3.
 *
 * The friends list must always render one row per entry in `friends`, even
 * when the friend has no matching roster Player. The render path is:
 *
 *   roster Player  →  profileCache entry  →  inert "Loading…" placeholder
 *
 * The previous implementation silently dropped friends whose userId had no
 * matching roster row, and then showed the "No friends yet" empty state if
 * that filter drained the list to zero — even when `friends` was non-empty.
 * These tests pin both the fallback rendering and the empty-state condition.
 */

import { act, screen } from '@testing-library/react-native';

jest.mock('@/state/supabaseClient');

import AsyncStorage from '@react-native-async-storage/async-storage';

import FriendsScreen from '@/app/(tabs)/(you)/friends/index';

import {
  mockSupabaseReset,
  renderWithProviders,
} from '@/state/__tests__/test-utils';

const ME_USER_ID = 'me-user';
const ME_PROFILE = {
  user_id: ME_USER_ID,
  handle: 'me',
  display_name: 'Me',
  avatar_color: '#888888',
};
const ME_SESSION = { user: { id: ME_USER_ID, email: 'me@test.dev', user_metadata: {} } };

async function flushPullCycles() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  mockSupabaseReset();
  await AsyncStorage.clear();
});

describe('FriendsScreen', () => {
  test('renders a roster row when allPlayers has a matching userId', async () => {
    renderWithProviders(<FriendsScreen />, {
      session: ME_SESSION,
      profiles: [
        ME_PROFILE,
        { user_id: 'u1', handle: 'alice', display_name: 'Alice', avatar_color: '#aabbcc' },
      ],
      friendships: [{ user_id: ME_USER_ID, friend_user_id: 'u1' }],
      rosterPlayers: [
        {
          owner_user_id: ME_USER_ID,
          id: 'player-u1',
          nickname: 'Alice Roster',
          color: '#abcdef',
          linked_user_id: 'u1',
        },
      ],
    });

    expect(await screen.findByText('Alice Roster')).toBeTruthy();
    expect(screen.queryByText('No friends yet')).toBeNull();
  });

  test('falls back to profileCache when no roster row matches', async () => {
    renderWithProviders(<FriendsScreen />, {
      session: ME_SESSION,
      profiles: [
        ME_PROFILE,
        { user_id: 'u1', handle: 'foo', display_name: 'Foo Bar', avatar_color: '#000000' },
      ],
      friendships: [{ user_id: ME_USER_ID, friend_user_id: 'u1' }],
      // No rosterPlayers seeded — forces the cached fallback path.
    });

    expect(await screen.findByText('Foo Bar')).toBeTruthy();
    expect(screen.queryByText('No friends yet')).toBeNull();
  });

  test('renders a placeholder row instead of hiding a friend with no profile or roster row', async () => {
    renderWithProviders(<FriendsScreen />, {
      session: ME_SESSION,
      // Only seed ME's profile — `u1` has no matching profile row, so the
      // SocialContext prefetch silently drops it and profileCache stays
      // empty for u1.
      profiles: [ME_PROFILE],
      friendships: [{ user_id: ME_USER_ID, friend_user_id: 'u1' }],
    });

    expect(await screen.findByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('No friends yet')).toBeNull();
  });

  test('shows the "No friends yet" empty state only when friends.length === 0', async () => {
    renderWithProviders(<FriendsScreen />, {
      session: ME_SESSION,
      profiles: [ME_PROFILE],
      friendships: [],
    });

    expect(await screen.findByText('No friends yet')).toBeTruthy();
    await flushPullCycles();
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});
