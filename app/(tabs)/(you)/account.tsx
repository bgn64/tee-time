/**
 * Account settings — Phase 1 placeholder. Sign-in, profile editing, and the
 * Player↔User claim flow are all Phase 3 work.
 */

import { router } from 'expo-router';

import { ComingSoon } from '@/components/ComingSoon';
import { useScreenHeader } from '@/state/HeaderContext';

export default function AccountScreen() {
  useScreenHeader({
    left: { kind: 'back', label: 'You', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  return (
    <ComingSoon
      icon="👤"
      title="Account"
      body="Sign in, edit your profile, and manage your handle once accounts ship in Phase 3."
    />
  );
}
