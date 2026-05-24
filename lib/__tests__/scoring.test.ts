import {
  buildRoundTitle,
  formatDay,
  formatRelativeTime,
  formatScore,
  getRoundTotalRelative,
  getScorerProgress,
  getScorerTotalRelative,
  monthKey,
  replaceScore,
} from '@/lib/scoring';
import { Round, RoundScore } from '@/types/golf';

// ---------- Fixtures ----------

const par72Course = {
  id: 'c1',
  name: 'Test Course',
  location: '',
  source: 'custom' as const,
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
  })),
};

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    course: par72Course,
    scoringRule: 'stroke',
    playerIds: ['a', 'b'],
    holeRange: 'all',
    currentHoleNumber: 1,
    scores: [],
    startedAt: '2026-05-01T10:00:00Z',
    participants: [],
    mentionedUserIds: [],
    ...overrides,
  };
}

// ---------- formatScore ----------

describe('formatScore', () => {
  test('returns "E" for zero', () => {
    expect(formatScore(0)).toBe('E');
  });

  test('prefixes positive with "+"', () => {
    expect(formatScore(3)).toBe('+3');
    expect(formatScore(15)).toBe('+15');
  });

  test('prefixes negative with unicode minus and absolute value', () => {
    expect(formatScore(-2)).toBe('−2');
    expect(formatScore(-10)).toBe('−10');
  });
});

// ---------- formatDay ----------

describe('formatDay', () => {
  test('formats month + day', () => {
    expect(formatDay(new Date(2026, 4, 6))).toBe('May 6');
    expect(formatDay(new Date(2026, 0, 1))).toBe('Jan 1');
  });

  test('handles end-of-year', () => {
    expect(formatDay(new Date(2026, 11, 31))).toBe('Dec 31');
  });
});

// ---------- monthKey ----------

describe('monthKey', () => {
  test('returns uppercase month + year', () => {
    expect(monthKey(new Date(2026, 4, 6))).toBe('MAY 2026');
    expect(monthKey(new Date(2025, 11, 31))).toBe('DECEMBER 2025');
  });

  test('produces same key for any day in the same month', () => {
    expect(monthKey(new Date(2026, 4, 1))).toBe(monthKey(new Date(2026, 4, 31)));
  });
});

// ---------- formatRelativeTime ----------

describe('formatRelativeTime', () => {
  const now = new Date('2026-05-10T12:00:00Z').getTime();

  test('"Xm ago" for under an hour, minimum 1m', () => {
    expect(formatRelativeTime('2026-05-10T11:55:00Z', now)).toBe('5m ago');
    // Under 1 minute clamps to 1m
    expect(formatRelativeTime('2026-05-10T11:59:30Z', now)).toBe('1m ago');
  });

  test('"Xh ago" for under a day', () => {
    expect(formatRelativeTime('2026-05-10T09:00:00Z', now)).toBe('3h ago');
  });

  test('"Yesterday" for the next 24h window', () => {
    expect(formatRelativeTime('2026-05-09T11:00:00Z', now)).toBe('Yesterday');
  });

  test('"X days ago" for under a week', () => {
    expect(formatRelativeTime('2026-05-07T12:00:00Z', now)).toBe('3 days ago');
  });

  test('falls back to short month/day for >7 days', () => {
    expect(formatRelativeTime('2026-04-15T12:00:00Z', now)).toBe('Apr 15');
  });

  test('zero / future inputs floor to "1m ago" rather than throwing', () => {
    expect(formatRelativeTime('2026-05-10T13:00:00Z', now)).toBe('1m ago');
  });
});

// ---------- getRoundTotalRelative ----------

describe('getRoundTotalRelative', () => {
  test('returns 0 when no scores', () => {
    expect(getRoundTotalRelative(makeRound())).toBe(0);
  });

  test('sums (strokes - par) across all scorers when scorerId omitted', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1
        { scorerId: 'a', holeNumber: 2, strokes: 3 }, // -1
        { scorerId: 'b', holeNumber: 1, strokes: 6 }, // +2
      ],
    });
    expect(getRoundTotalRelative(r)).toBe(2);
  });

  test('filters to one scorer when scorerId provided', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1
        { scorerId: 'b', holeNumber: 1, strokes: 6 }, // +2
      ],
    });
    expect(getRoundTotalRelative(r, 'a')).toBe(1);
    expect(getRoundTotalRelative(r, 'b')).toBe(2);
  });

  test('skips scores referencing unknown holes', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1
        { scorerId: 'a', holeNumber: 99, strokes: 5 }, // skipped
      ],
    });
    expect(getRoundTotalRelative(r, 'a')).toBe(1);
  });

  test('excludes out-of-range holes when holeRange = front9', () => {
    const r = makeRound({
      holeRange: 'front9',
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1 in range
        { scorerId: 'a', holeNumber: 9, strokes: 3 }, // -1 in range
        { scorerId: 'a', holeNumber: 10, strokes: 6 }, // +2 OUT of range — preserved but ignored
        { scorerId: 'a', holeNumber: 15, strokes: 6 }, // +2 OUT of range — preserved but ignored
      ],
    });
    expect(getRoundTotalRelative(r, 'a')).toBe(0);
  });

  test('excludes out-of-range holes when holeRange = back9', () => {
    const r = makeRound({
      holeRange: 'back9',
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 6 }, // +2 OUT
        { scorerId: 'a', holeNumber: 10, strokes: 5 }, // +1 IN
        { scorerId: 'a', holeNumber: 18, strokes: 3 }, // -1 IN
      ],
    });
    expect(getRoundTotalRelative(r, 'a')).toBe(0);
  });
});

