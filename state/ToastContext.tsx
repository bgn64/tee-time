/**
 * Toast context — a single-slot transient message surface.
 *
 * The app uses this to surface signals that aren't worth a full modal but
 * that the user shouldn't miss — most notably the offline write queue's
 * dead-letter handler ("Couldn't sync your last change. Tap to retry.").
 *
 * Semantics:
 *   · Single slot. Calling `show()` while a toast is visible REPLACES the
 *     previous toast (we don't queue). This matches user expectations
 *     better than stacking — the latest signal is usually the most
 *     relevant.
 *   · Auto-hide after `autoHideMs` (default 4000). The visible component
 *     reads `toast` and renders null when null. The dead-letter caller
 *     overrides this to 8000ms to give users time to tap Retry.
 *   · Optional action — `{ label, onPress }`. The Toast component renders
 *     a pressable button on the right. The action's onPress is the
 *     caller's responsibility (we don't auto-dismiss after onPress here;
 *     the caller can call `dismiss()` if needed).
 *
 * The `<Toast />` visible component lives in `components/Toast.tsx` and is
 * mounted once at the root layout. Both pieces are intentionally small —
 * if we ever need queueing or richer surfaces, we'd swap this for a real
 * toast library, not extend it.
 */

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ToastAction = {
  label: string;
  onPress: () => void;
};

export type Toast = {
  id: string;
  message: string;
  action?: ToastAction;
  autoHideMs: number;
};

export type ShowToastOptions = {
  action?: ToastAction;
  autoHideMs?: number;
};

type ToastContextValue = {
  toast: Toast | null;
  show: (message: string, opts?: ShowToastOptions) => void;
  dismiss: () => void;
};

const DEFAULT_AUTO_HIDE_MS = 4000;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let toastIdCounter = 0;
function nextToastId(): string {
  toastIdCounter += 1;
  return `toast-${Date.now().toString(36)}-${toastIdCounter}`;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, opts?: ShowToastOptions) => {
      const autoHideMs = opts?.autoHideMs ?? DEFAULT_AUTO_HIDE_MS;
      const next: Toast = {
        id: nextToastId(),
        message,
        action: opts?.action,
        autoHideMs,
      };
      // Single slot: replacing clears the prior timer.
      clearTimer();
      setToast(next);
      if (autoHideMs > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          // Only clear if this is still the current toast — a later show()
          // already cleared the timer, but defensive.
          setToast((current) => (current && current.id === next.id ? null : current));
        }, autoHideMs);
      }
    },
    [clearTimer]
  );

  // Clear the auto-hide timer on unmount so we don't fire setState on
  // an unmounted provider in tests.
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, show, dismiss }),
    [toast, show, dismiss]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider.');
  }
  return ctx;
}
