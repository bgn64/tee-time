/**
 * Platform-aware dialog helpers.
 *
 * `react-native`'s `Alert.alert` only renders properly on iOS and Android.
 * On the web build (`react-native-web`), multi-button alerts silently
 * collapse to nothing — `window.alert` is the only thing that lands, and
 * confirm dialogs with Cancel + destructive actions never fire their
 * callbacks. This module shims a single-message alert and a yes/no
 * confirm so both platforms behave the same.
 *
 * Use these instead of `Alert.alert` everywhere — including for
 * informational messages — so future web testing doesn't surface platform
 * regressions.
 */

import { Alert, Platform } from 'react-native';

/** A best-effort one-button "OK" alert. */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Defaults to "OK". */
  confirmLabel?: string;
  /**
   * iOS/Android only: marks the confirm button as a destructive action
   * (red text on iOS). No effect on web.
   */
  destructive?: boolean;
};

/**
 * Cross-platform confirm dialog. Resolves with `true` when the user
 * presses the confirm button, `false` for cancel or dismiss.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    cancelLabel = 'Cancel',
    confirmLabel = 'OK',
    destructive = false,
  } = opts;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const body = message ? `${title}\n\n${message}` : title;
      return Promise.resolve(window.confirm(body));
    }
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
