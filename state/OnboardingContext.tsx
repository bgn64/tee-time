/**
 * Onboarding context — tracks the user's progression through soft-prompt
 * primers. Each primer follows a four-state lifecycle:
 *
 *   'not_seen'   — never shown
 *   'dismissed'  — user picked "Maybe later" / Skip
 *   'accepted'   — user opted in (account: signed in; location: granted)
 *   'denied'     — user opted in at the primer but denied at the OS dialog
 *                  (location only; the account primer has no OS layer)
 *
 * Flow rules implemented by the root layout:
 *   · First launch ever (account.status === 'not_seen' AND no account) →
 *     route to /onboarding/account. After it resolves to accepted or
 *     dismissed, fall through to the location primer if its status is
 *     'not_seen'.
 *   · Re-launch → skip any primer that has already been seen, regardless
 *     of outcome. The user can re-trigger from Settings.
 *   · Signed-in users skip the account primer entirely (status flips to
 *     'accepted' on sign-in if it was 'not_seen').
 */

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { useAccount } from '@/state/AccountContext';

export type PrimerStatus = 'not_seen' | 'dismissed' | 'accepted' | 'denied';

export type PrimerKey = 'account' | 'location';

type PrimerState = Record<PrimerKey, PrimerStatus>;

const DEFAULT_STATE: PrimerState = {
  account: 'not_seen',
  location: 'not_seen',
};

type OnboardingContextValue = {
  state: PrimerState;
  setStatus: (primer: PrimerKey, status: PrimerStatus) => void;
  /**
   * The next primer to show, or null when onboarding is complete. The
   * root layout reads this and pushes the corresponding screen.
   */
  nextPrimer: PrimerKey | null;
  hydrated: boolean;
};

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

function migrate(raw: unknown): PrimerState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
  const obj = raw as Record<string, unknown>;
  const get = (key: PrimerKey): PrimerStatus => {
    const v = obj[key];
    if (v === 'not_seen' || v === 'dismissed' || v === 'accepted' || v === 'denied') {
      return v;
    }
    return 'not_seen';
  };
  return { account: get('account'), location: get('location') };
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PrimerState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  const { account, hydrated: accountHydrated } = useAccount();

  // Hydrate from storage.
  useEffect(() => {
    let cancelled = false;
    loadJSON<unknown>(STORAGE_KEYS.ONBOARDING_PRIMERS, null).then((raw) => {
      if (cancelled) return;
      setState(migrate(raw));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.ONBOARDING_PRIMERS, state);
  }, [state, hydrated]);

  // Sign-in implicitly accepts the account primer if it was unseen.
  // Sign-out does NOT revert: a user who signed in once knows what an
  // account is and we shouldn't pester them with the primer on the next
  // sign-out → sign-in cycle.
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    if (account && state.account === 'not_seen') {
      setState((prev) => ({ ...prev, account: 'accepted' }));
    }
  }, [account, accountHydrated, hydrated, state.account]);

  const setStatus = useCallback((primer: PrimerKey, status: PrimerStatus) => {
    setState((prev) => ({ ...prev, [primer]: status }));
  }, []);

  const nextPrimer: PrimerKey | null = useMemo(() => {
    if (!hydrated || !accountHydrated) return null;
    if (state.account === 'not_seen' && !account) return 'account';
    if (state.location === 'not_seen') return 'location';
    return null;
  }, [hydrated, accountHydrated, state, account]);

  const value = useMemo<OnboardingContextValue>(
    () => ({ state, setStatus, nextPrimer, hydrated }),
    [state, setStatus, nextPrimer, hydrated]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used inside OnboardingProvider.');
  }
  return ctx;
}
