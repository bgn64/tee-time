/**
 * useScreenRefresh — composition primitive shared by every pull-to-
 * refresh surface (Feed, Rounds list, Round detail, Friends, You tab).
 *
 * Behavior pinned by these tests:
 *   · onRefresh runs every supplied refresh fn in parallel.
 *   · Concurrent onRefresh calls short-circuit while one is in flight
 *     (RefreshControl + RefreshButton both pointing at the same hook
 *     shouldn't double-fire).
 *   · Any failure surfaces one combined toast — never one per fn.
 *   · refreshing flips false in a finally so a throw doesn't strand
 *     the spinner.
 *   · A custom failureToast overrides the default copy.
 */

jest.mock('@/state/supabaseClient');

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ToastProvider, useToast } from '@/state/ToastContext';
import { useScreenRefresh } from '@/state/useScreenRefresh';

function ToastWrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useScreenRefresh', () => {
  test('runs every supplied refresh fn on onRefresh and flips refreshing during the call', async () => {
    const fnA = jest.fn().mockResolvedValue({ ok: true });
    const fnB = jest.fn().mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useScreenRefresh([fnA, fnB]), {
      wrapper: ToastWrapper,
    });

    expect(result.current.refreshing).toBe(false);

    await act(async () => {
      await result.current.onRefresh();
    });

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });

  test('concurrent onRefresh calls short-circuit while one is in flight', async () => {
    const d = deferred<{ ok: boolean }>();
    const fn = jest.fn().mockImplementation(() => d.promise);

    const { result } = renderHook(() => useScreenRefresh([fn]), {
      wrapper: ToastWrapper,
    });

    // Kick off the first call but don't await — it suspends on the
    // deferred. While it's pending, fire a second call and verify it
    // becomes a no-op (no fresh fn invocation).
    let firstPromise: Promise<void>;
    await act(async () => {
      firstPromise = result.current.onRefresh();
      await Promise.resolve();
    });

    expect(result.current.refreshing).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.onRefresh();
    });

    // Second call did not invoke the underlying fn.
    expect(fn).toHaveBeenCalledTimes(1);

    // Let the first call complete.
    await act(async () => {
      d.resolve({ ok: true });
      await firstPromise!;
    });

    expect(result.current.refreshing).toBe(false);
  });

  test('shows the combined failure toast when any refresh fn fails', async () => {
    const fnA = jest.fn().mockResolvedValue({ ok: false, error: 'a-err' });
    const fnB = jest.fn().mockResolvedValue({ ok: false, error: 'b-err' });

    const { result } = renderHook(
      () => {
        const refresh = useScreenRefresh([fnA, fnB]);
        const toast = useToast();
        return { refresh, toast };
      },
      { wrapper: ToastWrapper }
    );

    await act(async () => {
      await result.current.refresh.onRefresh();
    });

    // ToastContext is single-slot: one show call → one visible toast,
    // regardless of how many underlying refreshes failed.
    expect(result.current.toast.toast?.message).toBe(
      "Couldn't refresh. Check your connection and try again."
    );
  });

  test('shows the combined toast when ANY (not all) refresh fns fail', async () => {
    const fnOk = jest.fn().mockResolvedValue({ ok: true });
    const fnFail = jest.fn().mockResolvedValue({ ok: false, error: 'partial' });

    const { result } = renderHook(
      () => {
        const refresh = useScreenRefresh([fnOk, fnFail]);
        const toast = useToast();
        return { refresh, toast };
      },
      { wrapper: ToastWrapper }
    );

    await act(async () => {
      await result.current.refresh.onRefresh();
    });

    expect(result.current.toast.toast?.message).toBe(
      "Couldn't refresh. Check your connection and try again."
    );
  });

  test('honors a custom failureToast override', async () => {
    const fn = jest.fn().mockResolvedValue({ ok: false, error: 'boom' });

    const { result } = renderHook(
      () => {
        const refresh = useScreenRefresh([fn], { failureToast: 'Custom copy' });
        const toast = useToast();
        return { refresh, toast };
      },
      { wrapper: ToastWrapper }
    );

    await act(async () => {
      await result.current.refresh.onRefresh();
    });

    expect(result.current.toast.toast?.message).toBe('Custom copy');
  });

  test('does NOT show a toast when every refresh fn returns ok:true', async () => {
    const fnA = jest.fn().mockResolvedValue({ ok: true });
    const fnB = jest.fn().mockResolvedValue({ ok: true });

    const { result } = renderHook(
      () => {
        const refresh = useScreenRefresh([fnA, fnB]);
        const toast = useToast();
        return { refresh, toast };
      },
      { wrapper: ToastWrapper }
    );

    await act(async () => {
      await result.current.refresh.onRefresh();
    });

    expect(result.current.toast.toast).toBeNull();
  });

  test('flips refreshing back to false even if a refresh fn throws', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useScreenRefresh([fn]), {
      wrapper: ToastWrapper,
    });

    // The thrown error bubbles up to onRefresh's caller; we test that
    // the spinner doesn't get stuck regardless.
    await act(async () => {
      await expect(result.current.onRefresh()).rejects.toThrow('network down');
    });

    expect(result.current.refreshing).toBe(false);
  });

  test('no-op when the refresh fn list is empty', async () => {
    const { result } = renderHook(() => useScreenRefresh([]), {
      wrapper: ToastWrapper,
    });

    await act(async () => {
      await result.current.onRefresh();
    });

    expect(result.current.refreshing).toBe(false);
  });
});
