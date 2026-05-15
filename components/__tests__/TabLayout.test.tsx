/**
 * TabLayout — Phase 2.2 re-tap pop-to-root listener.
 *
 * The listener factory `makeTabRetapListener` is a pure function: it takes
 * the current `useSegments()` array and a tab group name, and returns a
 * `{ tabPress }` listener object. That lets us validate the behavior
 * without rendering the navigator (the jest mock of expo-router renders
 * `Tabs.Screen` as a no-op, so the navigator never actually invokes the
 * listener prop in tests).
 *
 * Pathname-shape notes (verified against expo-router v6 + the local
 * router.d.ts under `.expo/types/`):
 *   - `usePathname()` strips route groups, so the You/Rounds/Feed/Score
 *     index routes all collapse to `/`, and `app/(tabs)/(rounds)/[id].tsx`
 *     resolves to `/<id>` — indistinguishable from any other single-segment
 *     top-level route by pathname alone. The pre-existing
 *     `pathname.startsWith('/auth')` and `pathname === '/sign-in'` call
 *     sites in `app/_layout.tsx` corroborate the stripped form.
 *   - `useSegments()` keeps the route-group prefixes, so a Rounds detail
 *     is `['(tabs)', '(rounds)', '[id]']`. That's what the helper checks.
 *
 * Even though TabLayout doesn't directly touch Supabase, the providers it
 * pulls in transitively do, so the supabase client must be mocked at the
 * top of the file (same pattern as the other component tests).
 */

jest.mock('@/state/supabaseClient');

import { router } from 'expo-router';

import { makeTabRetapListener } from '@/app/(tabs)/_layout';

beforeEach(() => {
  (router.replace as jest.Mock).mockClear();
});

describe('makeTabRetapListener', () => {
  describe('(you) tab', () => {
    test('pops to root when on a direct child route (/friends)', () => {
      const listener = makeTabRetapListener(['(tabs)', '(you)', 'friends'], '(you)');
      const e = { preventDefault: jest.fn() };

      listener.tabPress(e);

      expect(e.preventDefault).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/(you)');
    });

    test('pops to root when nested deeper (/friends/[id])', () => {
      const listener = makeTabRetapListener(
        ['(tabs)', '(you)', 'friends', '[id]'],
        '(you)',
      );
      const e = { preventDefault: jest.fn() };

      listener.tabPress(e);

      expect(e.preventDefault).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/(you)');
    });

    test('is a no-op when already at the You root', () => {
      const listener = makeTabRetapListener(['(tabs)', '(you)'], '(you)');
      const e = { preventDefault: jest.fn() };

      listener.tabPress(e);

      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    test('is a no-op when the user is currently inside a different tab', () => {
      // User is on /(tabs)/(score)/scoring and taps the You tab — we must
      // not pre-empt the navigator's default switch-tab behavior.
      const listener = makeTabRetapListener(
        ['(tabs)', '(score)', 'scoring'],
        '(you)',
      );
      const e = { preventDefault: jest.fn() };

      listener.tabPress(e);

      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });
  });

  describe('(rounds) tab', () => {
    test('pops to root when on a round detail route', () => {
      const listener = makeTabRetapListener(
        ['(tabs)', '(rounds)', '[id]'],
        '(rounds)',
      );
      const e = { preventDefault: jest.fn() };

      listener.tabPress(e);

      expect(e.preventDefault).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/(rounds)');
    });

    test('is a no-op when already at the Rounds root', () => {
      const listener = makeTabRetapListener(['(tabs)', '(rounds)'], '(rounds)');
      const e = { preventDefault: jest.fn() };

      listener.tabPress(e);

      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    test('is a no-op when currently inside a different tab', () => {
      const listener = makeTabRetapListener(
        ['(tabs)', '(you)', 'friends'],
        '(rounds)',
      );
      const e = { preventDefault: jest.fn() };

      listener.tabPress(e);

      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });
  });

  test('is a no-op when segments is empty (uninitialized navigator)', () => {
    // The jest mock for `useSegments` returns `[]` by default; the helper
    // must tolerate that without exploding or popping anything.
    const listener = makeTabRetapListener([], '(you)');
    const e = { preventDefault: jest.fn() };

    listener.tabPress(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('is a no-op when segments are outside the (tabs) group entirely', () => {
    // E.g. the user is on /sign-in or /onboarding/account and somehow a
    // tab-press fires — never pop in that case.
    const listener = makeTabRetapListener(
      ['onboarding', 'account'],
      '(you)',
    );
    const e = { preventDefault: jest.fn() };

    listener.tabPress(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
