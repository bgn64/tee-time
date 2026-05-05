/**
 * Theme context providing color tokens and theme switching to the entire app.
 */

import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { ThemeColors, ThemeName, themes } from '@/constants/themes';

type ThemeContextValue = {
  colors: ThemeColors;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [themeName, setThemeName] = useState<ThemeName>('earthy');

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: themes[themeName],
      themeName,
      setThemeName,
    }),
    [themeName]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside AppThemeProvider.');
  }

  return context;
}
