/**
 * Tee colour assignment — deterministic + collision-resolved.
 *
 * The four canonical tee names (Blue / White / Red / Gold) map to
 * fixed palette tokens. Any tee without a canonical name (e.g.
 * "Senior", "Member", "Forward Gold", course-specific names) gets a
 * colour deterministically assigned from a six-slot fallback palette
 * by hashing the tee's stable id. Within a single round, conflicts
 * are resolved by incrementing through the fallback palette so two
 * tees in the same round never render the same colour.
 *
 * The returned `ColorToken` is the **theme-token key name** — call
 * sites resolve it through the active theme: `colors[token]`. This
 * keeps the palette themeable (light / dark variants of each tee
 * colour ship as separate hex values in `themes.ts`).
 *
 * Pure functions — no React, no theme lookups here. All consumers
 * pass through `useTheme().colors[token]` at render time.
 */

import type { Tee } from '@/types/golf';

/** Theme-token key for any tee colour (canonical or fallback). */
export type ColorToken =
  | 'teeBlue'
  | 'teeWhite'
  | 'teeRed'
  | 'teeGold'
  | 'teeFallback1'
  | 'teeFallback2'
  | 'teeFallback3'
  | 'teeFallback4'
  | 'teeFallback5'
  | 'teeFallback6';

const FALLBACK_TOKENS: readonly ColorToken[] = [
  'teeFallback1',
  'teeFallback2',
  'teeFallback3',
  'teeFallback4',
  'teeFallback5',
  'teeFallback6',
];

const CANONICAL_TOKENS: Record<string, ColorToken> = {
  blue: 'teeBlue',
  white: 'teeWhite',
  red: 'teeRed',
  gold: 'teeGold',
};

/**
 * Map a tee's display name to a canonical token, if any. Match is
 * case-insensitive and trims surrounding whitespace. Returns `null`
 * for non-canonical names so the caller falls back to the hashed
 * palette.
 */
export function canonicalTeeColor(name: string): ColorToken | null {
  const key = name.trim().toLowerCase();
  return CANONICAL_TOKENS[key] ?? null;
}

/**
 * Deterministic non-cryptographic hash of an arbitrary string to a
 * non-negative integer. The DJB2 variant — small, fast, and produces
 * a well-distributed result across short alphanumeric inputs (UUIDs,
 * tee names) which is what we need for collision-rare assignment.
 *
 * Returned value is folded into 32-bit unsigned range so callers can
 * `% FALLBACK_TOKENS.length` safely without negative numbers.
 */
export function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    // (h * 33) ^ char, masked to 32-bit signed then converted to
    // unsigned by `>>> 0`.
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Pick a fallback palette index for a stable identifier. Always
 * returns `0..FALLBACK_TOKENS.length - 1`.
 */
export function hashFallbackIndex(id: string): number {
  return hashString(id) % FALLBACK_TOKENS.length;
}

/**
 * Assign a `ColorToken` to every tee in the input list. Honours
 * each tee's explicit `colorToken` first, then `canonicalTeeColor`
 * by name, then a hash-derived fallback. Within the input list,
 * collisions are resolved by incrementing through the fallback
 * palette until a free token is found; if every fallback slot is
 * already taken, we wrap back to the colliding slot (the user is
 * playing 7+ tees and they'll have to live with a repeat).
 *
 * Returned map is keyed by `tee.id`. Stable across renders given
 * the same input ordering — components can call this on every render
 * without flickering colours.
 */
export function assignTeeColors(tees: readonly Tee[]): Map<string, ColorToken> {
  const out = new Map<string, ColorToken>();
  const used = new Set<ColorToken>();

  // First pass: take explicit / canonical assignments.
  for (const tee of tees) {
    const explicit =
      (tee.colorToken as ColorToken | undefined) ?? canonicalTeeColor(tee.name);
    if (explicit) {
      out.set(tee.id, explicit);
      used.add(explicit);
    }
  }

  // Second pass: hash-derived fallback for the rest, with collision
  // resolution against already-used tokens (both canonical and other
  // fallback assignments).
  for (const tee of tees) {
    if (out.has(tee.id)) continue;
    let idx = hashFallbackIndex(tee.id);
    let attempts = 0;
    let token = FALLBACK_TOKENS[idx];
    while (used.has(token) && attempts < FALLBACK_TOKENS.length) {
      idx = (idx + 1) % FALLBACK_TOKENS.length;
      token = FALLBACK_TOKENS[idx];
      attempts++;
    }
    out.set(tee.id, token);
    used.add(token);
  }

  return out;
}
