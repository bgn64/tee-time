/**
 * Location primer — soft prompt to grant location access. "Enable
 * location" triggers the OS dialog; the resulting status (granted /
 * denied) flows back into OnboardingContext. "Maybe later" / Skip
 * marks the primer dismissed and never re-prompts automatically —
 * the user can re-trigger from the You-tab Location card.
 */

import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { PrimerScreen } from '@/components/PrimerScreen';
import { useLocation } from '@/state/LocationContext';
import { useOnboarding } from '@/state/OnboardingContext';

const BULLETS = [
  {
    icon: '🔍',
    heading: 'Sorted by distance.',
    body: "Search results lead with what's actually close.",
  },
  {
    icon: '📏',
    heading: 'Miles to each course.',
    body: 'See how far away every result is at a glance.',
  },
  {
    icon: '🛡',
    heading: 'Stays on your device.',
    body: 'We never send your location to our servers.',
  },
];

export default function LocationPrimerScreen() {
  const { setStatus } = useOnboarding();
  const { request } = useLocation();
  const [busy, setBusy] = useState(false);

  const finish = useCallback(() => {
    // Onboarding done — drop the user into the app.
    router.replace('/(tabs)/(score)');
  }, []);

  const onPrimary = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const result = await request();
    setBusy(false);
    setStatus('location', result === 'granted' ? 'accepted' : 'denied');
    finish();
  }, [busy, request, setStatus, finish]);

  const onDismiss = useCallback(() => {
    setStatus('location', 'dismissed');
    finish();
  }, [setStatus, finish]);

  return (
    <PrimerScreen
      heroIcon="📍"
      title="Find courses near you"
      body="Let Tee Time use your location to surface the nearest courses first."
      bullets={BULLETS}
      primaryLabel="Enable location"
      onPrimary={onPrimary}
      onDismiss={onDismiss}
      primaryBusy={busy}
    />
  );
}
