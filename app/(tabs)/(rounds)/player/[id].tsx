/**
 * In-tab player profile (Rounds stack).
 *
 * Pushed by the round-detail screen's linked-name tap in the Final box.
 * Sibling routes share `PlayerProfileScreen`; only the back label varies.
 */

import { useLocalSearchParams } from 'expo-router';

import { PlayerProfileScreen } from '@/components/PlayerProfileScreen';

export default function RoundsPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayerProfileScreen id={id ?? ''} backLabel="Round" />;
}
