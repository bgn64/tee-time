/**
 * About screen — Phase 1 placeholder. App version, credits, links live here later.
 */

import { router } from 'expo-router';

import { ComingSoon } from '@/components/ComingSoon';
import { useScreenHeader } from '@/state/HeaderContext';

export default function AboutScreen() {
  useScreenHeader({
    left: { kind: 'back', label: 'You', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  return (
    <ComingSoon
      icon="ⓘ"
      title="About Tee Time"
      body="Version, credits, and the changelog will appear here once there's a story to tell."
    />
  );
}
