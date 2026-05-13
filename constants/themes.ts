/**
 * Theme definitions for the Tee Time app.
 * Each theme provides semantic color tokens consumed via useTheme().
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
  chipText: string;
  chipSelectedBg: string;
  chipSelectedText: string;
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
    chipText: '#39423d',
    chipSelectedBg: '#d94835',
    chipSelectedText: '#ffffff',
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
    chipText: '#cbd6cf',
    chipSelectedBg: '#f97066',
    chipSelectedText: '#0f1419',
    border: '#34424b',
    tabBar: '#18222b',
    tabBarActive: '#91d45f',
    tabBarInactive: '#91a095',
  },
};

const legacyThemeMap: Record<string, ThemeName> = {
  earthy: 'light',
  ocean: 'light',
  lavender: 'light',
  navy: 'light',
};

export function normalizeThemeName(name: unknown): ThemeName {
  if (name === 'light' || name === 'dark') {
    return name;
  }

  if (typeof name === 'string' && legacyThemeMap[name]) {
    return legacyThemeMap[name];
  }

  return 'light';
}

export const themeNames: { key: ThemeName; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];
