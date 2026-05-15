/**
 * ToastContext — single-slot toast surface used to surface offline
 * write-queue dead-letter failures and other transient signals.
 *
 * These tests pin the contract the rest of the toast machinery depends
 * on:
 *   · `show()` populates `toast`; `dismiss()` clears it.
 *   · A second `show()` while one is visible REPLACES the previous
 *     (single slot, no queueing).
 *   · Auto-hide fires after `autoHideMs` (default 4000; overridable per
 *     call).
 *   · The action object is exposed verbatim — onPress is the caller's
 *     responsibility, the context doesn't auto-dismiss after onPress.
 */

import { act, renderHook } from '@testing-library/react-native';

import { ToastProvider, useToast } from '@/state/ToastContext';

describe('ToastContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('show() populates toast; dismiss() clears it', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });

    expect(result.current.toast).toBeNull();

    act(() => {
      result.current.show('Hello');
    });

    expect(result.current.toast).not.toBeNull();
    expect(result.current.toast?.message).toBe('Hello');
    expect(result.current.toast?.autoHideMs).toBe(4000);
    expect(result.current.toast?.action).toBeUndefined();

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.toast).toBeNull();
  });

  test('a second show() while visible replaces the prior toast (single slot)', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });

    act(() => {
      result.current.show('First');
    });

    const firstId = result.current.toast?.id;
    expect(result.current.toast?.message).toBe('First');

    act(() => {
      result.current.show('Second');
    });

    expect(result.current.toast?.message).toBe('Second');
    expect(result.current.toast?.id).not.toBe(firstId);
  });

  test('auto-hides after the default autoHideMs (4000)', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });

    act(() => {
      result.current.show('Will vanish');
    });
    expect(result.current.toast).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(result.current.toast).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBeNull();
  });

  test('auto-hides after a custom autoHideMs (e.g. 8000 for the dead-letter toast)', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });

    act(() => {
      result.current.show('Long-lived', { autoHideMs: 8000 });
    });
    expect(result.current.toast?.autoHideMs).toBe(8000);

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(result.current.toast).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(result.current.toast).toBeNull();
  });

  test('replacing a toast resets the auto-hide timer', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });

    act(() => {
      result.current.show('First', { autoHideMs: 4000 });
    });

    // Advance past the first toast's would-be hide moment, but replace
    // it just before. The replacement should get its own full window.
    act(() => {
      jest.advanceTimersByTime(3000);
      result.current.show('Second', { autoHideMs: 4000 });
    });

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    // First toast's original 4000ms has elapsed — but Second replaced it,
    // so we should still see Second.
    expect(result.current.toast?.message).toBe('Second');

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(result.current.toast).toBeNull();
  });

  test('exposes the action object verbatim and the onPress is callable', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });

    const onPress = jest.fn();

    act(() => {
      result.current.show('With action', {
        action: { label: 'Retry', onPress },
        autoHideMs: 8000,
      });
    });

    expect(result.current.toast?.action?.label).toBe('Retry');
    expect(typeof result.current.toast?.action?.onPress).toBe('function');

    act(() => {
      result.current.toast?.action?.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('useToast() throws when called outside the provider', () => {
    // The hook calls the throwing path during the renderHook commit — we
    // only need to assert that error surfaces.
    const renderOutside = () =>
      renderHook(() => useToast()); // no wrapper

    expect(renderOutside).toThrow(/ToastProvider/);
  });
});
