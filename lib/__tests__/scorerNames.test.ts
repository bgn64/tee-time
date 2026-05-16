/**
 * Tests for `lib/scorerNames.ts` — the helper that drives both the
 * Final-box and the live-scoring entry-row's tappable name rendering.
 *
 * Covers all four scenarios touched by the "rendered as You" bug fix:
 *   · Stroke, signed-in user's own row → linked + first-name + routes
 *     to defaultPlayerId (so the YOU badge shows).
 *   · Stroke, other linked friend → linked + first-name + routes to userId.
 *   · Stroke, live-scoring round where the participant has no
 *     `linkedUserId` baked yet but the roster carries a `userId` →
 *     still resolves as linked via the roster fallback.
 *   · Stroke, local-only participant (no userId anywhere) → unlinked
 *     plain segment, still first-name resolved.
 *   · Scramble teams → interleaved segments with " & " / ", "
 *     separators between linkable member names.
 */

import {
  buildNameSegments,
  flattenSegments,
  participantSegment,
} from '@/lib/scorerNames';
import type { Account } from '@/types/account';
import type { Player, RoundParticipant } from '@/types/golf';
import type { ProfileSummary } from '@/types/social';

const meAccount: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  provider: 'email',
  email: 'me@example.com',
  handle: 'me',
  displayName: 'Alice Anderson',
  avatarColor: '#ff5500',
  createdAt: '2025-01-01T00:00:00Z',
};

const bobProfile: ProfileSummary = {
  userId: '22222222-2222-2222-2222-222222222222',
  handle: 'bob',
  displayName: 'Bob Builder',
  avatarColor: '#00aa00',
};

const carolProfile: ProfileSummary = {
  userId: '33333333-3333-3333-3333-333333333333',
  handle: 'carol',
  displayName: 'Carol Coltrane',
  avatarColor: '#0066cc',
};

const defaultPlayerId = 'player-self';

const baseDeps = {
  account: meAccount,
  profileCache: {
    [bobProfile.userId]: bobProfile,
    [carolProfile.userId]: carolProfile,
  },
  allPlayers: [
    { id: defaultPlayerId, nickname: 'me', userId: meAccount.userId, color: '#ff5500' },
    { id: 'player-bob', nickname: 'Bobby', userId: bobProfile.userId, color: '#00aa00' },
    { id: 'player-carol', nickname: 'C', userId: carolProfile.userId, color: '#0066cc' },
    { id: 'player-dan', nickname: 'Dan Local', color: '#888888' },
  ] as Player[],
  defaultPlayerId,
};

describe('participantSegment', () => {
  test("signed-in user's own participant → linked, first name, routes to defaultPlayerId", () => {
    const p: RoundParticipant = {
      participantKey: defaultPlayerId,
      linkedUserId: meAccount.userId,
    };
    const seg = participantSegment(p, baseDeps);
    expect(seg).toEqual({
      text: 'Alice',
      linked: true,
      linkTargetId: defaultPlayerId,
      color: '#ff5500',
    });
  });

  test('other linked friend (profileCache hit) → linked, first name, routes to userId', () => {
    const p: RoundParticipant = {
      participantKey: 'player-bob',
      linkedUserId: bobProfile.userId,
    };
    const seg = participantSegment(p, baseDeps);
    expect(seg.text).toBe('Bob');
    expect(seg.linked).toBe(true);
    expect(seg.linkTargetId).toBe(bobProfile.userId);
    expect(seg.color).toBe('#00aa00');
  });

  test('live-scoring participant (no linkedUserId baked) → roster userId fallback links the row', () => {
    // Simulates what `startRound` writes — only participantKey + teeId/teamId.
    const p: RoundParticipant = {
      participantKey: 'player-bob',
    };
    const seg = participantSegment(p, baseDeps);
    expect(seg.linked).toBe(true);
    expect(seg.linkTargetId).toBe(bobProfile.userId);
    expect(seg.text).toBe('Bob');
  });

  test('live-scoring viewer themselves (no linkedUserId, defaultPlayerId match) → linked to defaultPlayerId', () => {
    const p: RoundParticipant = {
      participantKey: defaultPlayerId,
    };
    const seg = participantSegment(p, baseDeps);
    expect(seg.linked).toBe(true);
    expect(seg.linkTargetId).toBe(defaultPlayerId);
    expect(seg.text).toBe('Alice');
  });

  test('local-only participant (no userId anywhere) → unlinked, first-name resolved', () => {
    const p: RoundParticipant = {
      participantKey: 'player-dan',
      localDisplayName: 'Daniel Defoe',
      localDisplayColor: '#777',
    };
    const seg = participantSegment(p, baseDeps);
    expect(seg).toEqual({
      text: 'Daniel',
      linked: false,
      linkTargetId: null,
      color: '#777',
    });
  });

  test('local-only participant without snapshot → falls back to roster nickname', () => {
    const p: RoundParticipant = {
      participantKey: 'player-dan',
    };
    const seg = participantSegment(p, baseDeps);
    // Roster nickname "Dan Local" → first name "Dan"
    expect(seg.text).toBe('Dan');
    expect(seg.linked).toBe(false);
  });

  test('participant with no resolvable identity → "Player" sentinel, unlinked', () => {
    const p: RoundParticipant = { participantKey: 'unknown-id' };
    const seg = participantSegment(p, baseDeps);
    expect(seg.linked).toBe(false);
    expect(seg.text).toBe('Player');
  });

  test('legacy seed-roster id ("user") with non-uuid userId is NOT treated as a routable account', () => {
    const deps = {
      ...baseDeps,
      account: null,
      defaultPlayerId: 'user',
      allPlayers: [
        // Legacy sentinel — userId is a literal "user", not a uuid.
        { id: 'user', nickname: 'You', color: '#7cb342', userId: 'user' },
      ] as Player[],
    };
    const p: RoundParticipant = { participantKey: 'user' };
    const seg = participantSegment(p, deps);
    // isMeByDefault triggers (defaultPlayerId match) → linked to defaultPlayerId.
    // But the legacy roster userId "user" must NOT leak through as a linkTarget.
    expect(seg.linkTargetId).toBe('user');
    expect(seg.linked).toBe(true);
  });
});

