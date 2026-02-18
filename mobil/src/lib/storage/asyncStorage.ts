import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from './keys';
import type {AuthUser} from '../../types/api';

export async function saveToken(token: string) {
  await AsyncStorage.setItem(STORAGE_KEYS.authToken, token);
}

export async function removeToken() {
  await AsyncStorage.removeItem(STORAGE_KEYS.authToken);
}

export async function saveUserProfile(user: AuthUser) {
  await AsyncStorage.setItem(STORAGE_KEYS.userProfile, JSON.stringify(user));
}

export async function removeUserProfile() {
  await AsyncStorage.removeItem(STORAGE_KEYS.userProfile);
}

export async function clearAuthStorage() {
  await Promise.all([removeToken(), removeUserProfile()]);
}
