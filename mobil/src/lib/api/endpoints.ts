import {apiClient} from './client';
import {ApiError} from '../../utils/error';
import type {
  AiCommentaryResponse,
  AvatarOptionsResponse,
  ChatFixtureSearchResponse,
  ChatMessageCreateRequest,
  ChatMessageCreateResponse,
  ChatThreadMessagesResponse,
  ChatThreadsResponse,
  ForgotPasswordResponse,
  FixtureBoardResponse,
  LoginResponse,
  ModelsResponse,
  SimulationResponse,
  CouponGenerateResponse,
  CouponTaskInfo,
  SavedCouponsResponse,
  SavedCoupon,
  SliderPublicResponse,
  ShowcasePublicResponse,
} from '../../types/api';

const AVATAR_FALLBACK_COUNT = 10;
const AVATAR_SOURCE_NAME = 'DiceBear Open Peeps';
const AVATAR_SOURCE_URL = 'https://www.dicebear.com/styles/open-peeps';
const AVATAR_LICENSE_NAME = 'CC0-1.0';
const AVATAR_LICENSE_URL = 'https://www.dicebear.com/licenses/';

function buildFallbackAvatarOptions(): AvatarOptionsResponse {
  const items = Array.from({length: AVATAR_FALLBACK_COUNT}, (_, index) => {
    const order = index + 1;
    const key = `open_peeps_${String(order).padStart(2, '0')}`;
    const seed = `footballai-${key}`;
    return {
      key,
      label: `Avatar ${String(order).padStart(2, '0')}`,
      image_url: `https://api.dicebear.com/9.x/open-peeps/png?seed=${encodeURIComponent(seed)}`,
      source_name: AVATAR_SOURCE_NAME,
      source_url: AVATAR_SOURCE_URL,
      license_name: AVATAR_LICENSE_NAME,
      license_url: AVATAR_LICENSE_URL,
    };
  });
  return {items, supports_update: false};
}

export async function login(email: string, password: string) {
  return apiClient.request<LoginResponse>('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: {email, password},
  });
}

export async function requestLoginCode(email: string) {
  return apiClient.request<{ok: boolean; message: string}>('/auth/login/code/request', {
    method: 'POST',
    skipAuth: true,
    body: {email},
  });
}

export async function verifyLoginCode(email: string, code: string) {
  return apiClient.request<LoginResponse>('/auth/login/code/verify', {
    method: 'POST',
    skipAuth: true,
    body: {email, code},
  });
}

export async function loginWithGoogle(idToken: string) {
  return apiClient.request<LoginResponse>('/auth/login/google', {
    method: 'POST',
    skipAuth: true,
    body: {id_token: idToken},
  });
}

export async function requestRegisterCode(email: string, password: string) {
  return apiClient.request<{ok: boolean; message: string}>('/auth/register/request', {
    method: 'POST',
    skipAuth: true,
    body: {email, password},
  });
}

export async function verifyRegisterCode(email: string, code: string) {
  return apiClient.request<LoginResponse>('/auth/register/verify', {
    method: 'POST',
    skipAuth: true,
    body: {email, code},
  });
}

export async function requestForgotPasswordCode(email: string) {
  return apiClient.request<ForgotPasswordResponse>('/auth/password/forgot/request', {
    method: 'POST',
    skipAuth: true,
    body: {email},
  });
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string) {
  return apiClient.request<ForgotPasswordResponse>('/auth/password/forgot/confirm', {
    method: 'POST',
    skipAuth: true,
    body: {email, code, new_password: newPassword},
  });
}

export async function getMe() {
  return apiClient.request<LoginResponse['user']>('/auth/me');
}

export async function getAvatarOptions() {
  try {
    const payload = await apiClient.request<AvatarOptionsResponse>('/auth/avatar-options', {skipAuth: true});
    if (Array.isArray(payload?.items) && payload.items.length > 0) {
      return {
        ...payload,
        supports_update: payload.supports_update ?? true,
      };
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 404) {
      return buildFallbackAvatarOptions();
    }
    throw error;
  }
  return buildFallbackAvatarOptions();
}

export async function updateMyAvatar(avatarKey: string) {
  try {
    return await apiClient.request<LoginResponse['user']>('/auth/me/avatar', {
      method: 'PATCH',
      body: {avatar_key: avatarKey},
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError('Sunucu surumu avatar guncellemesini desteklemiyor.', 404);
    }
    throw error;
  }
}

export type FixtureBoardFilters = {
  q?: string;
  league_id?: string;
  game_type?: string;
  target_date?: string;
  sort?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
};

export async function getFixtureBoard(filters: FixtureBoardFilters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page ?? 1));
  params.set('page_size', String(filters.page_size ?? 40));
  params.set('sort', filters.sort ?? 'asc');
  params.set('game_type', filters.game_type ?? 'all');

  if (filters.q?.trim()) {
    params.set('q', filters.q.trim());
  }
  if (filters.league_id && filters.league_id !== 'all') {
    params.set('league_id', filters.league_id);
  }
  if (filters.target_date?.trim()) {
    params.set('target_date', filters.target_date.trim());
  }

  return apiClient.request<FixtureBoardResponse>(`/fixtures/board?${params.toString()}`);
}

