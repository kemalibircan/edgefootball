import {useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {useUiStore} from '../store/uiStore';
import {getThemeColors, setActiveThemeScheme, type AppColors, type ThemeScheme} from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';

export function resolveThemeScheme(mode: ThemeMode, systemScheme: string | null): ThemeScheme {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  return systemScheme === 'light' ? 'light' : 'dark';
}

export function useAppTheme() {
  const mode = useUiStore(state => state.themeMode);
  const setThemeMode = useUiStore(state => state.setThemeMode);
  const systemScheme = useColorScheme();

  const effectiveScheme = useMemo<ThemeScheme>(() => resolveThemeScheme(mode, systemScheme), [mode, systemScheme]);

  const appColors = useMemo<AppColors>(() => {
    setActiveThemeScheme(effectiveScheme);
    return getThemeColors(effectiveScheme);
  }, [effectiveScheme]);

  return {
    mode,
    effectiveScheme,
    colors: appColors,
    setMode: setThemeMode,
  } as const;
}
