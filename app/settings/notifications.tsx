/**
 * Notifications settings — Phase 1 placeholder. Wires the You-tab grid card
 * end-to-end so Phase 3 backend work just fills in real content.
 */

import { router } from 'expo-router';

import { ComingSoon } from '@/components/ComingSoon';
import { useScreenHeader } from '@/state/HeaderContext';

export default function NotificationsScreen() {
  useScreenHeader({
    left: { kind: 'back', label: 'Settings', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  return (
    <ComingSoon
      icon="🔔"
      title="Notifications"
      body="Push notifications, friend-round alerts, and weekly recap settings will live here."
    />
  );
}