// ---------- getScorerTotalRelative ----------

describe('getScorerTotalRelative', () => {
  test('empty string when no holes scored', () => {
    expect(getScorerTotalRelative(makeRound(), 'a')).toBe('');
  });

  test('"E thru N" when net even', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 3 }, // -1
        { scorerId: 'a', holeNumber: 2, strokes: 5 }, // +1
      ],
    });
    expect(getScorerTotalRelative(r, 'a')).toBe('E thru 2');
  });

  test('"+N thru M" when over par', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1
        { scorerId: 'a', holeNumber: 2, strokes: 6 }, // +2
        { scorerId: 'a', holeNumber: 3, strokes: 4 }, // 0
      ],
    });
    expect(getScorerTotalRelative(r, 'a')).toBe('+3 thru 3');
  });

  test('"-N thru M" when under par (ASCII hyphen via JS template)', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 3 }, // -1
        { scorerId: 'a', holeNumber: 2, strokes: 3 }, // -1
      ],
    });
    expect(getScorerTotalRelative(r, 'a')).toBe('-2 thru 2');
  });

  test('respects holeRange front9 (out-of-range scores excluded from count + total)', () => {
    const r = makeRound({
      holeRange: 'front9',
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1 in range
        { scorerId: 'a', holeNumber: 12, strokes: 3 }, // -1 OUT of range — ignored
      ],
    });
    // Only hole 1 counts → "+1 thru 1"
    expect(getScorerTotalRelative(r, 'a')).toBe('+1 thru 1');
  });

  test('respects holeRange back9 (returns empty when no in-range scores)', () => {
    const r = makeRound({
      holeRange: 'back9',
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // front-9 — ignored
      ],
    });
    expect(getScorerTotalRelative(r, 'a')).toBe('');
  });
});

// ---------- getScorerProgress ----------

describe('getScorerProgress', () => {
  test('returns zeros when scorerId is undefined', () => {
    expect(getScorerProgress(makeRound(), undefined)).toEqual({
      relativeScore: 0,
      thruCount: 0,
    });
  });

  test('returns zeros when no scores match the scorer', () => {
    const r = makeRound({
      scores: [{ scorerId: 'b', holeNumber: 1, strokes: 4 }],
    });
    expect(getScorerProgress(r, 'a')).toEqual({
      relativeScore: 0,
      thruCount: 0,
    });
  });

  test('sums relative-to-par and counts holes for the matching scorer', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1
        { scorerId: 'a', holeNumber: 2, strokes: 3 }, // -1
        { scorerId: 'a', holeNumber: 3, strokes: 6 }, // +2
        { scorerId: 'b', holeNumber: 1, strokes: 4 }, // other scorer — ignored
      ],
    });
    expect(getScorerProgress(r, 'a')).toEqual({
      relativeScore: 2,
      thruCount: 3,
    });
  });

  test('dedupes by hole — duplicate score writes count once', () => {
    const r = makeRound({
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 },
        { scorerId: 'a', holeNumber: 1, strokes: 6 }, // duplicate — ignored
        { scorerId: 'a', holeNumber: 2, strokes: 4 },
      ],
    });
    expect(getScorerProgress(r, 'a')).toEqual({
      relativeScore: 1, // 5 + 4 - (4 + 4)
      thruCount: 2,
    });
  });

  test('respects holeRange — out-of-range scores excluded from both totals', () => {
    const r = makeRound({
      holeRange: 'front9',
      scores: [
        { scorerId: 'a', holeNumber: 1, strokes: 5 }, // +1 — in range
        { scorerId: 'a', holeNumber: 2, strokes: 4 }, // 0 — in range
        { scorerId: 'a', holeNumber: 12, strokes: 3 }, // -1 — OUT of range
        { scorerId: 'a', holeNumber: 13, strokes: 3 }, // -1 — OUT of range
      ],
    });
    expect(getScorerProgress(r, 'a')).toEqual({
      relativeScore: 1,
      thruCount: 2,
    });
  });
});

