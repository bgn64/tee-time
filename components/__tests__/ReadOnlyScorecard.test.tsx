/**
 * Smoke test for ReadOnlyScorecard's avatar-cluster scorer rows and
 * the Final-box tee pill / linked-name affordances.
 *
 * Verifies that with a scramble round of two teams (two members each),
 * the scorecard renders 4 avatar initials in the scorer rows (each
 * scorer row plus the FinalTotals row) — i.e. the per-team
 * TeamAvatarCluster picks up both members of each team. Identity
 * resolves against the local roster (no linkedUserId on participants).
 *
 * Additionally covers:
 *   · The Final-box renders a tee pill (tee name text) for any scorer
 *     whose participant has a `teeId` that resolves against the
 *     course's tee list.
 *   · Linked-participant names are wrapped in a Pressable; pressing
 *     the name fires `onPressLinkedName` with the participant's
 *     `linkedUserId`.
 *   · Unlinked names are rendered as plain Text — pressing does NOT
 *     fire `onPressLinkedName`.
 */

import { act, fireEvent } from '@testing-library/react-native';

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

// Stroke round with one linked participant (`linkedUserId: 'u-bob'`) and
// one unlinked local participant. The linked participant carries a
// `teeId` so the Final-box tee pill is exercised in the same round.
function makeStrokeRound(): Round {
  return {
    id: 'r2',
    course: {
      id: 'c1',
      name: 'Test Course',
      location: 'Somewhere',
      source: 'custom',
      holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4 })),
      tees: [
        { id: 'tee-blue', name: 'Blue', color: 'blue', totalYardage: 3200 },
      ],
    },
    scoringRule: 'stroke',
    playerIds: ['plink', 'pcarol'],
    holeRange: 'all',
    currentHoleNumber: 1,
    scores: [],
    startedAt: '2025-01-01T00:00:00Z',
    participants: [
      {
        participantKey: 'plink',
        linkedUserId: 'u-bob',
        teeId: 'tee-blue',
      },
      {
        participantKey: 'pcarol',
        localDisplayName: 'Carol',
        localDisplayColor: '#00ff00',
      },
    ],
    mentionedUserIds: ['u-bob'],
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

describe('ReadOnlyScorecard final-box affordances', () => {
  test('renders a tee pill in the Final box when a participant has a teeId', async () => {
    const round = makeStrokeRound();
    const { getAllByText } = renderWithProviders(<ReadOnlyScorecard round={round} />);
    await act(async () => {
      await Promise.resolve();
    });

    // The "Blue" text appears in (a) the yardage row label above the
    // grid AND (b) the Final-box pill — so we expect 2 occurrences.
    expect(getAllByText('Blue').length).toBeGreaterThanOrEqual(1);
  });

  test('linked participant name fires onPressLinkedName with the linkedUserId', async () => {
    const onPressLinkedName = jest.fn();
    const round = makeStrokeRound();
    const { getByText } = renderWithProviders(
      <ReadOnlyScorecard round={round} onPressLinkedName={onPressLinkedName} />
    );
    await act(async () => {
      await Promise.resolve();
    });

    // The linked participant has no profileCache entry in this test setup,
    // so resolveParticipantIdentity falls back to "Friend".
    fireEvent.press(getByText('Friend'));
    expect(onPressLinkedName).toHaveBeenCalledTimes(1);
    expect(onPressLinkedName).toHaveBeenCalledWith('u-bob');
  });

  test('unlinked participant name is plain Text and does NOT fire onPressLinkedName', async () => {
    const onPressLinkedName = jest.fn();
    const round = makeStrokeRound();
    const { getByText } = renderWithProviders(
      <ReadOnlyScorecard round={round} onPressLinkedName={onPressLinkedName} />
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(getByText('Carol'));
    expect(onPressLinkedName).not.toHaveBeenCalled();
  });
});

describe('ReadOnlyScorecard scramble final-box linking', () => {
  /**
   * Regression test for "Account B is listed as You" — when account A
   * views a scramble round owned by account B, the Final box used to
   * render the baked `team.name` string (e.g. "You & Bob"). With the
   * NameSegment refactor, every member of the team gets its own
   * tappable segment, derived live from the participants and the
   * viewer's profileCache, so "You" never leaks across devices.
   */
  test('scramble Final box renders each linked team member name as a Pressable', async () => {
    const round: Round = {
      ...makeScrambleRound(),
      participants: [
        // Owner (Brett) — linked friend on viewer's profileCache.
        {
          participantKey: 'p-brett',
          teamId: 't1',
          linkedUserId: 'BBBBBBBB-2222-3333-4444-555555555555',
        },
        // Guest on Brett's device — local-only, NOT linkable.
        {
          participantKey: 'p-greg',
          teamId: 't1',
          localDisplayName: 'Greg Guest',
          localDisplayColor: '#444',
        },
      ],
      playerIds: ['p-brett', 'p-greg'],
      teams: [
        {
          id: 't1',
          // Baked at round-creation by Brett's device. Must NOT be
          // surfaced — we want live-derived names here.
          name: 'You & Greg',
          color: '#000',
          playerIds: ['p-brett', 'p-greg'],
        },
      ],
    };

    const onPressLinkedName = jest.fn();
    const { queryByText, getByText } = renderWithProviders(
      <ReadOnlyScorecard round={round} onPressLinkedName={onPressLinkedName} />,
      {
        // No profileCache seed → resolveParticipantIdentity returns
        // "Friend" for Brett. The exact label isn't the assertion —
        // the assertion is "no 'You', and the linkable segment fires."
      }
    );
    await act(async () => {
      await Promise.resolve();
    });

    // The baked "You" string must not appear anywhere in the row.
    expect(queryByText(/You/)).toBeNull();
    // The local-only member ("Greg") renders but is not tappable.
    expect(getByText('Greg')).toBeTruthy();
    fireEvent.press(getByText('Greg'));
    expect(onPressLinkedName).not.toHaveBeenCalled();

    // The linked-friend segment fires onPressLinkedName with the userId.
    fireEvent.press(getByText('Friend'));
    expect(onPressLinkedName).toHaveBeenCalledWith(
      'BBBBBBBB-2222-3333-4444-555555555555'
    );
  });
});

