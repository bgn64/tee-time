/**
 * Legacy friends route — Search owns friends and requests now.
 */

import { Redirect } from 'expo-router';

export default function FriendsRedirect() {
  return <Redirect href="/(tabs)/(search)" />;
}
