/**
 * Theme provider — exposes the single fixed Aurora Glass dark token set.
 *
 * The public shape still includes `themeName` so existing consumers keep
 * working, but the value is always `dark` and both palette entries resolve to
 * the same permanent Aurora theme.
 */

import React from 'react';

import { themes, type ThemeColors, type ThemeName } from './themes';

type ThemeContextValue = {
  colors: ThemeColors;
  themeName: ThemeName;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const themeName: ThemeName = 'dark';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = React.useMemo<ThemeContextValue>(
    () => ({ colors: themes.dark, themeName }),
    [],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>.');
  }
  return ctx;
}
