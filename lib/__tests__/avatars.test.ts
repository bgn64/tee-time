import {
  buildAvatarEntries,
  groupByTeam,
  makeRosterResolver,
  resolveTeeSwatch,
  truncateEntries,
} from '@/lib/avatars';
import type { Player, Round, RoundParticipant, Team, Tee } from '@/types/golf';

function makeTee(overrides: Partial<Tee> & Pick<Tee, 'id' | 'name'>): Tee {
  return { color: '#000', ...overrides };
}

function makeParticipant(
  overrides: Partial<RoundParticipant> & Pick<RoundParticipant, 'participantKey'>
): RoundParticipant {
  return { ...overrides };
}

function makeRound(overrides: Partial<Round>): Round {
  const tees: Tee[] = overrides.course?.tees ?? [
    makeTee({ id: 'tee-blue', name: 'Blue', color: '#1e90ff' }),
    makeTee({ id: 'tee-white', name: 'White', color: '#ffffff' }),
    makeTee({ id: 'tee-red', name: 'Red', color: '#dc143c' }),
  ];
  return {
    id: 'round-1',
    course: {
      id: 'course-1',
      name: 'Pebble Beach',
      location: 'Pebble Beach, CA',
      holes: [],
      source: 'opengolf',
      tees,
      ...overrides.course,
    },
    scoringRule: 'stroke',
    playerIds: [],
    holeRange: 'all',
    currentHoleNumber: 1,
    scores: [],
    startedAt: '2025-01-01T00:00:00Z',
    participants: [],
    mentionedUserIds: [],
    ...overrides,
  };
}

const FALLBACK_COLOR = '#7cb342';

function rosterOf(map: Record<string, Player>) {
  return (id: string) => map[id];
}

describe('makeRosterResolver', () => {
  test('linked participant resolves via roster lookup (displayName)', () => {
    const resolver = makeRosterResolver(
      rosterOf({ 'p-mike': { id: 'p-mike', nickname: 'Mike', displayName: 'Mike Chen', color: '#4a90e2' } }),
      FALLBACK_COLOR
    );
    const out = resolver({ participantKey: 'p-mike', linkedUserId: 'u-mike' });
    expect(out).toEqual({ name: 'Mike Chen', color: '#4a90e2' });
  });

  test('linked participant falls back to nickname if no displayName', () => {
    const resolver = makeRosterResolver(
      rosterOf({ 'p-bob': { id: 'p-bob', nickname: 'Bob' } }),
      FALLBACK_COLOR
    );
    const out = resolver({ participantKey: 'p-bob', linkedUserId: 'u-bob' });
    expect(out).toEqual({ name: 'Bob', color: FALLBACK_COLOR });
  });

  test('linked participant with no roster row falls back to "Friend"', () => {
    const resolver = makeRosterResolver(rosterOf({}), FALLBACK_COLOR);
    const out = resolver({ participantKey: 'p-ghost', linkedUserId: 'u-ghost' });
    expect(out).toEqual({ name: 'Friend', color: FALLBACK_COLOR });
  });

  test('local participant uses snapshot fields', () => {
    const resolver = makeRosterResolver(rosterOf({}), FALLBACK_COLOR);
    const out = resolver({
      participantKey: 'p-dad',
      localDisplayName: 'Dad',
      localDisplayColor: '#ff8f00',
    });
    expect(out).toEqual({ name: 'Dad', color: '#ff8f00' });
  });

  test('local participant with no snapshot falls back', () => {
    const resolver = makeRosterResolver(rosterOf({}), FALLBACK_COLOR);
    const out = resolver({ participantKey: 'p-anon' });
    expect(out).toEqual({ name: 'Player', color: FALLBACK_COLOR });
  });
});

describe('resolveTeeSwatch', () => {
  test('canonical named color resolves via TEE_COLOR_HEX', () => {
    expect(resolveTeeSwatch({ id: 't', name: 'Blue' })).toBe('#4a90e2');
    expect(resolveTeeSwatch({ id: 't', name: 'Red' })).toBe('#d54848');
    expect(resolveTeeSwatch({ id: 't', name: 'White' })).toBe('#ddd6c4');
  });

  test('explicit hex color is preserved when not in the canonical map', () => {
    expect(resolveTeeSwatch({ id: 't', name: 'Custom', color: '#abcdef' })).toBe('#abcdef');
  });

  test('explicit named color overrides the tee name', () => {
    expect(resolveTeeSwatch({ id: 't', name: 'Forward', color: 'red' })).toBe('#d54848');
  });

  test('unknown name + no color returns undefined (caller skips chip)', () => {
    expect(resolveTeeSwatch({ id: 't', name: 'Champions' })).toBeUndefined();
  });

  test('undefined input is safe', () => {
    expect(resolveTeeSwatch(undefined)).toBeUndefined();
  });
});

