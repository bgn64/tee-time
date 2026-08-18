import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { themes, type ThemeColors, type ThemeName } from './themes';

export type ThemePreference = ThemeName | 'system';

type ThemeContextValue = {
  colors: ThemeColors;
  themeName: ThemeName;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const THEME_PREFERENCE_KEY = 'tee-time:theme-preference:v1';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useColorScheme();
  const [preference, setPreferenceState] = React.useState<ThemePreference>('system');
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((storedPreference) => {
        if (active && isThemePreference(storedPreference)) {
          setPreferenceState(storedPreference);
        }
      })
      .catch((error: unknown) => {
        console.warn('Could not restore appearance preference.', error);
      })
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(
        preference === 'system' ? 'unspecified' : preference,
      );
    }
  }, [preference]);

  const setPreference = React.useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, nextPreference);
    } catch (error: unknown) {
      console.warn('Could not save appearance preference.', error);
    }
  }, []);

  const themeName: ThemeName =
    preference === 'system'
      ? systemTheme === 'dark'
        ? 'dark'
        : 'light'
      : preference;

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      colors: themes[themeName],
      themeName,
      preference,
      setPreference,
    }),
    [preference, setPreference, themeName],
  );

  if (!hydrated) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>.');
  }
  return ctx;
}
