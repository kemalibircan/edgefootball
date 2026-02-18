import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AuthUser, LoginResponse} from '../types/api';
import {clearAuthStorage, saveToken, saveUserProfile} from '../lib/storage/asyncStorage';

type AuthState = {
  token: string;
  user: AuthUser | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  isBootstrapping: boolean;
  setSession: (session: LoginResponse) => Promise<void>;
  setUser: (user: AuthUser) => Promise<void>;
  clearSession: () => void;
  setBootstrapping: (value: boolean) => void;
  setHydrated: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      token: '',
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      isBootstrapping: true,
      async setSession(session) {
        const token = String(session.access_token || '');
        const user = session.user;
        await Promise.all([saveToken(token), saveUserProfile(user)]);
        set({
          token,
          user,
          isAuthenticated: Boolean(token),
        });
      },
      async setUser(user) {
        await saveUserProfile(user);
        set({user});
      },
      clearSession() {
        clearAuthStorage().catch(() => undefined);
        set({
          token: '',
          user: null,
          isAuthenticated: false,
          isBootstrapping: false,
        });
      },
      setBootstrapping(value) {
        set({isBootstrapping: value});
      },
      setHydrated(value) {
        set({hasHydrated: value});
      },
    }),
    {
      name: 'football_ai_auth_store_v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => state => {
        useAuthStore.setState({hasHydrated: true});
        if (!state) {
          useAuthStore.setState({isBootstrapping: false});
        }
      },
    },
  ),
);

export function getAuthToken() {
  return useAuthStore.getState().token;
}

export function isManagerRole(role?: string) {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'superadmin';
}
