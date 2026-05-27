/**
 * Avatar color palette for new profiles.
 *
 * Picked deterministically from the user id on first sign-in (via
 * `pickAvatarColor(userId)`), then stored in the `profiles.avatar_color`
 * column so a future avatar-edit screen can update it without losing
 * the original. Two devices rendering the same brand-new user before
 * the profile exists pick the same color thanks to the hash.
 *
 * Ported (with a slightly broader palette) from the destination
 * tee-time app's `constants/avatarColors.ts`.
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
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#d946ef'  // magenta
];

export function pickAvatarColor(seed: string): string {
  // Simple deterministic hash → palette index. Same input always
  // produces the same output so two devices agree on the color even
  // before any sync round-trip.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