// ---------- replaceScore ----------

describe('replaceScore', () => {
  const next: RoundScore = { scorerId: 'a', holeNumber: 1, strokes: 4 };

  test('appends when no matching entry exists', () => {
    expect(replaceScore([], next)).toEqual([next]);
  });

  test('replaces in place when (scorer, hole) already present', () => {
    const prev: RoundScore[] = [
      { scorerId: 'a', holeNumber: 1, strokes: 5 },
      { scorerId: 'b', holeNumber: 1, strokes: 6 },
    ];
    const out = replaceScore(prev, next);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(next);
    expect(out[1]).toEqual(prev[1]);
  });

  test('does not mutate the input array', () => {
    const prev: RoundScore[] = [{ scorerId: 'a', holeNumber: 1, strokes: 5 }];
    const snapshot = JSON.stringify(prev);
    replaceScore(prev, next);
    expect(JSON.stringify(prev)).toBe(snapshot);
  });

  test('treats different scorers and different holes as separate keys', () => {
    const prev: RoundScore[] = [{ scorerId: 'a', holeNumber: 1, strokes: 5 }];
    const out1 = replaceScore(prev, { scorerId: 'b', holeNumber: 1, strokes: 4 });
    expect(out1).toHaveLength(2);
    const out2 = replaceScore(prev, { scorerId: 'a', holeNumber: 2, strokes: 4 });
    expect(out2).toHaveLength(2);
  });
});

// ---------- buildRoundTitle ----------

describe('buildRoundTitle', () => {
  const resolveName = (id: string): string =>
    ({ u1: 'Mike', u2: 'Ben', u3: 'Sarah' } as Record<string, string>)[id] ?? 'Friend';

  test('"Round" when no linked participants exist (stroke)', () => {
    const r = makeRound({ participants: [] });
    expect(buildRoundTitle(r)).toBe('Round');
  });

  test('"X played" with one linked participant', () => {
    const r = makeRound({
      participants: [{ participantKey: 'a', linkedUserId: 'u1' }],
    });
    expect(buildRoundTitle(r, undefined, resolveName)).toBe('Mike played');
  });

  test('replaces own name with "you" when myUserId matches', () => {
    const r = makeRound({
      participants: [{ participantKey: 'a', linkedUserId: 'u1' }],
    });
    expect(buildRoundTitle(r, 'u1', resolveName)).toBe('you played');
  });

  test('"X and Y played" with two linked', () => {
    const r = makeRound({
      participants: [
        { participantKey: 'a', linkedUserId: 'u1' },
        { participantKey: 'b', linkedUserId: 'u2' },
      ],
    });
    expect(buildRoundTitle(r, undefined, resolveName)).toBe('Mike and Ben played');
  });

  test('Oxford-style join with three+ linked', () => {
    const r = makeRound({
      participants: [
        { participantKey: 'a', linkedUserId: 'u1' },
        { participantKey: 'b', linkedUserId: 'u2' },
        { participantKey: 'c', linkedUserId: 'u3' },
      ],
    });
    expect(buildRoundTitle(r, undefined, resolveName)).toBe('Mike, Ben, and Sarah played');
  });

  test('excludes local participants', () => {
    const r = makeRound({
      participants: [
        { participantKey: 'a', linkedUserId: 'u1' },
        { participantKey: 'c', localDisplayName: 'Dad' },
      ],
    });
    expect(buildRoundTitle(r, undefined, resolveName)).toBe('Mike played');
  });

  test('falls back to "Friend" when no resolver is supplied', () => {
    const r = makeRound({
      participants: [{ participantKey: 'a', linkedUserId: 'u1' }],
    });
    expect(buildRoundTitle(r)).toBe('Friend played');
  });

  test('"Red vs Blue" for scramble with two teams', () => {
    const r = makeRound({
      scoringRule: 'scramble',
      teams: [
        { id: 't1', name: 'Red', color: '#d54848', playerIds: ['a'] },
        { id: 't2', name: 'Blue', color: '#42a5f5', playerIds: ['b'] },
      ],
    });
    expect(buildRoundTitle(r)).toBe('Red vs Blue');
  });

  test('"Round" for scramble with no teams', () => {
    const r = makeRound({ scoringRule: 'scramble' });
    expect(buildRoundTitle(r)).toBe('Round');
  });
});
