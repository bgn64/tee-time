/**
 * You tab landing — the signed-in user's own profile.
 *
 * Mounts the shared `<ProfileScreen>` with `userId = ownUserId`.
 *
 * The You tab is profile-only; friend management lives in Search.
 */

import React from 'react';

import { ProfileScreen } from '@/components/social/ProfileScreen';
import { useRequiredAccount } from '@/library/social/AccountContext';

export default function YouLanding() {
  const account = useRequiredAccount();
  return <ProfileScreen userId={account.userId} />;
}
