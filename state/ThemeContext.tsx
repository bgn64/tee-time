/**
 * Theme context providing color tokens and theme switching to the entire app.
 *
 * Persists `themeName` to AsyncStorage so the user's theme choice survives
 * app restarts. `hydrated` is exposed so the root layout can wait for storage
 * reads before un-blocking the splash screen.
 */

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { ThemeColors, ThemeName, themes } from '@/constants/themes';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';

const DEFAULT_THEME: ThemeName = 'earthy';

type ThemeContextValue = {
  colors: ThemeColors;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from storage on mount.
  useEffect(() => {
    let cancelled = false;
    loadJSON<ThemeName>(STORAGE_KEYS.THEME_NAME, DEFAULT_THEME).then((name) => {
      if (cancelled) return;
      setThemeName(name);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change, but only after hydration so we don't stomp stored
  // data with the seed on first render.
  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.THEME_NAME, themeName);
  }, [themeName, hydrated]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: themes[themeName],
      themeName,
      setThemeName,
      hydrated,
    }),
    [themeName, hydrated]
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
