/**
 * Tests for the primer-chain semantics exposed by OnboardingContext.
 *
 * The Settings screen's "Show onboarding" row (see app/settings/index.tsx)
 * resets both primer statuses to 'not_seen' and relies on the root layout's
 * primer-redirect effect (see app/_layout.tsx) to walk the user through the
 * primers in order. These tests pin the underlying state machine so that
 * fix keeps working:
 *
 *   1. Both primers 'not_seen' (and no account) → nextPrimer === 'account'.
 *   2. Account 'dismissed', location still 'not_seen' → nextPrimer === 'location'.
 *   3. Both 'dismissed' → nextPrimer === null (chain complete).
 */

jest.mock('@/state/supabaseClient');

import { act, waitFor } from '@testing-library/react-native';

import { useOnboarding } from '@/state/OnboardingContext';

import {
  mockSupabaseReset,
  renderHookWithProviders,
} from './test-utils';

beforeEach(() => {
  mockSupabaseReset();
});

describe('OnboardingContext primer chain', () => {
  it('walks account → location → null when both primers are reset to not_seen and then dismissed in order', async () => {
    const { result } = renderHookWithProviders(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    // Step 1: both primers reset to 'not_seen' (mirrors what
    // SettingsScreen.onShowOnboarding does). No signed-in account, so the
    // account primer is up first.
    act(() => {
      result.current.setStatus('account', 'not_seen');
      result.current.setStatus('location', 'not_seen');
    });

    await waitFor(() => {
      expect(result.current.nextPrimer).toBe('account');
    });

    // Step 2: user dismisses the account primer; the chain advances to
    // the location primer.
    act(() => {
      result.current.setStatus('account', 'dismissed');
    });

    await waitFor(() => {
      expect(result.current.nextPrimer).toBe('location');
    });

    // Step 3: user dismisses the location primer; the chain is complete
    // and the layout effect stops redirecting.
    act(() => {
      result.current.setStatus('location', 'dismissed');
    });

    await waitFor(() => {
      expect(result.current.nextPrimer).toBeNull();
    });
  });
});
