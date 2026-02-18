import {API_BASE_URL} from '@env';
import {ApiError} from '../../utils/error';
import {useAuthStore} from '../../store/authStore';

const rawApiBase = typeof API_BASE_URL === 'string' ? API_BASE_URL : '';
export const API_BASE = String(rawApiBase || 'http://localhost:8001').replace(/\/+$/, '');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

class ApiClient {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {method = 'GET', body, headers = {}, skipAuth = false} = options;
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const token = useAuthStore.getState().token;

    const response = await fetch(`${API_BASE}${safePath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(skipAuth ? {} : token ? {Authorization: `Bearer ${token}`} : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

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
