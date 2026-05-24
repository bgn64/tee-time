/**
 * FeedCardLarge render tests.
 *
 * Two shapes:
 *   - in-progress round (no `completedAt`): card shows the
 *     "IN PROGRESS" pill, a "THRU N" line under the band score, and
 *     suppresses the bottom FINAL totals row.
 *   - completed round (`completedAt` set): card shows neither the
 *     "IN PROGRESS" pill nor a "THRU" line, and renders the
 *     FINAL totals row.
 *
 * The component receives all data via props, so the provider tree only
 * needs to supply theme/account/players/profile-cache for the embedded
 * ReadOnlyScorecard.
 */

jest.mock('@/state/supabaseClient');

import { screen } from '@testing-library/react-native';

import { FeedCardLarge } from '@/components/FeedCardLarge';
import { renderWithProviders } from '@/state/__tests__/test-utils';
import type { Round } from '@/types/golf';

const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_HANDLE = 'maya';
const OWNER_PARTICIPANT_KEY = 'player-maya';

const par4Course = {
  id: 'c1',
  name: 'Test Course',
  location: 'Test, USA',
  source: 'custom' as const,
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
  })),
};

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    course: par4Course,
    scoringRule: 'stroke',
    playerIds: [OWNER_PARTICIPANT_KEY],
    holeRange: 'all',
    currentHoleNumber: 1,
    scores: [],
    startedAt: '2026-05-01T10:00:00Z',
    ownerUserId: OWNER_ID,
    participants: [
      {
        participantKey: OWNER_PARTICIPANT_KEY,
        linkedUserId: OWNER_ID,
      },
    ],
    mentionedUserIds: [],
    ...overrides,
  };
}

const profileCache = {
  [OWNER_ID]: {
    userId: OWNER_ID,
    displayName: 'Maya',
    handle: OWNER_HANDLE,
    avatarColor: '#7cb342',
  },
};

describe('FeedCardLarge — in-progress round', () => {
  test('shows IN PROGRESS pill and THRU line, suppresses FINAL totals', () => {
    const round = makeRound({
      // No completedAt → in progress.
      lastScoreAt: '2026-05-01T10:30:00Z',
      scores: [
        { scorerId: OWNER_PARTICIPANT_KEY, holeNumber: 1, strokes: 5 }, // +1
        { scorerId: OWNER_PARTICIPANT_KEY, holeNumber: 2, strokes: 4 }, //  0
        { scorerId: OWNER_PARTICIPANT_KEY, holeNumber: 3, strokes: 3 }, // -1
      ],
    });
    renderWithProviders(
      <FeedCardLarge round={round} allPlayers={[]} profileCache={profileCache} />,
      {},
    );
    expect(screen.getByText('IN PROGRESS')).toBeTruthy();
    expect(screen.getByText('THRU 3')).toBeTruthy();
    // FINAL totals row is suppressed via hideFinalTotals.
    expect(screen.queryByText(/^FINAL ·/)).toBeNull();
  });
});

describe('FeedCardLarge — completed round', () => {
  test('does not show IN PROGRESS pill or THRU line, renders FINAL totals', () => {
    const round = makeRound({
      completedAt: '2026-05-01T14:00:00Z',
      scores: [
        { scorerId: OWNER_PARTICIPANT_KEY, holeNumber: 1, strokes: 5 },
        { scorerId: OWNER_PARTICIPANT_KEY, holeNumber: 2, strokes: 4 },
      ],
    });
    renderWithProviders(
      <FeedCardLarge round={round} allPlayers={[]} profileCache={profileCache} />,
      {},
    );
    expect(screen.queryByText('IN PROGRESS')).toBeNull();
    expect(screen.queryByText(/^THRU /)).toBeNull();
    // FINAL totals row is rendered.
    expect(screen.getByText(/^FINAL ·/)).toBeTruthy();
  });
});
