/**
 * In-tab player profile (Score stack).
 *
 * Pushed by the live scoring screen's linked-name tap in the Final box.
 * Sibling routes share `PlayerProfileScreen`; only the back label varies.
 */

import { useLocalSearchParams } from 'expo-router';

import { PlayerProfileScreen } from '@/components/PlayerProfileScreen';

export default function ScorePlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayerProfileScreen id={id ?? ''} backLabel="Scoring" />;
}
