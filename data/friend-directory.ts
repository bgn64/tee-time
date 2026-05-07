/**
 * Stub friend directory — seed users the search-by-handle screen can find.
 *
 * Three of these entries map to the existing seed Players (`@mike.c` / Mike,
 * `@skim` / Sarah, `@daveg` / Dave) so a Ben who wants to friend his usual
 * golf buddies can find them via the same handle-search the real backend
 * will eventually serve. The rest (`@nina`, `@lee.wong`, `@alex.p`,
 * `@jamie.lee`) have no roster counterpart and exercise the "create a fresh
 * Player on accept" code path.
 *
 * userIds are stable strings rather than UUIDs so log lines stay readable
 * during stub testing.
 */

import { StubDirectoryEntry } from '@/types/social';

export const STUB_FRIEND_DIRECTORY: StubDirectoryEntry[] = [
  {
    userId: 'stub-mike',
    handle: 'mike.c',
    displayName: 'Mike Chen',
    avatarColor: '#42a5f5',
    joinedAt: '2026-04-12T00:00:00.000Z',
    seedPlayerId: 'mike',
  },
  {
    userId: 'stub-sarah',
    handle: 'skim',
    displayName: 'Sarah Kim',
    avatarColor: '#ab47bc',
    joinedAt: '2026-03-18T00:00:00.000Z',
    seedPlayerId: 'sarah',
  },
  {
    userId: 'stub-dave',
    handle: 'daveg',
    displayName: 'Dave Garcia',
    avatarColor: '#ff8f00',
    joinedAt: '2026-04-02T00:00:00.000Z',
    seedPlayerId: 'dave',
  },
  {
    userId: 'stub-nina',
    handle: 'nina',
    displayName: 'Nina Patel',
    avatarColor: '#10b981',
    joinedAt: '2026-04-28T00:00:00.000Z',
  },
  {
    userId: 'stub-lee',
    handle: 'lee.wong',
    displayName: 'Lee Wong',
    avatarColor: '#ec4899',
    joinedAt: '2026-04-30T00:00:00.000Z',
  },
  {
    userId: 'stub-alex',
    handle: 'alex.p',
    displayName: 'Alex Park',
    avatarColor: '#9c5dde',
    joinedAt: '2026-04-15T00:00:00.000Z',
  },
  {
    userId: 'stub-jamie',
    handle: 'jamie.lee',
    displayName: 'Jamie Lee',
    avatarColor: '#7cb342',
    joinedAt: '2026-04-22T00:00:00.000Z',
  },
];
