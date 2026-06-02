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
    tabBar: '#18222b',
    tabBarActive: '#91d45f',
    tabBarInactive: '#91a095',
  },
};
