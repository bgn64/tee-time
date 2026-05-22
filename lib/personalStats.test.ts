/**
 * Unit tests for `lib/personalStats.ts` — the You-tab stats
 * computation. Pinned contracts (highest priority first):
 *
 *   · Signed-in: counts rounds where viewer's userId matches a
 *     participant's linkedUserId.
 *   · Signed-out + defaultPlayerId: counts ONLY rounds with
 *     ownerUserId === undefined (strict anon fallback). Cloud-
 *     attributed rounds with a previous user's ownerUserId set are
 *     EXCLUDED from the fallback — defense-in-depth against stale-
 *     cache leakage after sign-out.
 *   · Signed-out without defaultPlayerId: empty result.
 *   · Scramble rounds: excluded across all viewer states.
 */

import { computePersonalStats } from '@/lib/personalStats';
import type { Round } from '@/types/golf';

const ALICE_USER_ID = '11111111-1111-4111-8111-111111111111';
const BOB_USER_ID = '22222222-2222-4222-8222-222222222222';

const PAR_4_HOLE = { number: 1, par: 4 } as const;
const PAR_4_HOLE_2 = { number: 2, par: 4 } as const;

function makeStrokeRound(opts: {
  id: string;
  ownerUserId?: string;
  /** participantKey of the scorer; default 'user'. */
  scorerKey?: string;
  /** linkedUserId of the scorer's participant entry; undefined = local. */
  scorerLinkedUserId?: string;
  /** strokes per hole; default [4, 4] for stroke +0/+0 = even. */
  strokes?: number[];
}): Round {
  const scorerKey = opts.scorerKey ?? 'user';
  const strokes = opts.strokes ?? [4, 4];
  return {
    id: opts.id,
    course: {
      id: 'course-1',
      name: 'Test',
      location: '',
      source: 'custom',
      holes: [PAR_4_HOLE, PAR_4_HOLE_2],
    } as any,
    scoringRule: 'stroke',
    playerIds: [scorerKey],
    holeRange: 'all',
    currentHoleNumber: 1,
    scores: strokes.map((s, i) => ({
      scorerId: scorerKey,
      holeNumber: i + 1,
      strokes: s,
    })),
    startedAt: '2025-01-01T00:00:00Z',
    completedAt: '2025-01-01T01:00:00Z',
    ownerUserId: opts.ownerUserId,
    participants: [
      {
        participantKey: scorerKey,
        ...(opts.scorerLinkedUserId ? { linkedUserId: opts.scorerLinkedUserId } : {}),
      },
    ],
    mentionedUserIds: [],
  };
}

describe('computePersonalStats — signed-in viewer', () => {
  test('counts rounds where viewer is a linked participant', () => {
    const rounds = [
      makeStrokeRound({
        id: 'r-1',
        ownerUserId: ALICE_USER_ID,
        scorerKey: 'user',
        scorerLinkedUserId: ALICE_USER_ID,
        strokes: [3, 4], // -1, 0 = -1
      }),
      makeStrokeRound({
        id: 'r-2',
        ownerUserId: ALICE_USER_ID,
        scorerKey: 'user',
        scorerLinkedUserId: ALICE_USER_ID,
        strokes: [5, 5], // +1, +1 = +2
      }),
    ];
    const stats = computePersonalStats({
      completedRounds: rounds,
      myUserId: ALICE_USER_ID,
      defaultPlayerId: 'user',
    });
    expect(stats.rounds).toBe(2);
    expect(stats.avg).toBeCloseTo(0.5, 5);
    expect(stats.best).toBe(-1);
  });

  test("does not count a friend's round (linkedUserId doesn't match)", () => {
    const rounds = [
      makeStrokeRound({
        id: 'r-friend',
        ownerUserId: BOB_USER_ID,
        scorerKey: 'user',
        scorerLinkedUserId: BOB_USER_ID,
        strokes: [3, 3],
      }),
    ];
    const stats = computePersonalStats({
      completedRounds: rounds,
      myUserId: ALICE_USER_ID,
      defaultPlayerId: 'user',
    });
    expect(stats).toEqual({ rounds: 0, avg: null, best: null });
  });

  test('excludes scramble rounds', () => {
    const round = makeStrokeRound({
      id: 'r-scramble',
      ownerUserId: ALICE_USER_ID,
      scorerKey: 'user',
      scorerLinkedUserId: ALICE_USER_ID,
    });
    round.scoringRule = 'scramble';
    const stats = computePersonalStats({
      completedRounds: [round],
      myUserId: ALICE_USER_ID,
      defaultPlayerId: 'user',
    });
    expect(stats).toEqual({ rounds: 0, avg: null, best: null });
  });
});

