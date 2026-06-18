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
  /** Neon lime brand color for active states and primary fills. */
  lime: string;
  /** Electric cyan accent for contrast against danger red. */
  cyan: string;
  /** Aurora violet accent for gradient depth and highlights. */
  violet: string;
  /** Dark text/icon color for use on neon lime or cyan fills. */
  onNeon: string;
  /** Primary translucent glass surface fill. */
  glassFill: string;
  /** Slightly stronger translucent glass surface fill. */
  glassFill2: string;
  /** Shared glass outline stroke color. */
  glassStroke: string;
  /** Soft lime glow wash for elevated neon elements. */
  glowLime: string;
  /** Soft cyan glow wash for secondary neon elements. */
  glowCyan: string;
  /** Deepest night base for Aurora gradients. */
  night: string;
  /** Top-left blue-green night gradient stop. */
  nightTop: string;
  /** Top-right violet night gradient stop. */
  nightViolet: string;
  /** Score pip fill for birdies. */
  pipBirdie: string;
  /** Score pip outline glow for birdies. */
  pipBirdieRing: string;
  /** Score pip fill for eagles. */
  pipEagleBg: string;
  /** Score pip text color for eagles. */
  pipEagleText: string;
  /** Score pip fill for bogeys. */
  pipBogey: string;
  /** Score pip outline glow for bogeys. */
  pipBogeyRing: string;
};

export type ThemeName = 'light' | 'dark';

export const numericFontVariant = ['tabular-nums'] as const;

const auroraGlassTheme: ThemeColors = {
  background: '#070a12',
  primary: '#b6ff3b',
  primaryDark: '#8fcf2e',
  accent: '#ff6b6b',
  textTitle: '#eaf2ee',
  textBody: '#c4d0dc',
  textMuted: '#93a3b3',
  cardBg: '#0f1622',
  chipBg: '#172230',
  border: 'rgba(255,255,255,0.12)',
  hairline: 'rgba(255,255,255,0.07)',
  shadowCard: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 8,
  },
  divergent: '#39e6c6',
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
  tabBar: '#0b121c',
  tabBarActive: '#b6ff3b',
  tabBarInactive: '#93a3b3',
  lime: '#b6ff3b',
  cyan: '#39e6c6',
  violet: '#9d7bff',
  onNeon: '#08121a',
  glassFill: 'rgba(255,255,255,0.06)',
  glassFill2: 'rgba(255,255,255,0.09)',
  glassStroke: 'rgba(255,255,255,0.15)',
  glowLime: 'rgba(182,255,59,0.14)',
  glowCyan: 'rgba(57,230,198,0.12)',
  night: '#05070c',
  nightTop: '#13283a',
  nightViolet: '#231a44',
  pipBirdie: '#b6ff3b',
  pipBirdieRing: 'rgba(182,255,59,0.4)',
  pipEagleBg: '#b6ff3b',
  pipEagleText: '#08121a',
  pipBogey: '#ffc08a',
  pipBogeyRing: 'rgba(255,178,122,0.4)',
};

export const themes: Record<ThemeName, ThemeColors> = {
  light: auroraGlassTheme,
  dark: auroraGlassTheme,
};
