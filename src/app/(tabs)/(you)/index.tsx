/**
 * You tab landing — the signed-in user's own profile.
 *
 * Mounts the shared `<ProfileScreen>` with `userId = ownUserId` and
 * supplies `onPressFriends` so the Friends stat jumps to Search,
 * where friends and requests now live.
 * Other entry points to ProfileScreen (search/profile/[uid],
 * score/profile/[uid], you/profile/[uid]) omit `onPressFriends` —
 * the friend count is hidden on those screens anyway because we
 * only show it for the signed-in user.
 *
 * The You tab is profile-only; friend management lives in Search.
 */

import { router } from 'expo-router';
import React from 'react';

import { ProfileScreen } from '@/components/social/ProfileScreen';
import { useRequiredAccount } from '@/library/social/AccountContext';

export default function YouLanding() {
  const account = useRequiredAccount();
  return (
    <ProfileScreen
      userId={account.userId}
      onPressFriends={() => router.push('/(tabs)/(search)' as never)}
    />
  );
}
