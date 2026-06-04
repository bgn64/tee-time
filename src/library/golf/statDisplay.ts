/**
 * Display-side helpers for stat labels.
 *
 * Built-in stat labels in the registry are a mix of acronyms
 * ("GIR", "FIR", "OB") and word-style names ("Putts"). For inline
 * sentence-like contexts ("2 putts", "Yes GIR"), acronyms should
 * stay uppercase while word labels read more naturally lowercased.
 *
 * `displayStatLabel` detects acronyms (all-uppercase ASCII letters)
 * and leaves them as-is; everything else is lowercased. This
 * heuristic survives future stat additions as long as authors name
 * acronyms in all caps and word-stats in title case.
 */

export function displayStatLabel(label: string): string {
  if (/^[A-Z]+$/.test(label)) return label;
  return label.toLowerCase();
}
