/**
 * Per-person detail (Friends list entry point).
 *
 * Reached from the Friends list inside the You tab. Renders the shared
 * `PlayerProfileScreen` with `backLabel="Friends"`. All data resolution
 * + UI lives in the component; this file is the thin route shim.
 *
 * Sibling routes that mount the same screen with different back labels:
 *   · `(feed)/player/[id]`   → "Feed"
 *   · `(rounds)/player/[id]` → "Round"
 *   · `(score)/player/[id]`  → "Scoring"
 */

import { useLocalSearchParams } from 'expo-router';

import { PlayerProfileScreen } from '@/components/PlayerProfileScreen';

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayerProfileScreen id={id ?? ''} backLabel="Friends" />;
}
