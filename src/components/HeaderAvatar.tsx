/**
 * HeaderAvatar — the signed-in user's avatar for the Feed header's right
 * slot (mirrors the mockup's top-right avatar). Tapping it jumps to the
 * You tab. Renders nothing until the account profile has loaded.
 */

import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Avatar } from '@/components/aurora';
import { useAccount } from '@/library/social/AccountContext';

export function HeaderAvatar() {
  const router = useRouter();
  const { account } = useAccount();

  if (!account) return null;

  const initial = (
    account.displayName?.trim()?.[0] ??
    account.handle?.trim()?.[0] ??
    '?'
  ).toUpperCase();

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/(you)' as never)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open your profile">
      <Avatar initial={initial} size={32} circle />
    </Pressable>
  );
}
