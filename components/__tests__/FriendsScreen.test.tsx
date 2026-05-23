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

  test('roster row prefers profileCache avatar color over the stale roster snapshot', async () => {
    // Scenario: friend changed their avatar color on their device.
    // The viewer's roster snapshot still has the old color (the
    // roster is local-editable, intentionally not auto-overwritten),
    // but `refreshProfiles` has pulled the new color into
    // profileCache. The Friends list rendering must prefer the live
    // profile value so the cross-device propagation contract
    // (Phase 5 of the manual smoke flow) actually shows the update.
    const SEED_OLD_COLOR = '#aabbcc'; // what the roster row carries
    const PROFILE_NEW_COLOR = '#ff00ff'; // what the friend currently has
    const { UNSAFE_root } = renderWithProviders(<FriendsScreen />, {
      session: ME_SESSION,
      profiles: [
        ME_PROFILE,
        {
          user_id: 'u1',
          handle: 'alice',
          display_name: 'Alice',
          avatar_color: PROFILE_NEW_COLOR,
        },
      ],
      friendships: [{ user_id: ME_USER_ID, friend_user_id: 'u1' }],
      rosterPlayers: [
        {
          owner_user_id: ME_USER_ID,
          id: 'player-u1',
          nickname: 'Alice',
          color: SEED_OLD_COLOR,
          linked_user_id: 'u1',
        },
      ],
    });

    // Wait for FriendsContext.refreshFriendsAndRequests to complete —
    // it fans out into ensureProfilesCached for every friend id,
    // which is what populates profileCache with the new color.
    expect(await screen.findByText('Alice')).toBeTruthy();
    await flushPullCycles();

    // Walk the rendered tree and collect every backgroundColor style
    // we find on any element. Assert the new color is in the set and
    // the stale snapshot color is not. (Direct testID would be
    // cleaner but the avatar View doesn't have one.)
    const backgrounds = new Set<string>();
    const visit = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      const style = node.props?.style;
      const styles = Array.isArray(style) ? style : style ? [style] : [];
      for (const s of styles) {
        if (s && typeof s === 'object' && 'backgroundColor' in s) {
          backgrounds.add(s.backgroundColor);
        }
      }
      const children = node.children;
      if (Array.isArray(children)) {
        for (const c of children) visit(c);
      } else if (children) {
        visit(children);
      }
    };
    visit(UNSAFE_root);
    expect(backgrounds.has(PROFILE_NEW_COLOR)).toBe(true);
    expect(backgrounds.has(SEED_OLD_COLOR)).toBe(false);
  });
});
