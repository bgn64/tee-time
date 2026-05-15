/**
 * RootLayout integration smoke test (refactor plan Phase 1.2,
 * follow-up f4-root-layout-test).
 *
 * The companion `useSplashGate.test.tsx` verifies that the one-way
 * latch hook never re-engages once flipped. That covers the gate in
 * isolation. The regression we actually shipped against, however,
 * was at the integration layer: a `SocialContext` re-pull triggered
 * by `TOKEN_REFRESHED` flipped `hydrated` back to `false`, the splash
 * gate honoured the flip and rendered `null`, which unmounted the
 * navigator and reset the user's location in the app.
 *
 * The hook test cannot catch a regression where a future change makes
 * one of the providers itself conditionally render its children, or
 * makes the provider tree's component identity unstable. This file
 * pins that property: a probe component mounted inside the real
 * `AllProviders` tree is not remounted when we force a SocialContext
 * re-pull via the auth-event emitter (`TOKEN_REFRESHED`, `SIGNED_OUT`,
 * or an outer state change).
 *
 * "Remounted" is measured by `mountCount` — incremented inside a
 * `useEffect(() => { ... }, [])`. Render count will (correctly) tick
 * on parent re-renders; mount count only ticks on unmount→mount
 * cycles, which is the actual invariant.
 *
 * We deliberately do NOT render the real `RootLayoutNav` from
 * `app/_layout.tsx` here. It imports `Stack` / `usePathname` from
 * expo-router; mocking those deeply enough to mount is more work
 * than the value. The underlying property under test is the
 * provider tree itself, which `AllProviders` mirrors exactly.
 */

jest.mock('@/state/supabaseClient');

import { act, render } from '@testing-library/react-native';
import { useEffect, useState } from 'react';

import {
  AllProviders,
  renderWithProviders,
  mockSupabaseReset,
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
  mockSupabaseEmitAuthEvent,
} from './test-utils';

// =============================================================================
// Probe component
// =============================================================================

type ProbeMountTracker = {
  mountCount: number;
  renderCount: number;
};

function Probe({ tracker }: { tracker: ProbeMountTracker }) {
  tracker.renderCount++;
  useEffect(() => {
    tracker.mountCount++;
  }, []);
  return null;
}

// =============================================================================
// Helpers
// =============================================================================

/** Match the four-tick flush used by `AccountContext.test.tsx`. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeSession(userId = 'u-test', email = 't@e.com') {
  // Fresh object literal each call so we exercise the
  // reference-vs-value distinction the regression cares about.
  return {
    access_token: 'tok-' + Math.random().toString(36).slice(2),
    user: { id: userId, email, user_metadata: {} },
  };
}

const baseProfile = {
  user_id: 'u-test',
  handle: 't',
  display_name: 'T',
  avatar_color: '#ffffff',
  created_at: '2025-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mockSupabaseReset();
});

// =============================================================================
// Tests
// =============================================================================

describe('RootLayout integration — provider tree stability', () => {
  test('TOKEN_REFRESHED with identical session does not remount children', async () => {
    mockSupabaseSeedSession(makeSession());
    mockSupabaseSeedTable('profiles', [baseProfile]);

    const tracker: ProbeMountTracker = { mountCount: 0, renderCount: 0 };
    renderWithProviders(<Probe tracker={tracker} />);

    // Let AccountContext.refreshFromSession + SocialContext initial
    // pull settle so we're testing the steady-state invariant, not
    // an initial-render race.
    await flushMicrotasks();

    const initialMounts = tracker.mountCount;
    expect(initialMounts).toBeGreaterThanOrEqual(1);

    // Force a TOKEN_REFRESHED event with a brand-new session object
    // but the same user id. This is the exact regression trigger:
    // supabase fires this ~hourly even when nothing has changed.
    await act(async () => {
      mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', makeSession());
    });
    await flushMicrotasks();

    expect(tracker.mountCount).toBe(initialMounts);
  });

  test('multiple TOKEN_REFRESHED events after full hydration still do not remount', async () => {
    // Seed the full social surface so the providers have something
    // to pull and finish all their initial work before we start
    // firing token refreshes.
    mockSupabaseSeedSession(makeSession());
    mockSupabaseSeedTable('profiles', [baseProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', []);
    mockSupabaseSeedTable('roster_players', []);
    mockSupabaseSeedTable('scorecards', []);

    const tracker: ProbeMountTracker = { mountCount: 0, renderCount: 0 };
    renderWithProviders(<Probe tracker={tracker} />);

    await flushMicrotasks();
    // A second flush — belt and suspenders for any provider that
    // chains its initial pulls behind account hydration.
    await flushMicrotasks();

    const initialMounts = tracker.mountCount;
    expect(initialMounts).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', makeSession());
      });
      await flushMicrotasks();
    }

    expect(tracker.mountCount).toBe(initialMounts);
  });

  test('SIGNED_OUT does not remount children (splash gate stays open)', async () => {
    // Start signed-in.
    mockSupabaseSeedSession(makeSession());
    mockSupabaseSeedTable('profiles', [baseProfile]);
    mockSupabaseSeedTable('friendships', []);
    mockSupabaseSeedTable('friend_requests', []);

    const tracker: ProbeMountTracker = { mountCount: 0, renderCount: 0 };
    renderWithProviders(<Probe tracker={tracker} />);

    await flushMicrotasks();

    const initialMounts = tracker.mountCount;
    expect(initialMounts).toBeGreaterThanOrEqual(1);

    // Sign out. SocialContext clears its state but `hydrated`
    // stays latched (verified separately in SocialContext.test.tsx),
    // and the provider tree itself should pass its children through
    // unchanged — nothing in `AllProviders` is conditional on auth.
    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
    });
    await flushMicrotasks();

    expect(tracker.mountCount).toBe(initialMounts);
  });

  test('outer parent re-render does not remount the probe (sanity check)', async () => {
    // Test 4: sanity-check that nothing in `AllProviders` (which now
    // includes a ToastProvider added by the f1-toast follow-up) breaks
    // React's standard guarantee that a parent useState toggle does
    // not remount stable children. If this fails, all three tests
    // above are suspect.
    mockSupabaseSeedSession(makeSession());
    mockSupabaseSeedTable('profiles', [baseProfile]);

    const tracker: ProbeMountTracker = { mountCount: 0, renderCount: 0 };

    let toggleOuter: ((v: boolean) => void) | null = null;

    function OuterWithState({ tracker: t }: { tracker: ProbeMountTracker }) {
      const [, setFlag] = useState(false);
      toggleOuter = setFlag;
      return <Probe tracker={t} />;
    }

    render(
      <AllProviders>
        <OuterWithState tracker={tracker} />
      </AllProviders>
    );

    await flushMicrotasks();

    const initialMounts = tracker.mountCount;
    expect(initialMounts).toBeGreaterThanOrEqual(1);

    await act(async () => {
      toggleOuter?.(true);
    });
    await act(async () => {
      toggleOuter?.(false);
    });
    await flushMicrotasks();

    expect(tracker.mountCount).toBe(initialMounts);
  });
});
