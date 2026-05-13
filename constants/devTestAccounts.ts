/**
 * Dev-only test accounts used by the seed script (`scripts/seed-test-users.ts`)
 * and the in-app `DevAccountPicker`. Kept in one place so the picker and the
 * seed always agree on the email + password tuple.
 *
 * These accounts only exist in dev environments — the picker that consumes
 * them is gated behind `__DEV__`. Passwords are hard-coded on purpose: they
 * grant nothing more than an ordinary signed-in user can do, and the
 * convenience of "one click → signed in as Bob" massively outweighs the
 * cost of typing them every time.
 *
 * Add or remove rows freely; the seed script is idempotent.
 */

export type DevTestAccount = {
  /** Lowercased handle. Used as the profile.handle. */
  handle: string;
  email: string;
  password: string;
  displayName: string;
  /** Hex color used for the profile avatar. */
  avatarColor: string;
};

export const DEV_TEST_PASSWORD = 'test-password-123';

export const DEV_TEST_ACCOUNTS: readonly DevTestAccount[] = [
  {
    handle: 'alice',
    email: 'alice@test.local',
    password: DEV_TEST_PASSWORD,
    displayName: 'Alice',
    avatarColor: '#42a5f5',
  },
  {
    handle: 'bob',
    email: 'bob@test.local',
    password: DEV_TEST_PASSWORD,
    displayName: 'Bob',
    avatarColor: '#ab47bc',
  },
  {
    handle: 'carol',
    email: 'carol@test.local',
    password: DEV_TEST_PASSWORD,
    displayName: 'Carol',
    avatarColor: '#7cb342',
  },
  {
    handle: 'dave',
    email: 'dave@test.local',
    password: DEV_TEST_PASSWORD,
    displayName: 'Dave',
    avatarColor: '#ff8f00',
  },
];
