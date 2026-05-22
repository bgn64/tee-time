/**
 * Unit tests for the shared cloud-sync helpers in `state/cloudSync.ts`.
 *
 * The four domain contexts (Account, Player, GolfRound, Social) all
 * adopt these primitives; the contracts pinned here are the same
 * ones their own tests previously asserted in scattered form.
 */

import { act, renderHook } from '@testing-library/react-native';

import {
  useOneShotSyncOnSignIn,
  useRefreshGeneration,
} from '@/state/cloudSync';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useOneShotSyncOnSignIn', () => {
  test('does not call sync while ready is false', async () => {
    const sync = jest.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useOneShotSyncOnSignIn({
        accountUserId: 'u-1',
        ready: false,
        sync,
      })
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).not.toHaveBeenCalled();
  });

  test('calls sync exactly once per signed-in user when ready', async () => {
    const sync = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      (props: { accountUserId: string | null; ready: boolean }) =>
        useOneShotSyncOnSignIn({ ...props, sync }),
      { initialProps: { accountUserId: 'u-1', ready: true } }
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith('u-1');

    // Re-render with same user id — no re-invocation.
    rerender({ accountUserId: 'u-1', ready: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test('re-arms after sign-out and fires again on next sign-in', async () => {
    const sync = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      (props: { accountUserId: string | null }) =>
        useOneShotSyncOnSignIn({ ...props, ready: true, sync }),
      { initialProps: { accountUserId: 'u-1' } }
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(1);

    // Sign out: sentinel re-arms.
    rerender({ accountUserId: null });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(1);

    // Sign in as a DIFFERENT user — fires.
    rerender({ accountUserId: 'u-2' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenLastCalledWith('u-2');
  });

  test('re-arms after sign-out and fires again on RE-sign-in as same user', async () => {
    const sync = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      (props: { accountUserId: string | null }) =>
        useOneShotSyncOnSignIn({ ...props, ready: true, sync }),
      { initialProps: { accountUserId: 'u-1' } }
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(1);

    rerender({ accountUserId: null });
    await act(async () => {
      await Promise.resolve();
    });
    rerender({ accountUserId: 'u-1' });
    await act(async () => {
      await Promise.resolve();
    });

    // Same user signed back in: fresh pull required.
    expect(sync).toHaveBeenCalledTimes(2);
  });

  test('a churning sync identity does not trigger duplicate runs for the same user', async () => {
    let callCount = 0;
    const { rerender } = renderHook(
      () =>
        useOneShotSyncOnSignIn({
          accountUserId: 'u-1',
          ready: true,
          sync: async () => {
            callCount += 1;
          },
        })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(callCount).toBe(1);

    // Force several re-renders with fresh closure identities each time.
    rerender({});
    rerender({});
    rerender({});
    await act(async () => {
      await Promise.resolve();
    });
    expect(callCount).toBe(1);
  });
});

describe('useRefreshGeneration', () => {
  test('begin returns monotonically increasing tokens', () => {
    const { result } = renderHook(() => useRefreshGeneration());
    expect(result.current.begin()).toBe(1);
    expect(result.current.begin()).toBe(2);
    expect(result.current.begin()).toBe(3);
  });

  test('isStale returns false for the latest token, true for older ones', () => {
    const { result } = renderHook(() => useRefreshGeneration());
    const t1 = result.current.begin();
    expect(result.current.isStale(t1)).toBe(false);

    const t2 = result.current.begin();
    expect(result.current.isStale(t1)).toBe(true);
    expect(result.current.isStale(t2)).toBe(false);
  });

  test('the returned object identity stays stable across renders', () => {
    const { result, rerender } = renderHook(() => useRefreshGeneration());
    const before = result.current;
    rerender({});
    expect(result.current).toBe(before);
  });

  test('latest-response-wins under overlapping awaits', async () => {
    const { result } = renderHook(() => useRefreshGeneration());

    const writes: string[] = [];
    const d1 = deferred<void>();
    const d2 = deferred<void>();

    // Refresh #1: begins, suspends on d1, then writes if not stale.
    const refresh1 = (async () => {
      const myToken = result.current.begin();
      await d1.promise;
      if (result.current.isStale(myToken)) return;
      writes.push('1');
    })();

    // Refresh #2: begins (bumps gen), suspends on d2, then writes.
    const refresh2 = (async () => {
      const myToken = result.current.begin();
      await d2.promise;
      if (result.current.isStale(myToken)) return;
      writes.push('2');
    })();

    // Resolve #2 first — it should write (it's the latest).
    d2.resolve();
    await refresh2;
    expect(writes).toEqual(['2']);

    // Now resolve #1 — its token is stale; it must skip the write.
    d1.resolve();
    await refresh1;
    expect(writes).toEqual(['2']);
  });
});
