/**
 * Smoke test for ReadOnlyScorecard's avatar-cluster scorer rows.
 *
 * Verifies that with a scramble round of two teams (two members each),
 * the scorecard renders 4 avatar initials in the scorer rows (each
 * scorer row plus the FinalTotals row) — i.e. the per-team
 * TeamAvatarCluster picks up both members of each team. Identity
 * resolves against the local roster (no linkedUserId on participants).
 */

import { act } from '@testing-library/react-native';

import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import type { Round } from '@/types/golf';

jest.mock('@/state/supabaseClient');

import { renderWithProviders, mockSupabaseReset } from '@/state/__tests__/test-utils';

beforeEach(() => {
  mockSupabaseReset();
});

function makeScrambleRound(): Round {
  return {
    id: 'r1',
    course: {
      id: 'c1',
      name: 'Test Course',
      location: 'Somewhere',
      source: 'custom',
      holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4 })),
    },
    scoringRule: 'scramble',
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    teams: [
      { id: 't1', name: 'Alpha', color: '#ff0000', playerIds: ['p1', 'p2'] },
      { id: 't2', name: 'Bravo', color: '#00ff00', playerIds: ['p3', 'p4'] },
    ],
    holeRange: 'all',
    currentHoleNumber: 1,
    scores: [],
    startedAt: '2025-01-01T00:00:00Z',
    participants: [
      {
        participantKey: 'p1',
        teamId: 't1',
        localDisplayName: 'Alice',
        localDisplayColor: '#ff0000',
      },
      {
        participantKey: 'p2',
        teamId: 't1',
        localDisplayName: 'Bob',
        localDisplayColor: '#ff8800',
      },
      {
        participantKey: 'p3',
        teamId: 't2',
        localDisplayName: 'Carol',
        localDisplayColor: '#00ff00',
      },
      {
        participantKey: 'p4',
        teamId: 't2',
        localDisplayName: 'Dave',
        localDisplayColor: '#0088ff',
      },
    ],
    mentionedUserIds: [],
  };
}

describe('ReadOnlyScorecard avatar clusters', () => {
  test('scramble: each team scorer row renders one avatar per team member', async () => {
    const round = makeScrambleRound();
    const { getAllByText } = renderWithProviders(<ReadOnlyScorecard round={round} />);
    // Let ThemeContext / AccountContext finish async hydration.
    await act(async () => {
      await Promise.resolve();
    });

    // Each member's first letter is rendered as an avatar character.
    // The scramble round has 2 scorer rows (one per team) + 1 finals
    // row per team, so each letter appears 2x (once in the nine-section
    // scorer row, once in the FinalTotals row).
    expect(getAllByText('A')).toHaveLength(2); // Alice
    expect(getAllByText('B')).toHaveLength(2); // Bob
    expect(getAllByText('C')).toHaveLength(2); // Carol
    expect(getAllByText('D')).toHaveLength(2); // Dave
  });
});
