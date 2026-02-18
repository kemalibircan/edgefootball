import {Platform} from 'react-native';
import {GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID} from '@env';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type {LoginResponse} from '../../types/api';
import {loginWithGoogle} from '../api/endpoints';

let isGoogleConfigured = false;

function normalizeEnvValue(value: unknown) {
  return String(value || '').trim();
}

function isConfiguredClientId(value: string) {
  if (!value) {
    return false;
  }

  const lowered = value.toLowerCase();
  return (
    !value.includes('<') &&
    !value.includes('>') &&
    !lowered.includes('replace') &&
    !lowered.includes('your_') &&
    !lowered.includes('example')
  );
}

function assertGoogleClientIds(webClientId: string, iosClientId: string) {
  if (!isConfiguredClientId(webClientId)) {
    throw new Error(
      'GOOGLE_WEB_CLIENT_ID ayarlanmamis. mobil/.env.development dosyasina Google Web Client ID degerini ekleyin.',
    );
  }

  if (Platform.OS === 'ios' && !isConfiguredClientId(iosClientId)) {
    throw new Error(
      'iOS icin GOOGLE_IOS_CLIENT_ID ayarlanmamis. mobil/.env.development dosyasina iOS Client ID ekleyin veya GoogleService-Info.plist dosyasini ios projesine ekleyin.',
    );
  }
}

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super('Google giris iptal edildi.');
    this.name = 'GoogleSignInCancelledError';
  }
}

export function configureGoogleSignIn() {
  if (isGoogleConfigured) {
    return;
  }

  const webClientId = normalizeEnvValue(GOOGLE_WEB_CLIENT_ID);
  const iosClientId = normalizeEnvValue(GOOGLE_IOS_CLIENT_ID);
  const hasIosClientId = isConfiguredClientId(iosClientId);

  assertGoogleClientIds(webClientId, iosClientId);

  GoogleSignin.configure({
    webClientId,
    ...(hasIosClientId ? {iosClientId} : {}),
    offlineAccess: false,
  });
  isGoogleConfigured = true;
}

export async function signInWithGoogle(): Promise<LoginResponse> {
  configureGoogleSignIn();

  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
    }

    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      throw new GoogleSignInCancelledError();
    }
    if (!isSuccessResponse(response)) {
      throw new Error('Google giris yaniti gecersiz.');
    }

    let idToken = String(response.data.idToken || '').trim();
    if (!idToken) {
      const tokens = await GoogleSignin.getTokens();
      idToken = String(tokens?.idToken || '').trim();
    }

    if (!idToken) {
      throw new Error('Google id_token alinamadi.');
    }
    return loginWithGoogle(idToken);
  } catch (error) {
    if (error instanceof GoogleSignInCancelledError) {
      throw error;
    }
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new GoogleSignInCancelledError();
      }
      if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error('Google giris islemi zaten devam ediyor.');
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services kullanilamiyor.');
      }
    }
    throw error;
  }
}
