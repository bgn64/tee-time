/**
 * Semantic color tokens for the app.
 *
 * Mirrored (trimmed) from the destination tee-time app's `constants/themes.ts`
 * so screens lifted across later don't need a re-skin. Add new tokens here as
 * additional reference screens land — the shape grows monotonically so
 * existing call sites keep working.
 *
 * `shadowCard` is a structured value rather than a single color because RN
 * needs the full shadow spec (color/offset/opacity/radius + Android
 * `elevation`) and the round-views redesign wants a consistent card-elevation
 * look across both surfaces. Spread it into a style: `{...colors.shadowCard}`.
 */

export type ShadowSpec = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type ThemeColors = {
  background: string;
  primary: string;
  primaryDark: string;
  accent: string;
  textTitle: string;
  textBody: string;
  textMuted: string;
  cardBg: string;
  chipBg: string;
  border: string;
  /**
   * Subtle divider color, lighter than `border`. Used between rows
   * inside a card (per-scorer row separators, accordion edges) where
   * `border` would feel too heavy.
   */
  hairline: string;
  /**
   * Shared RN shadow spec for the editorial card surface. Mirrors the
   * mockup's CSS `--shadow-card` token, simplified to a single RN
   * shadow layer (web supports multi-layer shadows but RN can't render
   * them per-View). Spread: `style={{...colors.shadowCard}}`.
   */
  shadowCard: ShadowSpec;
  /**
   * Highlight colour for scorecard cells that diverge from the prior
   * tee group's par/hcp. Mockup uses the accent colour for this; we
   * alias it explicitly so future palette tweaks can decouple
   * divergence highlighting from the accent (likes / live indicator)
   * if needed.
   */
  divergent: string;
  /** Canonical tee colour tokens. */
  teeBlue: string;
  teeWhite: string;
  teeRed: string;
  teeGold: string;
  /**
   * Named-palette tokens beyond the four canonical names — so courses
   * with Green / Black / Yellow / etc. tees render the right colour
   * (matched by name in `teeColor.ts`), tuned to read as text on the card.
   */
  teeGreen: string;
  teeBlack: string;
  teeYellow: string;
  teeBurgundy: string;
  teeSilver: string;
  teeOrange: string;
  teePurple: string;
  /**
   * Deterministic fallback palette for non-canonical tee names
   * ("Senior", "Member", "Forward Gold", etc.). Tee colour assignment
   * (see `src/library/golf/teeColor.ts`) hashes the tee's stable id
   * mod 6 to pick one of these, then resolves in-round collisions by
   * incrementing the index.
   */
  teeFallback1: string;
  teeFallback2: string;
  teeFallback3: string;
  teeFallback4: string;
  teeFallback5: string;
  teeFallback6: string;
  tabBar: string;
  tabBarActive: string;
  tabBarInactive: string;
};

export type ThemeName = 'light' | 'dark';

export const themes: Record<ThemeName, ThemeColors> = {
  light: {
    background: '#f6f7f2',
    primary: '#2f7d4b',
    primaryDark: '#14543a',
    accent: '#d94835',
    textTitle: '#123322',
    textBody: '#39423d',
    textMuted: '#718077',
    cardBg: '#ffffff',
    chipBg: '#edf1e9',
    border: '#dce2d8',
    hairline: '#ebeee6',
    shadowCard: {
      // Mockup uses a primary-tinted shadow in light mode; we use
      // `primaryDark` directly so the elevation reads as a soft green
      // wash rather than a neutral grey on the warm page background.
      shadowColor: '#14543a',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 3,
    },
    divergent: '#d94835',
    teeBlue: '#4b8fd1',
    teeWhite: '#8a8f81',
    teeRed: '#c9442f',
    teeGold: '#b08a1d',
    teeGreen: '#4e9a3e',
    teeBlack: '#333333',
    teeYellow: '#9a7d10',
    teeBurgundy: '#8a3a44',
    teeSilver: '#9aa0a8',
    teeOrange: '#cf6a1f',
    teePurple: '#8a44ad',
    teeFallback1: '#a05fb2',
    teeFallback2: '#0e9491',
    teeFallback3: '#d77a2e',
    teeFallback4: '#4a6f3a',
    teeFallback5: '#c93b7a',
    teeFallback6: '#5c5a7d',
    tabBar: '#ffffff',
    tabBarActive: '#2f7d4b',
    tabBarInactive: '#718077',
  },
  dark: {
    background: '#0f1419',
    primary: '#91d45f',
    primaryDark: '#66b34e',
    accent: '#f97066',
    textTitle: '#edf5e8',
    textBody: '#cbd6cf',
    textMuted: '#91a095',
    cardBg: '#18222b',
    chipBg: '#24313a',
    border: '#34424b',
    hairline: 'rgba(255,255,255,0.06)',
    shadowCard: {
      // Dark mode uses a pure-black shadow at higher opacity so the
      // card still lifts off the very dark page background.
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.45,
      shadowRadius: 14,
      elevation: 6,
    },
    divergent: '#f97066',
    teeBlue: '#6aa9e5',
    teeWhite: '#c2c8b8',
    teeRed: '#f08e7e',
    teeGold: '#d4a839',
    teeGreen: '#8fce6a',
    teeBlack: '#b8b8b8',
    teeYellow: '#e0c34a',
    teeBurgundy: '#d59aa1',
    teeSilver: '#c4cad2',
    teeOrange: '#ef9b5a',
    teePurple: '#a86fc8',
    teeFallback1: '#c08fd2',
    teeFallback2: '#4cc7c4',
    teeFallback3: '#ef9b5a',
    teeFallback4: '#8eb978',
    teeFallback5: '#ea6fa1',
    teeFallback6: '#8d8baf',
    tabBar: '#18222b',
    tabBarActive: '#91d45f',
    tabBarInactive: '#91a095',
  },
};
