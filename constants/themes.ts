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
  /** Background of the "You" chip on the player picker — warm accent in
   *  light, warm-dark accent in dark. */
  chipYouBg: string;
  chipYouBorder: string;
  border: string;
  tabBar: string;
  tabBarActive: string;
  tabBarInactive: string;
  /** "Notice" surface — used by attention banners (incoming friend
   *  requests, sign-in nudges). Warm cream in light, warm-dark in dark. */
  noticeBg: string;
  noticeBorder: string;
  noticeText: string;
  noticeTextMuted: string;
  noticeButtonBorder: string;
  noticeButtonText: string;
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
    chipYouBg: '#fff4e3',
    chipYouBorder: '#f5dcb6',
    border: '#dce2d8',
    tabBar: '#ffffff',
    tabBarActive: '#2f7d4b',
    tabBarInactive: '#718077',
    noticeBg: '#fff8e7',
    noticeBorder: '#f5e0b8',
    noticeText: '#6b5a3a',
    noticeTextMuted: '#8a7656',
    noticeButtonBorder: '#e0d0a8',
    noticeButtonText: '#7c6b4f',
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
    chipYouBg: '#2e2820',
    chipYouBorder: '#4a4030',
    border: '#34424b',
    tabBar: '#18222b',
    tabBarActive: '#91d45f',
    tabBarInactive: '#91a095',
    noticeBg: '#2a2418',
    noticeBorder: '#4d4226',
    noticeText: '#d4c6a8',
    noticeTextMuted: '#a89878',
    noticeButtonBorder: '#5a4f30',
    noticeButtonText: '#c4b594',
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
