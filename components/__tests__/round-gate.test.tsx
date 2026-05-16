/**
 * Round-gate tests for the Score-tab setup screens.
 *
 * Invariant: once a round is in progress, the only legal Score-tab
 * screen is `/scoring` (plus `/player/[id]`, which is reached *from*
 * scoring). `players`, `format`, and `new-course` each wrap their real
 * screen in a small `<Gate>` that returns `<Redirect href="/scoring">`
 * whenever `currentRound` is non-null.
 *
 * These tests render each gate component with the full provider tree
 * and toggle `currentRound` via AsyncStorage seeding (the
 * GolfRoundProvider hydrates from `STORAGE_KEYS.CURRENT_ROUND` on
 * mount). The expo-router mock in `jest.setup.ts` renders `<Redirect>`
 * as `null`, so a successful gate hand-off renders no body content.
 */

jest.mock('@/state/supabaseClient');

import { act, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import PlayersScreen from '@/app/(tabs)/(score)/players';
import FormatScreen from '@/app/(tabs)/(score)/format';
import NewCourseScreen from '@/app/(tabs)/(score)/new-course';

import { STORAGE_KEYS } from '@/state/persistence';
import {
  mockSupabaseReset,
  renderWithProviders,
} from '@/state/__tests__/test-utils';

const ME_USER_ID = '11111111-1111-4111-8111-111111111111';
const ME_SESSION = {
  user: { id: ME_USER_ID, email: 'me@test.dev', user_metadata: {} },
};
const ME_PROFILE = {
  user_id: ME_USER_ID,
  handle: 'me',
  display_name: 'Me',
  avatar_color: '#888888',
};

/**
 * Minimal in-progress round shape. Field set matches what
 * GolfRoundProvider expects on hydrate (it `JSON.parse`s as-is into
 * `currentRound`).
 */
const LIVE_ROUND = {
  id: 'sc-live',
  course: {
    id: 'course-test',
    name: 'Test Course',
    location: 'Nowhere, USA',
    source: 'custom' as const,
    holes: [{ number: 1, par: 4 }],
  },
  scoringRule: 'stroke' as const,
  playerIds: ['player-me'],
  holeRange: 'all' as const,
  currentHoleNumber: 1,
  scores: [],
  startedAt: '2025-05-01T00:00:00Z',
  ownerUserId: ME_USER_ID,
  participants: [],
  mentionedUserIds: [],
};

async function flushHydration() {
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

// =============================================================================
// players.tsx
// =============================================================================

describe('PlayersScreen gate', () => {
  test('renders the screen body when no round is in progress', async () => {
    renderWithProviders(<PlayersScreen />, {
      session: ME_SESSION,
      profiles: [ME_PROFILE],
    });
    expect(await screen.findByText("Who's playing?")).toBeTruthy();
  });

  test('redirects (no body rendered) when a round is already in progress', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CURRENT_ROUND,
      JSON.stringify(LIVE_ROUND),
    );
    renderWithProviders(<PlayersScreen />, {
      session: ME_SESSION,
      profiles: [ME_PROFILE],
    });
    await flushHydration();
    expect(screen.queryByText("Who's playing?")).toBeNull();
  });
});

// =============================================================================
// format.tsx
// =============================================================================

describe('FormatScreen gate', () => {
  test('renders the screen body when no round is in progress', async () => {
    renderWithProviders(<FormatScreen />, {
      session: ME_SESSION,
      profiles: [ME_PROFILE],
    });
    expect(await screen.findByText('How are you scoring?')).toBeTruthy();
  });

  test('redirects (no body rendered) when a round is already in progress', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CURRENT_ROUND,
      JSON.stringify(LIVE_ROUND),
    );
    renderWithProviders(<FormatScreen />, {
      session: ME_SESSION,
      profiles: [ME_PROFILE],
    });
    await flushHydration();
    expect(screen.queryByText('How are you scoring?')).toBeNull();
  });
});

// =============================================================================
// new-course.tsx
// =============================================================================

describe('NewCourseScreen gate', () => {
  test('renders the screen body when no round is in progress', async () => {
    renderWithProviders(<NewCourseScreen />, {
      session: ME_SESSION,
      profiles: [ME_PROFILE],
    });
    expect(await screen.findByText('New Course')).toBeTruthy();
  });

  test('redirects (no body rendered) when a round is already in progress', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CURRENT_ROUND,
      JSON.stringify(LIVE_ROUND),
    );
    renderWithProviders(<NewCourseScreen />, {
      session: ME_SESSION,
      profiles: [ME_PROFILE],
    });
    await flushHydration();
    expect(screen.queryByText('New Course')).toBeNull();
  });
});