describe('buildAvatarEntries — stroke', () => {
  test('one AvatarEntry per participant with tee fields resolved', () => {
    const round = makeRound({
      scoringRule: 'stroke',
      participants: [
        makeParticipant({ participantKey: 'p-mike', localDisplayName: 'Mike', localDisplayColor: '#4a90e2', teeId: 'tee-blue' }),
        makeParticipant({ participantKey: 'p-sarah', localDisplayName: 'Sarah', localDisplayColor: '#9c5dde', teeId: 'tee-red' }),
      ],
    });
    const resolver = makeRosterResolver(rosterOf({}), FALLBACK_COLOR);
    const entries = buildAvatarEntries(round, resolver);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      participantKey: 'p-mike',
      name: 'Mike',
      color: '#4a90e2',
      teeId: 'tee-blue',
      // The tee.color "#1e90ff" isn't in TEE_COLOR_HEX, but it starts
      // with '#' so resolveTeeSwatch keeps it as-is.
      teeColor: '#1e90ff',
      teeName: 'Blue',
    });
    expect(entries[0].teamId).toBeUndefined();
    expect(entries[0].teamColor).toBeUndefined();
    expect(entries[1]).toMatchObject({
      participantKey: 'p-sarah',
      teeColor: '#dc143c',
      teeName: 'Red',
    });
  });

  test('participant with no teeId leaves tee fields undefined', () => {
    const round = makeRound({
      participants: [
        makeParticipant({ participantKey: 'p-mike', localDisplayName: 'Mike', localDisplayColor: '#4a90e2' }),
      ],
    });
    const entries = buildAvatarEntries(round, makeRosterResolver(rosterOf({}), FALLBACK_COLOR));
    expect(entries[0].teeId).toBeUndefined();
    expect(entries[0].teeColor).toBeUndefined();
    expect(entries[0].teeName).toBeUndefined();
  });

  test('participant with teeId that does not exist on course leaves tee color/name undefined', () => {
    const round = makeRound({
      participants: [
        makeParticipant({ participantKey: 'p-mike', localDisplayName: 'Mike', localDisplayColor: '#4a90e2', teeId: 'tee-vanished' }),
      ],
    });
    const entries = buildAvatarEntries(round, makeRosterResolver(rosterOf({}), FALLBACK_COLOR));
    expect(entries[0].teeId).toBe('tee-vanished');
    expect(entries[0].teeColor).toBeUndefined();
    expect(entries[0].teeName).toBeUndefined();
  });

  test('older round with no participants array renders no entries', () => {
    const round = makeRound({});
    // Force-strip participants to simulate legacy data.
    (round as { participants?: RoundParticipant[] }).participants = undefined as unknown as RoundParticipant[];
    const entries = buildAvatarEntries(round, makeRosterResolver(rosterOf({}), FALLBACK_COLOR));
    expect(entries).toEqual([]);
  });
});

