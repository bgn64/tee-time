import {
  buildTeamsFromGroups,
  defaultScrambleGroups,
  deriveTeamColor,
  deriveTeamName,
  joinWithAnd,
} from '@/lib/teams';
import type { Player } from '@/types/golf';

function makeRoster(): Map<string, Player> {
  return new Map<string, Player>([
    ['user', { id: 'user', nickname: 'You', color: '#ff8f00' }],
    ['mike', { id: 'mike', nickname: 'Mike', displayName: 'Mike Chen', color: '#4a90e2' }],
    ['sarah', { id: 'sarah', nickname: 'Sarah', displayName: 'Sarah Lin', color: '#9c5dde' }],
    ['dad', { id: 'dad', nickname: 'Dad' }],
  ]);
}

function resolver(roster: Map<string, Player>) {
  return (id: string) => roster.get(id);
}

describe('joinWithAnd', () => {
  test('empty', () => expect(joinWithAnd([])).toBe(''));
  test('one', () => expect(joinWithAnd(['A'])).toBe('A'));
  test('two', () => expect(joinWithAnd(['A', 'B'])).toBe('A & B'));
  test('three', () => expect(joinWithAnd(['A', 'B', 'C'])).toBe('A, B & C'));
  test('four', () => expect(joinWithAnd(['A', 'B', 'C', 'D'])).toBe('A, B, C & D'));
});

describe('deriveTeamName', () => {
  const roster = makeRoster();
  const r = resolver(roster);

  test('uses firstNameForSelf for the default player when provided', () => {
    expect(deriveTeamName(['user', 'dad'], r, 'user', 'Ben')).toBe('Ben & Dad');
  });

  test('falls back to player nickname for default player when firstNameForSelf is undefined', () => {
    // Default player's roster nickname is "You" in this test fixture,
    // but the helper itself must NOT hardcode the literal "You". It
    // returns whatever the player record exposes via displayName /
    // nickname.
    expect(deriveTeamName(['user', 'dad'], r, 'user')).toBe('You & Dad');
  });

  test('falls back to player nickname when firstNameForSelf is empty string', () => {
    expect(deriveTeamName(['user', 'dad'], r, 'user', '')).toBe('You & Dad');
  });

  test('prefers roster displayName for the default player when no firstNameForSelf', () => {
    const localRoster = new Map<string, Player>([
      ['user', { id: 'user', nickname: 'me', displayName: 'Benjamin Gardner', color: '#ff8f00' }],
      ['dad', { id: 'dad', nickname: 'Dad' }],
    ]);
    expect(
      deriveTeamName(['user', 'dad'], (id) => localRoster.get(id), 'user')
    ).toBe('Benjamin Gardner & Dad');
  });

  test('uses displayName when present, nickname otherwise', () => {
    expect(deriveTeamName(['mike', 'sarah', 'dad'], r, 'user', 'Ben')).toBe(
      'Mike Chen, Sarah Lin & Dad'
    );
  });

  test('singleton', () => {
    expect(deriveTeamName(['user'], r, 'user', 'Ben')).toBe('Ben');
    expect(deriveTeamName(['dad'], r, 'user', 'Ben')).toBe('Dad');
  });

  test('empty', () => {
    expect(deriveTeamName([], r, 'user', 'Ben')).toBe('Empty group');
  });

  test('no defaultPlayer ignores firstNameForSelf', () => {
    expect(deriveTeamName(['user', 'mike'], r, null, 'Ben')).toBe('You & Mike Chen');
  });
});

describe('deriveTeamColor', () => {
  const roster = makeRoster();
  const r = resolver(roster);

  test('prefers default-player color when present', () => {
    expect(deriveTeamColor(['user', 'mike'], r, 'user', 0)).toBe('#ff8f00');
  });

  test('falls back to first member with a color', () => {
    expect(deriveTeamColor(['dad', 'mike'], r, 'user', 0)).toBe('#4a90e2');
  });

  test('falls back to palette when no member has a color', () => {
    const noColors = new Map<string, Player>([
      ['a', { id: 'a', nickname: 'A' }],
      ['b', { id: 'b', nickname: 'B' }],
    ]);
    expect(deriveTeamColor(['a', 'b'], (id) => noColors.get(id), null, 0)).toBe(
      '#7cb342'
    );
    expect(deriveTeamColor(['a', 'b'], (id) => noColors.get(id), null, 1)).toBe(
      '#4a90e2'
    );
  });
});

describe('defaultScrambleGroups', () => {
  test('zero players', () => expect(defaultScrambleGroups([])).toEqual([]));
  test('one player', () => expect(defaultScrambleGroups(['a'])).toEqual([['a']]));
  test('two players → 1-1', () =>
    expect(defaultScrambleGroups(['a', 'b'])).toEqual([['a'], ['b']]));
  test('three players → 2-1', () =>
    expect(defaultScrambleGroups(['a', 'b', 'c'])).toEqual([
      ['a', 'c'],
      ['b'],
    ]));
  test('four players → 2-2', () =>
    expect(defaultScrambleGroups(['a', 'b', 'c', 'd'])).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]));
});

describe('buildTeamsFromGroups', () => {
  const roster = makeRoster();
  const r = resolver(roster);

  test('produces a Team per group with derived name + color', () => {
    const teams = buildTeamsFromGroups(
      [
        ['user', 'dad'],
        ['mike', 'sarah'],
      ],
      r,
      'user',
      [],
      'Ben'
    );
    expect(teams).toHaveLength(2);
    expect(teams[0].name).toBe('Ben & Dad');
    expect(teams[0].color).toBe('#ff8f00');
    expect(teams[0].playerIds).toEqual(['user', 'dad']);
    expect(teams[1].name).toBe('Mike Chen & Sarah Lin');
    expect(teams[1].color).toBe('#4a90e2');
  });

  test('threads firstNameForSelf through to deriveTeamName', () => {
    const teams = buildTeamsFromGroups(
      [['user', 'dad']],
      r,
      'user',
      [],
      'Alex'
    );
    expect(teams[0].name).toBe('Alex & Dad');
  });

  test('omitting firstNameForSelf falls back to roster nickname (not "You" literal from helper)', () => {
    const localRoster = new Map<string, Player>([
      ['user', { id: 'user', nickname: 'me', displayName: 'Benjamin Gardner', color: '#ff8f00' }],
      ['dad', { id: 'dad', nickname: 'Dad' }],
    ]);
    const teams = buildTeamsFromGroups(
      [['user', 'dad']],
      (id) => localRoster.get(id),
      'user',
      []
    );
    expect(teams[0].name).toBe('Benjamin Gardner & Dad');
  });

  test('reuses existingTeamIds when provided', () => {
    const teams = buildTeamsFromGroups(
      [['user'], ['mike', 'sarah']],
      r,
      'user',
      ['stable-1', 'stable-2'],
      'Ben'
    );
    expect(teams[0].id).toBe('stable-1');
    expect(teams[1].id).toBe('stable-2');
  });

  test('generates fresh ids when existing slot is missing', () => {
    const teams = buildTeamsFromGroups(
      [['user'], ['mike']],
      r,
      'user',
      ['stable-1'],
      'Ben'
    );
    expect(teams[0].id).toBe('stable-1');
    expect(teams[1].id).toMatch(/^team-2-/);
  });
});
