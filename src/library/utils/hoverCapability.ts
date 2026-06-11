import { Platform } from 'react-native';

/**
 * True only on devices with a precise, hovering pointer — i.e. a mouse
 * or trackpad on desktop. False on touch-only devices (phones, tablets)
 * and on native.
 *
 * The swipe pagers reveal their click-to-advance edge arrows on hover.
 * On the web, `onPointerEnter` / `onPointerLeave` fire for touch
 * pointers too (a finger press-and-hold counts as the pointer entering),
 * which made the arrows pop in during score entry on touchscreens. This
 * check gates the arrows to real mouse devices, mirroring the mockup's
 * `@media (hover: hover) and (pointer: fine)` query.
 *
 * Evaluated at mount (not module load) so static web renders don't bake
 * in a `false` before the client knows its pointer capabilities.
 */
export function deviceSupportsHover(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
