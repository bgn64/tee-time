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

  test('uses "You" for the default player', () => {
    expect(deriveTeamName(['user', 'dad'], r, 'user')).toBe('You & Dad');
  });

  test('uses displayName when present, nickname otherwise', () => {
    expect(deriveTeamName(['mike', 'sarah', 'dad'], r, 'user')).toBe(
      'Mike Chen, Sarah Lin & Dad'
    );
  });

  test('singleton', () => {
    expect(deriveTeamName(['user'], r, 'user')).toBe('You');
    expect(deriveTeamName(['dad'], r, 'user')).toBe('Dad');
  });

  test('empty', () => {
    expect(deriveTeamName([], r, 'user')).toBe('Empty group');
  });

  test('no defaultPlayer', () => {
    expect(deriveTeamName(['user', 'mike'], r, null)).toBe('You & Mike Chen');
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
      []
    );
    expect(teams).toHaveLength(2);
    expect(teams[0].name).toBe('You & Dad');
    expect(teams[0].color).toBe('#ff8f00');
    expect(teams[0].playerIds).toEqual(['user', 'dad']);
    expect(teams[1].name).toBe('Mike Chen & Sarah Lin');
    expect(teams[1].color).toBe('#4a90e2');
  });

  test('reuses existingTeamIds when provided', () => {
    const teams = buildTeamsFromGroups(
      [['user'], ['mike', 'sarah']],
      r,
      'user',
      ['stable-1', 'stable-2']
    );
    expect(teams[0].id).toBe('stable-1');
    expect(teams[1].id).toBe('stable-2');
  });

  test('generates fresh ids when existing slot is missing', () => {
    const teams = buildTeamsFromGroups(
      [['user'], ['mike']],
      r,
      'user',
      ['stable-1']
    );
    expect(teams[0].id).toBe('stable-1');
    expect(teams[1].id).toMatch(/^team-2-/);
  });
});
