const mockConfigure = jest.fn();
const mockSignIn = jest.fn();
const mockHasPlayServices = jest.fn();
const mockGetTokens = jest.fn();

const mockLoginWithGoogle = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    signIn: (...args: unknown[]) => mockSignIn(...args),
    hasPlayServices: (...args: unknown[]) => mockHasPlayServices(...args),
    getTokens: (...args: unknown[]) => mockGetTokens(...args),
  },
  isCancelledResponse: (response: {type?: string}) => response?.type === 'cancelled',
  isSuccessResponse: (response: {type?: string}) => response?.type === 'success',
  isErrorWithCode: (error: {code?: string}) => Boolean(error?.code),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

jest.mock('../src/lib/api/endpoints', () => ({
  loginWithGoogle: (...args: unknown[]) => mockLoginWithGoogle(...args),
}));

import {GoogleSignInCancelledError, signInWithGoogle} from '../src/lib/auth/googleSignIn';

describe('google sign in helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends id_token from signIn response to backend', async () => {
    mockSignIn.mockResolvedValue({
      type: 'success',
      data: {
        idToken: 'google-id-token',
      },
    });
    mockLoginWithGoogle.mockResolvedValue({
      access_token: 'api-token',
      token_type: 'bearer',
      user: {id: 1, username: 'u', role: 'user', credits: 10, is_active: true},
    });

    const payload = await signInWithGoogle();

    expect(mockConfigure).toHaveBeenCalled();
    expect(mockLoginWithGoogle).toHaveBeenCalledWith('google-id-token');
    expect(payload.access_token).toBe('api-token');
  });

  test('falls back to getTokens when signIn idToken is missing', async () => {
    mockSignIn.mockResolvedValue({
      type: 'success',
      data: {
        idToken: null,
      },
    });
    mockGetTokens.mockResolvedValue({
      idToken: 'fallback-google-id-token',
      accessToken: 'access-token',
    });
    mockLoginWithGoogle.mockResolvedValue({
      access_token: 'api-token',
      token_type: 'bearer',
      user: {id: 2, username: 'u2', role: 'user', credits: 20, is_active: true},
    });

    await signInWithGoogle();

    expect(mockGetTokens).toHaveBeenCalledTimes(1);
    expect(mockLoginWithGoogle).toHaveBeenCalledWith('fallback-google-id-token');
  });

  test('throws cancel error when user cancels google dialog', async () => {
    mockSignIn.mockResolvedValue({
      type: 'cancelled',
      data: null,
    });

    await expect(signInWithGoogle()).rejects.toBeInstanceOf(GoogleSignInCancelledError);
    expect(mockLoginWithGoogle).not.toHaveBeenCalled();
  });
});
