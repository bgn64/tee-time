/**
 * Header slot context — lets the currently-focused screen contribute the
 * left / right slot content for the persistent AppHeader.
 *
 * Screens call `useScreenHeader({ left, right })` inside their render; the
 * effect re-registers the slots whenever the screen gains focus, so tab and
 * stack navigation always end up showing the right chrome.
 */

import { useFocusEffect } from 'expo-router';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type HeaderLeftSlot =
  | { kind: 'text'; text: string }
  | { kind: 'back'; label: string; onPress: () => void };

export type HeaderRightSlot =
  | { kind: 'profile'; onPress?: () => void }
  | { kind: 'menu'; onPress: () => void }
  | { kind: 'none' };

export type HeaderSlots = {
  left: HeaderLeftSlot;
  right: HeaderRightSlot;
};

const DEFAULT_SLOTS: HeaderSlots = {
  left: { kind: 'text', text: '' },
  right: { kind: 'profile' },
};

type HeaderContextValue = {
  slots: HeaderSlots;
  setSlots: (slots: HeaderSlots) => void;
};

const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

export function HeaderProvider({ children }: PropsWithChildren) {
  const [slots, setSlots] = useState<HeaderSlots>(DEFAULT_SLOTS);

  const value = useMemo<HeaderContextValue>(() => ({ slots, setSlots }), [slots]);

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}

export function useHeaderSlots(): HeaderSlots {
  const ctx = useContext(HeaderContext);
  if (!ctx) {
    throw new Error('useHeaderSlots must be used inside HeaderProvider.');
  }
  return ctx.slots;
}

/**
 * Register slot content for the currently-focused screen.
 *
 * The slots are re-applied every time the screen gains focus (e.g. after a
 * tab switch or a back-pop) so we never inherit stale content from the
 * previously-focused screen.
 */
export function useScreenHeader(slots: HeaderSlots) {
  const ctx = useContext(HeaderContext);
  if (!ctx) {
    throw new Error('useScreenHeader must be used inside HeaderProvider.');
  }
  const { setSlots } = ctx;

  // Serialize slot identity so the focus effect only re-fires when the
  // semantic content (not the inline object reference) actually changes.
  const key = slotsKey(slots);

  useFocusEffect(
    useCallback(() => {
      setSlots(slots);
      // Intentionally no cleanup: the next focused screen will overwrite.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, setSlots])
  );
}

function slotsKey(s: HeaderSlots): string {
  const l = s.left.kind === 'text' ? `t:${s.left.text}` : `b:${s.left.label}`;
  const r = s.right.kind;
  return `${l}|${r}`;
}