describe('buildNameSegments', () => {
  test('empty list → []', () => {
    expect(buildNameSegments([], baseDeps)).toEqual([]);
  });

  test('single participant → single segment', () => {
    const segs = buildNameSegments(
      [{ participantKey: defaultPlayerId, linkedUserId: meAccount.userId }],
      baseDeps
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('Alice');
    expect(flattenSegments(segs)).toBe('Alice');
  });

  test('two participants → "<a> & <b>" with each name independently linked', () => {
    const segs = buildNameSegments(
      [
        { participantKey: defaultPlayerId, linkedUserId: meAccount.userId },
        { participantKey: 'player-bob', linkedUserId: bobProfile.userId },
      ],
      baseDeps
    );
    expect(segs).toHaveLength(3);
    expect(flattenSegments(segs)).toBe('Alice & Bob');
    expect(segs[0].linked).toBe(true);
    expect(segs[0].linkTargetId).toBe(defaultPlayerId);
    expect(segs[1].linked).toBe(false); // separator
    expect(segs[1].text).toBe(' & ');
    expect(segs[2].linked).toBe(true);
    expect(segs[2].linkTargetId).toBe(bobProfile.userId);
  });

  test('three participants → "<a>, <b> & <c>"', () => {
    const segs = buildNameSegments(
      [
        { participantKey: defaultPlayerId, linkedUserId: meAccount.userId },
        { participantKey: 'player-bob', linkedUserId: bobProfile.userId },
        { participantKey: 'player-carol', linkedUserId: carolProfile.userId },
      ],
      baseDeps
    );
    expect(flattenSegments(segs)).toBe('Alice, Bob & Carol');
    // Each name segment is linked; the two separators (", " and " & ") are not.
    expect(segs.filter((s) => s.linked).length).toBe(3);
    expect(segs.filter((s) => !s.linked).length).toBe(2);
  });

  test('mixed linked + local team — local member renders as plain (non-linked) segment', () => {
    const segs = buildNameSegments(
      [
        { participantKey: defaultPlayerId, linkedUserId: meAccount.userId },
        { participantKey: 'player-dan', localDisplayName: 'Daniel Defoe' },
      ],
      baseDeps
    );
    expect(flattenSegments(segs)).toBe('Alice & Daniel');
    expect(segs[0].linked).toBe(true);
    expect(segs[2].linked).toBe(false);
  });

  test('cross-device view — viewer (Alice) sees B-owned scramble team WITHOUT "You" leaking through', () => {
    // The bug under test: a round whose `team.name` was baked as "You & Bob"
    // by the owner's device. buildNameSegments must never produce "You".
    const owner: Account = {
      ...meAccount,
      userId: 'BBBBBBBB-2222-3333-4444-555555555555',
      displayName: 'Brett Bowman',
    };
    // Viewer (Alice) viewing a team that contains the owner (Brett) +
    // a local guest (Greg). Alice has Brett in her profileCache (he's
    // her friend). Greg is local-only on Brett's device.
    const viewerDeps = {
      account: meAccount,
      profileCache: {
        [owner.userId]: {
          userId: owner.userId,
          handle: 'brett',
          displayName: 'Brett Bowman',
          avatarColor: '#000',
        },
      },
      allPlayers: [
        { id: defaultPlayerId, nickname: 'me', userId: meAccount.userId, color: '#ff5500' },
      ] as Player[],
      defaultPlayerId,
    };
    const segs = buildNameSegments(
      [
        { participantKey: 'p-brett', linkedUserId: owner.userId },
        {
          participantKey: 'p-greg',
          localDisplayName: 'Greg Guest',
          localDisplayColor: '#444',
        },
      ],
      viewerDeps
    );
    expect(flattenSegments(segs)).toBe('Brett & Greg');
    expect(flattenSegments(segs)).not.toContain('You');
  });
});