describe('computePersonalStats — signed-out viewer with defaultPlayerId (anon fallback)', () => {
  test('counts genuine pre-auth anon rounds (ownerUserId === undefined)', () => {
    const rounds = [
      makeStrokeRound({
        id: 'r-anon-1',
        ownerUserId: undefined,
        scorerKey: 'user',
        strokes: [4, 5], // 0, +1 = +1
      }),
    ];
    const stats = computePersonalStats({
      completedRounds: rounds,
      myUserId: null,
      defaultPlayerId: 'user',
    });
    expect(stats.rounds).toBe(1);
    expect(stats.avg).toBe(1);
    expect(stats.best).toBe(1);
  });

  test('DOES NOT count cloud-attributed rounds (regression fix for the leak)', () => {
    // The scenario: a previously-signed-in user (Alice) played rounds
    // and signed out. The sign-out reset effect didn't fire cleanly,
    // so the local cache still contains Alice's rounds with
    // ownerUserId = ALICE_USER_ID. A new (signed-out) viewer opens
    // the You tab on the same device. Under the OLD logic this would
    // count Alice's rounds as the signed-out viewer's own stats; the
    // strict-anon fallback excludes them by construction.
    const rounds = [
      makeStrokeRound({
        id: 'r-stale-from-alice',
        ownerUserId: ALICE_USER_ID,
        scorerKey: 'user',
        scorerLinkedUserId: ALICE_USER_ID,
        strokes: [3, 3], // -1, -1 = -2 (would otherwise show)
      }),
    ];
    const stats = computePersonalStats({
      completedRounds: rounds,
      myUserId: null,
      defaultPlayerId: 'user',
    });
    expect(stats).toEqual({ rounds: 0, avg: null, best: null });
  });

  test('mixed cache: counts only the anon round, ignores the stale cloud one', () => {
    const rounds = [
      makeStrokeRound({
        id: 'r-stale-from-alice',
        ownerUserId: ALICE_USER_ID,
        scorerKey: 'user',
        scorerLinkedUserId: ALICE_USER_ID,
        strokes: [3, 3], // -2 if counted
      }),
      makeStrokeRound({
        id: 'r-anon-new',
        ownerUserId: undefined,
        scorerKey: 'user',
        strokes: [5, 5], // +2
      }),
    ];
    const stats = computePersonalStats({
      completedRounds: rounds,
      myUserId: null,
      defaultPlayerId: 'user',
    });
    expect(stats.rounds).toBe(1);
    expect(stats.avg).toBe(2);
    expect(stats.best).toBe(2);
  });
});

describe('computePersonalStats — signed-out viewer without defaultPlayerId', () => {
  test('returns empty stats', () => {
    const rounds = [
      makeStrokeRound({
        id: 'r-anon',
        ownerUserId: undefined,
        scorerKey: 'user',
        strokes: [3, 3],
      }),
    ];
    const stats = computePersonalStats({
      completedRounds: rounds,
      myUserId: null,
      defaultPlayerId: null,
    });
    expect(stats).toEqual({ rounds: 0, avg: null, best: null });
  });
});

describe('computePersonalStats — edge cases', () => {
  test('empty rounds list returns empty stats', () => {
    expect(
      computePersonalStats({
        completedRounds: [],
        myUserId: ALICE_USER_ID,
        defaultPlayerId: 'user',
      })
    ).toEqual({ rounds: 0, avg: null, best: null });
  });

  test('round with no scores for the viewer is skipped', () => {
    const round = makeStrokeRound({
      id: 'r-empty',
      ownerUserId: ALICE_USER_ID,
      scorerKey: 'user',
      scorerLinkedUserId: ALICE_USER_ID,
      strokes: [],
    });
    const stats = computePersonalStats({
      completedRounds: [round],
      myUserId: ALICE_USER_ID,
      defaultPlayerId: 'user',
    });
    expect(stats).toEqual({ rounds: 0, avg: null, best: null });
  });
});
