/**
 * User identity helpers — pure, context-free utilities for deriving
 * presentational user labels from raw profile fields.
 *
 * Callers should treat an empty result as "no usable first name available"
 * and fall back to their own context-appropriate default (e.g. the
 * player's nickname/displayName, or the literal `'Player'` for unknown
 * participants). This helper deliberately does NOT inject any such
 * fallback so it stays composable across call sites.
 */

/**
 * Extract the first whitespace-delimited token of a display name.
 *
 * Returns `''` when the input is null/undefined or empty after trim.
 * Whitespace at the start of the string is ignored. Splits on any
 * run of whitespace, so multi-space and leading-space inputs behave
 * the same as a single-spaced one.
 *
 * Example: `firstName('  José Ángel ')` → `'José'`.
 *
 * NOTE: When this returns an empty string, callers should fall back
 * to their own default (e.g. nickname, displayName, or `'Player'`).
 */
export function firstName(displayName?: string | null): string {
  if (displayName == null) return '';
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return '';
  const tokens = trimmed.split(/\s+/);
  return tokens[0] ?? '';
}
