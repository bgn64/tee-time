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

export type ThemeName = 'earthy' | 'ocean' | 'dark' | 'lavender' | 'navy';

export const themes: Record<ThemeName, ThemeColors> = {
  earthy: {
    background: '#fefcf8',
    primary: '#7cb342',
    primaryDark: '#558b2f',
    accent: '#ff8f00',
    textTitle: '#2d5016',
    textBody: '#3d3d3d',
    textMuted: '#7c6b4f',
    cardBg: '#ffffff',
    chipBg: '#f5f0e8',
    chipText: '#555555',
    chipSelectedBg: '#ff8f00',
    chipSelectedText: '#ffffff',
    border: '#e8e0d4',
    tabBar: '#ffffff',
    tabBarActive: '#7cb342',
    tabBarInactive: '#9e9e9e',
  },
  ocean: {
    background: '#f8fcfd',
    primary: '#0891b2',
    primaryDark: '#0e7490',
    accent: '#f97066',
    textTitle: '#164e63',
    textBody: '#334155',
    textMuted: '#5e8a94',
    cardBg: '#ffffff',
    chipBg: '#ecfeff',
    chipText: '#555555',
    chipSelectedBg: '#f97066',
    chipSelectedText: '#ffffff',
    border: '#d4eef2',
    tabBar: '#ffffff',
    tabBarActive: '#0891b2',
    tabBarInactive: '#9e9e9e',
  },
  dark: {
    background: '#0f1419',
    primary: '#a3e635',
    primaryDark: '#65a30d',
    accent: '#fbbf24',
    textTitle: '#e7e9ea',
    textBody: '#c8cdd0',
    textMuted: '#8899a6',
    cardBg: '#1c2732',
    chipBg: '#2d3a45',
    chipText: '#c8cdd0',
    chipSelectedBg: '#fbbf24',
    chipSelectedText: '#0f1419',
    border: '#38444d',
    tabBar: '#1c2732',
    tabBarActive: '#a3e635',
    tabBarInactive: '#8899a6',
  },
  lavender: {
    background: '#faf8ff',
    primary: '#a78bfa',
    primaryDark: '#7c3aed',
    accent: '#fb923c',
    textTitle: '#3b1f6e',
    textBody: '#374151',
    textMuted: '#8b7aac',
    cardBg: '#ffffff',
    chipBg: '#f3f0ff',
    chipText: '#555555',
    chipSelectedBg: '#fb923c',
    chipSelectedText: '#ffffff',
    border: '#e4dff5',
    tabBar: '#ffffff',
    tabBarActive: '#a78bfa',
    tabBarInactive: '#9e9e9e',
  },
  navy: {
    background: '#f8fafc',
    primary: '#1e3a5f',
    primaryDark: '#0f172a',
    accent: '#f59e0b',
    textTitle: '#1e293b',
    textBody: '#374151',
    textMuted: '#64748b',
    cardBg: '#ffffff',
    chipBg: '#f1f5f9',
    chipText: '#555555',
    chipSelectedBg: '#f59e0b',
    chipSelectedText: '#ffffff',
    border: '#e2e8f0',
    tabBar: '#ffffff',
    tabBarActive: '#1e3a5f',
    tabBarInactive: '#9e9e9e',
  },
};

export const themeNames: { key: ThemeName; label: string }[] = [
  { key: 'earthy', label: 'Earthy Green' },
  { key: 'ocean', label: 'Ocean Blue' },
  { key: 'dark', label: 'Dark + Lime' },
  { key: 'lavender', label: 'Lavender' },
  { key: 'navy', label: 'Navy & Gold' },
];
