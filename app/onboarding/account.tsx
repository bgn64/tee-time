/**
 * Account primer — first-launch soft prompt to sign in. Routes to the
 * existing sign-in flow on accept, marks `accountPrimer` as dismissed
 * on Skip / Maybe later, and continues to the location primer either
 * way via the root layout's nextPrimer effect.
 */

import { router } from 'expo-router';
import { useCallback } from 'react';

import { PrimerScreen } from '@/components/PrimerScreen';
import { useOnboarding } from '@/state/OnboardingContext';

const BULLETS = [
  {
    icon: '🏌',
    heading: 'Your rounds, everywhere.',
    body: 'Sync history across phones and the web.',
  },
  {
    icon: '👥',
    heading: 'See friends play.',
    body: "A feed of rounds your friends scored.",
  },
  {
    icon: '⛳',
    heading: 'Free forever.',
    body: 'Email sign-in, no password to remember.',
  },
];

export default function AccountPrimerScreen() {
  const { setStatus } = useOnboarding();

  const onPrimary = useCallback(() => {
    // AccountContext.account flipping to non-null on successful sign-in
    // will also flip the primer to 'accepted' via OnboardingContext's
    // effect, but we set it here too so dismissing the sign-in modal
    // without completing still counts as having seen the primer.
    setStatus('account', 'accepted');
    router.replace('/sign-in');
  }, [setStatus]);

  const onDismiss = useCallback(() => {
    setStatus('account', 'dismissed');
    router.replace('/onboarding/location');
  }, [setStatus]);

  return (
    <PrimerScreen
      heroIcon="👋"
      title="Welcome to Tee Time"
      body="Score a round in seconds. Sign in to keep your history, see friends' rounds, and play across devices."
      bullets={BULLETS}
      primaryLabel="Get started"
      onPrimary={onPrimary}
      onDismiss={onDismiss}
    />
  );
}
