import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../lib/storage/keys';

type UiState = {
  lastLeagueId: string;
  lastGameType: string;
  themeMode: 'system' | 'light' | 'dark';
  setLastLeagueId: (value: string) => void;
  setLastGameType: (value: string) => void;
  setThemeMode: (value: 'system' | 'light' | 'dark') => void;
};

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      lastLeagueId: 'all',
      lastGameType: 'all',
      themeMode: 'dark',
      setLastLeagueId(value) {
        set({lastLeagueId: value});
      },
      setLastGameType(value) {
        set({lastGameType: value});
      },
      setThemeMode(value) {
        set({themeMode: value});
      },
    }),
    {
      name: STORAGE_KEYS.uiState,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        lastLeagueId: state.lastLeagueId,
        lastGameType: state.lastGameType,
        themeMode: state.themeMode,
      }),
    },
  ),
);