export async function getSliderPublic() {
  return apiClient.request<SliderPublicResponse>('/slider/public', {skipAuth: true});
}

export async function getShowcasePublic() {
  return apiClient.request<ShowcasePublicResponse>('/showcase/public', {skipAuth: true});
}

export async function getModels() {
  return apiClient.request<ModelsResponse>('/admin/models?model_type=all&page=1&page_size=500');
}

export async function simulateFixture(fixtureId: number, modelId?: string) {
  const params = new URLSearchParams();
  params.set('fixture_id', String(fixtureId));
  if (modelId) {
    params.set('model_id', modelId);
  }
  return apiClient.request<SimulationResponse>(`/simulate?${params.toString()}`);
}

export async function getAiCommentary(fixtureId: number, modelId?: string) {
  return apiClient.request<AiCommentaryResponse>('/ai/commentary', {
    method: 'POST',
    body: {
      fixture_id: fixtureId,
      model_id: modelId || null,
      language: 'tr',
    },
  });
}

export async function generateCoupons(
  prefix: '/coupons' | '/admin/coupons',
  payload: {
    days_window: number;
    matches_per_coupon: number;
    league_ids: number[];
    model_id?: string | null;
    include_math_coupons?: boolean;
    bankroll_tl?: number;
  },
) {
  return apiClient.request<CouponGenerateResponse>(`${prefix}/generate`, {
    method: 'POST',
    body: payload,
  });
}

export async function getCouponTask(prefix: '/coupons' | '/admin/coupons', taskId: string) {
  return apiClient.request<CouponTaskInfo>(`${prefix}/tasks/${taskId}`);
}

export async function saveCoupon(
  prefix: '/coupons' | '/admin/coupons',
  payload: {
    name: string;
    risk_level: string;
    source_task_id?: string;
    items: SavedCoupon['items'];
    summary: SavedCoupon['summary'];
  },
) {
  return apiClient.request<SavedCoupon>(`${prefix}/saved`, {
    method: 'POST',
    body: payload,
  });
}

export async function getSavedCoupons(prefix: '/coupons' | '/admin/coupons', archived = false) {
  return apiClient.request<SavedCouponsResponse>(`${prefix}/saved?archived=${archived ? 'true' : 'false'}&limit=100`);
}

export async function archiveSavedCoupon(prefix: '/coupons' | '/admin/coupons', couponId: number) {
  return apiClient.request(`${prefix}/saved/${couponId}/archive`, {
    method: 'POST',
  });
}

export async function restoreSavedCoupon(prefix: '/coupons' | '/admin/coupons', couponId: number) {
  return apiClient.request(`${prefix}/saved/${couponId}/restore`, {
    method: 'POST',
  });
}

export async function deleteSavedCoupon(prefix: '/coupons' | '/admin/coupons', couponId: number) {
  return apiClient.request(`${prefix}/saved/${couponId}`, {
    method: 'DELETE',
  });
}

export async function renameSavedCoupon(
  prefix: '/coupons' | '/admin/coupons',
  couponId: number,
  payload: {
    name: string;
  },
) {
  return apiClient.request<SavedCoupon>(`${prefix}/saved/${couponId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function getChatThreads(prefix: '/coupons' | '/admin/coupons', limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  return apiClient.request<ChatThreadsResponse>(`${prefix}/chat/threads?limit=${safeLimit}`);
}

export async function getChatThreadMessages(
  prefix: '/coupons' | '/admin/coupons',
  threadId: number,
  options: {
    limit?: number;
    beforeId?: number | null;
  } = {},
) {
  const safeThreadId = Math.max(1, Math.trunc(Number(threadId) || 0));
  const params = new URLSearchParams();
  params.set('limit', String(Math.max(1, Math.min(Number(options.limit) || 100, 300))));
  if (options.beforeId !== null && options.beforeId !== undefined) {
    const safeBeforeId = Math.trunc(Number(options.beforeId));
    if (Number.isFinite(safeBeforeId) && safeBeforeId > 0) {
      params.set('before_id', String(safeBeforeId));
    }
  }
  return apiClient.request<ChatThreadMessagesResponse>(`${prefix}/chat/threads/${safeThreadId}/messages?${params.toString()}`);
}

export async function searchChatFixtures(
  prefix: '/coupons' | '/admin/coupons',
  q: string,
  limit = 20,
) {
  const params = new URLSearchParams();
  params.set('q', String(q || '').trim());
  params.set('limit', String(Math.max(1, Math.min(Number(limit) || 20, 100))));
  return apiClient.request<ChatFixtureSearchResponse>(`${prefix}/chat/fixtures/search?${params.toString()}`);
}

export async function createChatMessage(prefix: '/coupons' | '/admin/coupons', payload: ChatMessageCreateRequest) {
  return apiClient.request<ChatMessageCreateResponse>(`${prefix}/chat/messages`, {
    method: 'POST',
    body: payload,
  });
}
