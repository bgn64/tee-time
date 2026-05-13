/**
 * Account primer — first-launch soft prompt to sign in. Routes to the
 * existing sign-in flow on accept, marks `accountPrimer` as dismissed
 * on Skip / Maybe later, and continues to the location primer only after
 * a real account exists or the user explicitly skips this step.
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
    // Do not mark this primer accepted here. The account context does that
    // only after sign-in succeeds, which keeps users from skipping auth by
    // backing out of the sign-in screen.
    router.push('/sign-in');
  }, []);

  const onDismiss = useCallback(() => {
    setStatus('account', 'dismissed');
    router.replace('/onboarding/location');
  }, [setStatus]);

  return (
    <PrimerScreen
      heroIcon="👋"
      title="Welcome to Tee Time"
      body="Score a round in seconds. Sign in with your invited email to keep your history, see friends' rounds, and play across devices."
      bullets={BULLETS}
      primaryLabel="Sign in"
      onPrimary={onPrimary}
      onDismiss={onDismiss}
    />
  );
}
