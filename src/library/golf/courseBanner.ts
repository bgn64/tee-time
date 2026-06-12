/**
 * Deterministic course-banner styling.
 *
 * Each course gets a consistent, recognizable banner generated from a
 * stable seed (the course id, falling back to the name) — a stand-in
 * for course photos. Same course → same banner on every device and for
 * every viewer, with no stored asset and no backend. Mirrors the
 * deterministic-hash approach of `pickAvatarColor`
 * (src/library/social/avatarColors.ts).
 *
 * The hue spans the full wheel for per-course variety, but saturation
 * and lightness are constrained to a dark, legible band so the white
 * overlay text always reads over the gradient + scrim.
 */

import type { Course } from '@/types/golf';

/** Which background motif the banner draws (contours / dunes / coast / topo). */
export type BannerMotif = 0 | 1 | 2 | 3;

export type CourseBannerStyle = {
  /** Base hue, 0–359. */
  hue: number;
  /** Saturation percentage, 44–59. */
  sat: number;
  motif: BannerMotif;
  /** Gradient angle in degrees. */
  angle: number;
  /** Flag/motif anchor, 18–81 (% across the banner). */
  flagX: number;
};

/** Stable string hash → uint32. Same shape as `pickAvatarColor`'s hash. */
function hashSeed(seed: string): number {
  let hash = 0;
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function bannerStyleForCourse(
  course: Pick<Course, 'id' | 'name'>
): CourseBannerStyle {
  const seed = course.id || course.name || 'course';
  const h = hashSeed(seed);
  return {
    hue: h % 360,
    sat: 44 + (Math.floor(h / 360) % 16),
    motif: (Math.floor(h / 23) % 4) as BannerMotif,
    angle: 110 + (Math.floor(h / 7) % 70),
    flagX: 18 + (Math.floor(h / 13) % 64),
  };
}

/**
 * Two-stop gradient (dark → mid), both near the seed hue. Returned as a
 * fixed-length tuple so `expo-linear-gradient`'s `colors` prop (which
 * requires ≥2 stops) type-checks. Uses comma-form `hsl()` for React
 * Native's color parser.
 */
export function gradientColors(style: CourseBannerStyle): [string, string] {
  const hue2 = (style.hue + 22) % 360;
  return [
    `hsl(${style.hue}, ${style.sat}%, 23%)`,
    `hsl(${hue2}, ${style.sat}%, 39%)`,
  ];
}

/** Convert the seed angle to `expo-linear-gradient` start/end points. */
export function gradientVector(angle: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  return {
    start: { x: 0.5 - dx / 2, y: 0.5 - dy / 2 },
    end: { x: 0.5 + dx / 2, y: 0.5 + dy / 2 },
  };
}