describe('buildAvatarEntries — scramble', () => {
  const team1: Team = { id: 'team-1', name: 'You & Dad', color: '#ff8f00', playerIds: ['p-me', 'p-dad'] };
  const team2: Team = { id: 'team-2', name: 'Mike & Sarah', color: '#4a90e2', playerIds: ['p-mike', 'p-sarah'] };

  test('every entry carries teamId/teamColor', () => {
    const round = makeRound({
      scoringRule: 'scramble',
      teams: [team1, team2],
      participants: [
        makeParticipant({ participantKey: 'p-me', localDisplayName: 'Me', localDisplayColor: '#ff8f00', teeId: 'tee-white', teamId: 'team-1' }),
        makeParticipant({ participantKey: 'p-dad', localDisplayName: 'Dad', localDisplayColor: '#ffaa55', teeId: 'tee-red', teamId: 'team-1' }),
        makeParticipant({ participantKey: 'p-mike', localDisplayName: 'Mike', localDisplayColor: '#4a90e2', teeId: 'tee-blue', teamId: 'team-2' }),
        makeParticipant({ participantKey: 'p-sarah', localDisplayName: 'Sarah', localDisplayColor: '#9c5dde', teeId: 'tee-blue', teamId: 'team-2' }),
      ],
    });
    const entries = buildAvatarEntries(round, makeRosterResolver(rosterOf({}), FALLBACK_COLOR));
    expect(entries.map((e) => e.teamId)).toEqual(['team-1', 'team-1', 'team-2', 'team-2']);
    expect(entries.map((e) => e.teamColor)).toEqual(['#ff8f00', '#ff8f00', '#4a90e2', '#4a90e2']);
    expect(entries.map((e) => e.teeName)).toEqual(['White', 'Red', 'Blue', 'Blue']);
  });

  test('groupByTeam preserves round.teams[] order', () => {
    const round = makeRound({
      scoringRule: 'scramble',
      teams: [team1, team2],
      participants: [
        // Intentionally interleaved to make the test meaningful.
        makeParticipant({ participantKey: 'p-mike', localDisplayName: 'Mike', localDisplayColor: '#4a90e2', teamId: 'team-2' }),
        makeParticipant({ participantKey: 'p-me', localDisplayName: 'Me', localDisplayColor: '#ff8f00', teamId: 'team-1' }),
        makeParticipant({ participantKey: 'p-sarah', localDisplayName: 'Sarah', localDisplayColor: '#9c5dde', teamId: 'team-2' }),
        makeParticipant({ participantKey: 'p-dad', localDisplayName: 'Dad', localDisplayColor: '#ffaa55', teamId: 'team-1' }),
      ],
    });
    const entries = buildAvatarEntries(round, makeRosterResolver(rosterOf({}), FALLBACK_COLOR));
    const groups = groupByTeam(entries, round.teams ?? []);

    expect(groups.map((g) => g.teamId)).toEqual(['team-1', 'team-2']);
    expect(groups[0].members.map((m) => m.participantKey)).toEqual(['p-me', 'p-dad']);
    expect(groups[1].members.map((m) => m.participantKey)).toEqual(['p-mike', 'p-sarah']);
    expect(groups[0].teamName).toBe('You & Dad');
    expect(groups[0].teamColor).toBe('#ff8f00');
  });

  test('participant with stray teamId not in round.teams still appears in a group at the end', () => {
    const round = makeRound({
      scoringRule: 'scramble',
      teams: [team1],
      participants: [
        makeParticipant({ participantKey: 'p-me', localDisplayName: 'Me', localDisplayColor: '#ff8f00', teamId: 'team-1' }),
        makeParticipant({ participantKey: 'p-ghost', localDisplayName: 'Ghost', localDisplayColor: '#888', teamId: 'team-deleted' }),
      ],
    });
    const entries = buildAvatarEntries(round, makeRosterResolver(rosterOf({}), FALLBACK_COLOR));
    const groups = groupByTeam(entries, round.teams ?? []);
    expect(groups.map((g) => g.teamId)).toEqual(['team-1', 'team-deleted']);
  });
});

describe('groupByTeam — stroke fallback', () => {
  test('entries with no teamId land in a single null-team group', () => {
    const round = makeRound({
      scoringRule: 'stroke',
      participants: [
        makeParticipant({ participantKey: 'p-mike', localDisplayName: 'Mike', localDisplayColor: '#4a90e2' }),
        makeParticipant({ participantKey: 'p-sarah', localDisplayName: 'Sarah', localDisplayColor: '#9c5dde' }),
      ],
    });
    const entries = buildAvatarEntries(round, makeRosterResolver(rosterOf({}), FALLBACK_COLOR));
    const groups = groupByTeam(entries, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].teamId).toBeNull();
    expect(groups[0].members.map((m) => m.participantKey)).toEqual(['p-mike', 'p-sarah']);
  });
});

describe('truncateEntries', () => {
  function makeEntry(key: string) {
    return {
      participantKey: key,
      name: key,
      color: '#000',
    };
  }

  test('returns the input untouched when below the cap', () => {
    const out = truncateEntries([makeEntry('a'), makeEntry('b')]);
    expect(out.visible).toHaveLength(2);
    expect(out.hiddenCount).toBe(0);
  });

  test('caps at MAX_AVATAR_INDIVIDUALS and reports overflow count', () => {
    const all = ['a', 'b', 'c', 'd', 'e', 'f'].map(makeEntry);
    const out = truncateEntries(all);
    expect(out.visible.map((e) => e.participantKey)).toEqual(['a', 'b', 'c', 'd']);
    expect(out.hiddenCount).toBe(2);
  });

  test('honors custom max parameter', () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map(makeEntry);
    const out = truncateEntries(all, 2);
    expect(out.visible.map((e) => e.participantKey)).toEqual(['a', 'b']);
    expect(out.hiddenCount).toBe(3);
  });
});
