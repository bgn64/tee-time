/**
 * Avatar color palette for new account profiles.
 *
 * Used at profile-creation time when there's no SSO-provided color (Magic
 * Link doesn't carry one). Each new profile picks one deterministically
 * from the user id so signing in twice (or signing in on a new device)
 * shows the same color.
 */

export const AVATAR_COLORS: readonly string[] = [
  '#7cb342', // earthy green
  '#42a5f5', // sky blue
  '#ab47bc', // grape purple
  '#ff8f00', // orange
  '#ec4899', // pink
  '#10b981', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
];

export function pickAvatarColor(seed: string): string {
  // Simple deterministic hash → palette index.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
