/**
 * Avatar color palette for new profiles.
 *
 * Picked deterministically from the user id on first sign-in (via
 * `pickAvatarColor(userId)`), then stored in the `profiles.avatar_color`
 * column so a future avatar-edit screen can update it without losing
 * the original. Two devices rendering the same brand-new user before
 * the profile exists pick the same color thanks to the hash.
 *
 * The palette is constrained to the Aurora night/neon family;
 * `auroraAvatarColor` coerces any legacy/off-brand stored color onto it
 * at render time without rewriting the stored value.
 */

// Aurora-harmonious palette: greens, cyans, blues, and violets only.
// Off-brand hues (pink/magenta/red/orange/amber) were removed during the
// Aurora cutover so generated avatars always sit inside the night/neon
// palette. The two leading hues match the mockup's @marcus (green) and
// @priya (indigo) cards.
export const AVATAR_COLORS: readonly string[] = [
  '#7cb342', // green
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#84cc16', // lime
  '#42a5f5', // sky blue
  '#10b981', // emerald
  '#ab47bc', // grape purple
  '#5c6bc0'  // indigo
];

function hashSeed(seed: string): number {
  // Simple deterministic hash → palette index. Same input always
  // produces the same output so two devices agree on the color even
  // before any sync round-trip.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickAvatarColor(seed: string): string {
  return AVATAR_COLORS[hashSeed(seed) % AVATAR_COLORS.length];
}

/**
 * Coerce any stored avatar color onto the Aurora palette at render time.
 *
 * Profiles created before the Aurora cutover (or by the seed data) may
 * hold an off-brand hex (e.g. pink). We can't rewrite those stored values
 * here — that's a data concern — so the rendering layer maps them onto the
 * Aurora set deterministically by the stored value, keeping each user a
 * stable on-brand color. Colors already in the palette pass through.
 */
export function auroraAvatarColor(stored?: string | null): string {
  const value = (stored ?? '').trim().toLowerCase();
  if (value && (AVATAR_COLORS as readonly string[]).includes(value)) {
    return value;
  }
  return AVATAR_COLORS[hashSeed(value) % AVATAR_COLORS.length];
}

/**
 * Pick a readable initial color (near-black vs white) for a solid avatar
 * background, mirroring the mockup's dark glyphs on bright neon avatars
 * while keeping white text on the darker palette hues.
 */
export function avatarInitialColor(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#08121a' : '#ffffff';
}
