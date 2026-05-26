/**
 * Theme provider — exposes the active light/dark token set, driven by the
 * device's color scheme (`react-native` useColorScheme()).
 *
 * No persistence and no manual override: `app.json` sets
 * `userInterfaceStyle: "automatic"` so the OS controls the scheme, and we
 * just react to it. A manual override can be layered on later by extending
 * the context value.
 */

import React from 'react';
import { useColorScheme } from 'react-native';

import { themes, type ThemeColors, type ThemeName } from './themes';

type ThemeContextValue = {
  colors: ThemeColors;
  themeName: ThemeName;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const themeName: ThemeName = scheme === 'dark' ? 'dark' : 'light';
  const value = React.useMemo<ThemeContextValue>(
    () => ({ colors: themes[themeName], themeName }),
    [themeName],
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
