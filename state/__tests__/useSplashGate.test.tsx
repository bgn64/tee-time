/**
 * Tests for the `useSplashGate` one-way latch hook.
 *
 * Regression coverage for the bug where `SocialContext` flipping its
 * `hydrated` flag back to `false` post-mount caused the navigator to
 * unmount and reset to its initial route. The hook must latch on the
 * first all-true transition and never re-engage.
 *
 * The hook is pure (no supabase, no providers), so it is tested in
 * isolation via `renderHook` with no wrapper.
 */

import { act, renderHook } from '@testing-library/react-native';

import { useSplashGate } from '@/state/useSplashGate';

describe('useSplashGate', () => {
  test('returns false when any flag is false', () => {
    const { result } = renderHook(
      ({ flags }: { flags: Record<string, boolean> }) => useSplashGate(flags),
      { initialProps: { flags: { a: true, b: false, c: true } } }
    );
    expect(result.current).toBe(false);
  });

  test('returns true once all flags are true', () => {
    const { result, rerender } = renderHook(
      ({ flags }: { flags: Record<string, boolean> }) => useSplashGate(flags),
      { initialProps: { flags: { a: false, b: false } } }
    );
    expect(result.current).toBe(false);

    act(() => {
      rerender({ flags: { a: true, b: true } });
    });
    expect(result.current).toBe(true);
  });

  test('once latched, stays true after a flag is reset to false (regression)', () => {
    const { result, rerender } = renderHook(
      ({ flags }: { flags: Record<string, boolean> }) => useSplashGate(flags),
      { initialProps: { flags: { a: true, b: true } } }
    );
    expect(result.current).toBe(true);

    act(() => {
      rerender({ flags: { a: true, b: false } });
    });
    expect(result.current).toBe(true);

    act(() => {
      rerender({ flags: { a: false, b: false } });
    });
    expect(result.current).toBe(true);
  });

  test('initial render with all flags true latches immediately', () => {
    const { result } = renderHook(() =>
      useSplashGate({ a: true, b: true, c: true })
    );
    expect(result.current).toBe(true);
  });
});
