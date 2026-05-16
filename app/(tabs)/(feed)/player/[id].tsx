/**
 * In-tab player profile (Feed stack).
 *
 * Pushed by `FeedCardLarge`'s linked-name tap so the user can drill into
 * a player's profile without jumping tabs. Mirrors
 * `app/(tabs)/(you)/friends/[id].tsx` but with the back chip labelled
 * for the originating tab.
 */

import { useLocalSearchParams } from 'expo-router';

import { PlayerProfileScreen } from '@/components/PlayerProfileScreen';

export default function FeedPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayerProfileScreen id={id ?? ''} backLabel="Feed" />;
}
