import {API_BASE_URL} from '@env';
import {NativeModules} from 'react-native';
import {ApiError} from '../../utils/error';
import {useAuthStore} from '../../store/authStore';

const rawApiBase = typeof API_BASE_URL === 'string' ? API_BASE_URL : '';
export const API_BASE = String(rawApiBase || 'http://localhost:8001').replace(/\/+$/, '');
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

function getMetroHost(): string {
  const raw = String((NativeModules as {SourceCode?: {scriptURL?: string}})?.SourceCode?.scriptURL || '').trim();
  if (!raw) {
    return '';
  }

  try {
    return String(new URL(raw).hostname || '').trim();
  } catch {
    const match = raw.match(/^https?:\/\/([^/:?#]+)/i);
    return String(match?.[1] || '').trim();
  }
}

function normalizeBase(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    const normalizedPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '';
    const withPath = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${normalizedPath}`;
    return withPath.replace(/\/+$/, '');
  } catch {
    return String(baseUrl || '').replace(/\/+$/, '');
  }
}

function getRequestBaseCandidates() {
  const primaryBase = normalizeBase(API_BASE);
  const candidates = [primaryBase];
  if (!__DEV__) {
    return candidates;
  }

  const metroHost = getMetroHost();
  if (!metroHost || LOOPBACK_HOSTS.has(metroHost.toLowerCase())) {
    return candidates;
  }

  try {
    const parsed = new URL(primaryBase);
    if (!LOOPBACK_HOSTS.has(String(parsed.hostname || '').toLowerCase())) {
      return candidates;
    }
    const fallbackBase = normalizeBase(`${parsed.protocol}//${metroHost}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname || ''}`);
    if (fallbackBase && fallbackBase !== primaryBase) {
      candidates.push(fallbackBase);
    }
  } catch {
    return candidates;
  }

  return candidates;
}

class ApiClient {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {method = 'GET', body, headers = {}, skipAuth = false} = options;
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const token = useAuthStore.getState().token;
    const baseCandidates = getRequestBaseCandidates();

    let response: Response | null = null;
    let networkFailure: unknown = null;

    for (const baseUrl of baseCandidates) {
      try {
        response = await fetch(`${baseUrl}${safePath}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(skipAuth ? {} : token ? {Authorization: `Bearer ${token}`} : {}),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        networkFailure = null;
        break;
      } catch (error) {
        networkFailure = error;
      }
    }

    if (!response) {
      const details = networkFailure instanceof Error ? networkFailure.message : 'Network request failed';
      throw new Error(
        `${details}. API ulasilamiyor (${baseCandidates.join(' -> ')}${safePath}). ` +
          'iOS cihazda test ediyorsan API_BASE_URL degerini Mac IP adresine ayarlayin (or: http://192.168.x.x:8001).',
      );
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = typeof payload?.detail === 'string' ? payload.detail : `Request failed: ${response.status}`;
      if (response.status === 401 && !skipAuth) {
        useAuthStore.getState().clearSession();
      }
      throw new ApiError(detail, response.status);
    }

    return payload as T;
  }
}

export const apiClient = new ApiClient();
