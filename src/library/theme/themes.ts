/**
 * Semantic color tokens for the app.
 *
 * Mirrored (trimmed) from the destination tee-time app's `constants/themes.ts`
 * so screens lifted across later don't need a re-skin. Add new tokens here as
 * additional reference screens land — the shape grows monotonically so
 * existing call sites keep working.
 */

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
    tabBar: '#18222b',
    tabBarActive: '#91d45f',
    tabBarInactive: '#91a095',
  },
};
