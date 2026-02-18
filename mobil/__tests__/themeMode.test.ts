jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import {resolveThemeScheme} from '../src/theme/useAppTheme';
import {useUiStore} from '../src/store/uiStore';

describe('theme mode', () => {
  beforeEach(() => {
    useUiStore.setState(useUiStore.getInitialState(), true);
  });

  test('defaults to dark mode in initial store state', () => {
    expect(useUiStore.getInitialState().themeMode).toBe('dark');
  });

  test('resolves effective scheme from system and manual mode', () => {
    expect(resolveThemeScheme('system', 'dark')).toBe('dark');
    expect(resolveThemeScheme('system', 'light')).toBe('light');
    expect(resolveThemeScheme('light', 'dark')).toBe('light');
    expect(resolveThemeScheme('dark', 'light')).toBe('dark');
  });

  test('persists user-selected mode in ui store', () => {
    useUiStore.getState().setThemeMode('light');
    expect(useUiStore.getState().themeMode).toBe('light');

    useUiStore.getState().setThemeMode('dark');
    expect(useUiStore.getState().themeMode).toBe('dark');
  });
});
