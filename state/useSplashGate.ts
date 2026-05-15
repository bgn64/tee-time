/**
 * One-way latch over provider hydration flags.
 *
 * Returns `false` until all provided flags are true at least once. Once the
 * latch flips to `true`, subsequent changes to the input flags are ignored —
 * the latch never re-engages.
 *
 * This prevents the entire navigator from unmounting + resetting to its
 * initial route when a provider transiently flips its `hydrated` flag back
 * to `false` (e.g., during a post-mount cloud re-sync).
 */

import { useEffect, useRef, useState } from 'react';

export function useSplashGate(flags: Record<string, boolean>): boolean {
  const [latched, setLatched] = useState(false);
  const latchedRef = useRef(false);

  useEffect(() => {
    if (latchedRef.current) return;
    if (Object.values(flags).every(Boolean)) {
      latchedRef.current = true;
      setLatched(true);
    }
  });

  return latched || latchedRef.current;
}
