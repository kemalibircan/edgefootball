import { clearAuthToken, readAuthToken, writeAuthToken } from "./auth";

// Backend varsayılan olarak Makefile'da port 8000 ile çalışıyor.
// VITE_API_BASE_URL tanımlı değilse, otomatik olarak 8000'e gider.
const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
export const API_BASE = String(RAW_API_BASE).replace(/\/+$/, "");
const WEB_CLIENT_PLATFORM = "web";

let refreshInFlight = null;
let authMeInFlight = null;
let authMeListenerRegistered = false;
const AUTH_ME_CACHE_TTL_MS = 4 * 1000;
let authMeCache = {
  token: "",
  payload: null,
  expiresAt: 0,
};

const TERMINAL_AUTH_DETAIL_PATTERNS = [
  /^token expired$/i,
  /^invalid token format$/i,
  /^invalid token signature$/i,
  /^invalid token payload$/i,
  /^invalid token subject$/i,
  /^invalid token session$/i,
  /^authentication required$/i,
  /^user not found or inactive$/i,
  /^session invalidated$/i,
];

const AUTH_REFRESH_EXCLUDED_PATHS = new Set([
  "/auth/refresh",
  "/auth/login",
  "/auth/login/google",
  "/auth/login/code/request",
  "/auth/login/code/verify",
  "/auth/register/request",
  "/auth/register/verify",
]);

function extractDetailText(detail) {
  if (typeof detail === "string") {
    return detail.trim();
  }
  if (Array.isArray(detail) && detail.length) {
    const firstString = detail.find((item) => typeof item === "string");
    if (typeof firstString === "string") return firstString.trim();
    const firstMessage = detail.find((item) => item && typeof item === "object" && typeof item.msg === "string");
    if (firstMessage?.msg) return String(firstMessage.msg).trim();
  }
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return String(detail.message).trim();
  }
  return "";
}

function isTerminalAuthDetail(detailText) {
  const normalized = String(detailText || "").trim();
  if (!normalized) return false;
  return TERMINAL_AUTH_DETAIL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function toAuthClearReason(detailText) {
  const normalized = String(detailText || "").trim().toLowerCase();
  if (!normalized) return "auth_terminal";
  if (normalized === "token expired") return "token_expired";
  if (normalized === "invalid token format") return "invalid_token_format";
  if (normalized === "invalid token signature") return "invalid_token_signature";
  if (normalized === "invalid token payload") return "invalid_token_payload";
  if (normalized === "invalid token subject") return "invalid_token_subject";
  if (normalized === "invalid token session") return "invalid_token_session";
  if (normalized === "authentication required") return "authentication_required";
  if (normalized === "user not found or inactive") return "user_not_found_or_inactive";
  if (normalized === "session invalidated") return "session_invalidated";
  return "auth_terminal";
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(String(message || "Request failed"));
    this.name = "ApiError";
    this.status = Number(options.status) || 0;
    this.path = String(options.path || "");
    this.detail = options.detail ?? null;
    this.isAuthTerminal = options.isAuthTerminal === true;
  }
}

export function isAuthTerminalError(error) {
  return Boolean(error && typeof error === "object" && error.isAuthTerminal === true);
}

function authErrorDetailText(error) {
  if (!error || typeof error !== "object") return "";
  const detailText = extractDetailText(error.detail);
  if (detailText) return detailText;
  return String(error.message || "").trim();
}

function normalizePath(path) {
  const raw = String(path || "");
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function stripQuery(path) {
  return String(path || "").split("?", 1)[0];
}

function requestMethod(options = {}) {
  return String(options?.method || "GET").trim().toUpperCase();
}

function isGetAuthMeRequest(path, options = {}) {
  return stripQuery(normalizePath(path)) === "/auth/me" && requestMethod(options) === "GET";
}

function invalidateAuthMeCache() {
  authMeCache = {
    token: "",
    payload: null,
    expiresAt: 0,
  };
  authMeInFlight = null;
}

function ensureAuthMeCacheListener() {
  if (authMeListenerRegistered || typeof window === "undefined") return;
  window.addEventListener("auth-token-changed", invalidateAuthMeCache);
  authMeListenerRegistered = true;
}

function maybeInvalidateAuthMeAfterSuccess(path, options = {}) {
  const cleanPath = stripQuery(normalizePath(path));
  const method = requestMethod(options);
  if (cleanPath === "/auth/me/avatar" && method === "PATCH") {
    invalidateAuthMeCache();
    return;
  }
  if (cleanPath === "/auth/advanced-mode" && method === "POST") {
    invalidateAuthMeCache();
  }
}

async function requestAuthMeWithCache(path, options, requestFn) {
  ensureAuthMeCacheListener();
  const token = String(readAuthToken() || "").trim();
  const now = Date.now();
  if (token && authMeCache.token === token && authMeCache.payload && authMeCache.expiresAt > now) {
    return authMeCache.payload;
  }
  if (token && authMeInFlight && authMeInFlight.token === token) {
    return authMeInFlight.promise;
  }

  const promise = (async () => {
    const payload = await requestFn();
    const currentToken = String(readAuthToken() || "").trim();
    if (token && currentToken === token) {
      authMeCache = {
        token,
        payload,
        expiresAt: Date.now() + AUTH_ME_CACHE_TTL_MS,
      };
    }
    return payload;
  })();

  authMeInFlight = { token, promise };
  return promise.finally(() => {
    if (authMeInFlight?.promise === promise) {
      authMeInFlight = null;
    }
  });
}

function shouldAttemptRefresh(path, options, error, allowRefreshRetry) {
  if (!allowRefreshRetry) return false;
  if (!error || Number(error.status) !== 401) return false;
  if (options?.skipAuth) return false;
  if (options?.auth401Mode === "never") return false;
  if (AUTH_REFRESH_EXCLUDED_PATHS.has(normalizePath(path))) return false;
  if (!readAuthToken()) return false;
  return true;
}

async function rawApiRequest(path, options = {}) {
  const {
    skipAuth = false,
    auth401Mode: _auth401Mode = "auto",
    allowRefreshRetry: _allowRefreshRetry = true,
    headers: extraHeaders = {},
    ...restOptions
  } = options || {};
  const safePath = normalizePath(path);
  const headers = {
    "Content-Type": "application/json",
    "X-Client-Platform": WEB_CLIENT_PLATFORM,
    ...extraHeaders,
  };

  if (!skipAuth) {
    const token = readAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${safePath}`, {
      headers,
      credentials: "include",
      ...restOptions,
    });
  } catch (err) {
    const message = String(err?.message || "Network request failed");
    throw new ApiError(message, {
      status: 0,
      path: safePath,
      detail: null,
      isAuthTerminal: false,
    });
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = data?.detail ?? null;
    const detailText = extractDetailText(detail);
    const message = detailText || `Request failed: ${response.status}`;
    const isAuthTerminal = response.status === 401 && isTerminalAuthDetail(detailText);
    throw new ApiError(message, {
      status: response.status,
      path: safePath,
      detail: detail ?? data ?? null,
      isAuthTerminal,
    });
  }

  return response.json();
}

async function refreshAccessToken() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const payload = await rawApiRequest("/auth/refresh", {
        method: "POST",
        skipAuth: true,
        auth401Mode: "never",
        body: JSON.stringify({}),
      });
      const nextToken = String(payload?.access_token || "").trim();
      if (!nextToken) {
        throw new ApiError("Authentication required", {
          status: 401,
          path: "/auth/refresh",
          detail: "Authentication required",
          isAuthTerminal: true,
        });
      }
      writeAuthToken(nextToken);
      return { ok: true, terminal: false };
    } catch (error) {
      const terminal = Number(error?.status) === 401 && isAuthTerminalError(error);
      if (terminal) {
        clearAuthToken("api_refresh_failed_terminal");
      }
      return { ok: false, terminal };
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiRequest(path, options = {}) {
  const safePath = normalizePath(path);
  const allowRefreshRetry = Boolean(options?.allowRefreshRetry !== false);
  const request = () => rawApiRequest(safePath, options);
  let refreshOutcome = null;

  try {
    const payload = isGetAuthMeRequest(safePath, options)
      ? await requestAuthMeWithCache(safePath, options, request)
      : await request();
    maybeInvalidateAuthMeAfterSuccess(safePath, options);
    return payload;
  } catch (error) {
    if (shouldAttemptRefresh(safePath, options, error, allowRefreshRetry)) {
      refreshOutcome = await refreshAccessToken();
      if (refreshOutcome?.ok) {
        const retryOptions = { ...options, allowRefreshRetry: false };
        const retryRequest = () => rawApiRequest(safePath, retryOptions);
        const payload = isGetAuthMeRequest(safePath, retryOptions)
          ? await requestAuthMeWithCache(safePath, retryOptions, retryRequest)
          : await retryRequest();
        maybeInvalidateAuthMeAfterSuccess(safePath, retryOptions);
        return payload;
      }
    }

    if (
      Number(error?.status) === 401 &&
      !options?.skipAuth &&
      options?.auth401Mode !== "never" &&
      isAuthTerminalError(error) &&
      (refreshOutcome === null || refreshOutcome?.terminal === true)
    ) {
      clearAuthToken(`api_401_${toAuthClearReason(authErrorDetailText(error))}`);
    }
    throw error;
  }
}

export async function loginWithGoogle(idToken) {
  return apiRequest("/auth/login/google", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ id_token: String(idToken || "").trim() }),
  });
}

export async function logoutCurrentSession(options = {}) {
  const logoutAll = options?.all === true;
  const endpoint = logoutAll ? "/auth/logout-all" : "/auth/logout";
  try {
    await rawApiRequest(endpoint, {
      method: "POST",
      auth401Mode: "never",
    });
    invalidateAuthMeCache();
  } catch (error) {
    if (Number(error?.status) === 401) {
      invalidateAuthMeCache();
      return;
    }
    throw error;
  }
}

// ============================================================================
// Saved Predictions API
// ============================================================================

/**
 * Save a prediction for a fixture
 * @param {number} fixtureId - The fixture ID
 * @param {Object} options - Save options
 * @param {string} [options.note] - Optional note
 * @param {Object} [options.simulation] - Pre-computed simulation result
 * @param {Object} [options.aiPayload] - Pre-computed AI commentary
 * @param {boolean} [options.includeAI] - Generate AI if missing
 * @param {string} [options.modelId] - Model ID to use
 * @param {string} [options.language] - Language for AI commentary
 * @returns {Promise<Object>} Saved prediction result
 */
export async function savePrediction(fixtureId, options = {}) {
  const {
    note = null,
    simulation = null,
    aiPayload = null,
    includeAI = false,
    modelId = null,
    language = "tr",
  } = options;

  return apiRequest("/admin/predictions/save", {
    method: "POST",
    body: JSON.stringify({
      fixture_id: fixtureId,
      note,
      simulation,
      ai_payload: aiPayload,
      include_ai_if_missing: includeAI,
      model_id: modelId,
      language,
    }),
  });
}

/**
 * Get predictions list with filters
 * @param {Object} filters - Filter options
 * @param {string} [filters.dateFrom] - Start date (YYYY-MM-DD)
 * @param {string} [filters.dateTo] - End date (YYYY-MM-DD)
 * @param {boolean} [filters.mineOnly] - Only user's predictions
 * @param {boolean} [filters.archive] - Show past matches
 * @param {number} [filters.page] - Page number
 * @param {number} [filters.pageSize] - Items per page
 * @returns {Promise<Object>} Paginated predictions list
 */
export async function getPredictionsList(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.mineOnly !== undefined) params.set("mine_only", String(filters.mineOnly));
  if (filters.archive !== undefined) params.set("archive", String(filters.archive));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("page_size", String(filters.pageSize));

  const url = `/admin/predictions/list?${params.toString()}`;
  console.log("[API] getPredictionsList URL:", url);
  
  try {
    const result = await apiRequest(url);
    console.log("[API] getPredictionsList result:", result);
    return result;
  } catch (error) {
    console.error("[API] getPredictionsList error:", error);
    throw error;
  }
}

/**
 * Get daily predictions
 * @param {string} day - Date (YYYY-MM-DD)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Daily predictions
 */
export async function getDailyPredictions(day, options = {}) {
  const params = new URLSearchParams();
  params.set("day", day);
  
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("page_size", String(options.pageSize));
  if (options.leagueId) params.set("league_id", String(options.leagueId));
  if (options.mineOnly !== undefined) params.set("mine_only", String(options.mineOnly));
  if (options.autoRefresh) params.set("auto_refresh_results", "true");

  return apiRequest(`/admin/predictions/daily?${params.toString()}`);
}

/**
 * Get prediction statistics
 * @param {Object} filters - Filter options
 * @param {string} [filters.dateFrom] - Start date
 * @param {string} [filters.dateTo] - End date
 * @param {number} [filters.leagueId] - League ID filter
 * @returns {Promise<Object>} Statistics data
 */
export async function getPredictionStats(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.leagueId) params.set("league_id", String(filters.leagueId));

  return apiRequest(`/admin/predictions/stats?${params.toString()}`);
}

/**
 * Refresh actual result for a prediction
 * @param {number} predictionId - Prediction ID
 * @returns {Promise<Object>} Updated prediction
 */
export async function refreshPrediction(predictionId) {
  return apiRequest(`/admin/predictions/${predictionId}/refresh-result`, {
    method: "POST",
  });
}

/**
 * Bulk refresh predictions
 * @param {Object} options - Refresh options
 * @param {string} [options.dateFrom] - Start date
 * @param {string} [options.dateTo] - End date
 * @param {number[]} [options.predictionIds] - Specific prediction IDs
 * @returns {Promise<Object>} Refresh results
 */
export async function bulkRefreshPredictions(options = {}) {
  const params = new URLSearchParams();
  if (options.dateFrom) params.set("date_from", String(options.dateFrom));
  if (options.dateTo) params.set("date_to", String(options.dateTo));
  if (Array.isArray(options.predictionIds)) {
    options.predictionIds.forEach((predictionId) => {
      if (predictionId !== null && predictionId !== undefined) {
        params.append("prediction_ids", String(predictionId));
      }
    });
  }
  const query = params.toString();
  const endpoint = query ? `/admin/predictions/bulk-refresh?${query}` : "/admin/predictions/bulk-refresh";
  return apiRequest(endpoint, {
    method: "POST",
  });
}

/**
 * Delete a prediction
 * @param {number} predictionId - Prediction ID
 * @returns {Promise<Object>} Delete result
 */
export async function deletePrediction(predictionId) {
  return apiRequest(`/admin/predictions/${predictionId}`, {
    method: "DELETE",
  });
}

// ============================================================================
// Public SEO API
// ============================================================================

const CAPABILITY_CACHE_TTL_MS = 5 * 60 * 1000;
let capabilitiesCache = null;
let capabilitiesCacheAt = 0;
let capabilitiesPromise = null;

function buildDefaultCapabilities() {
  return {
    blog_public: false,
    predictions_public: false,
    fixture_detail_public: false,
    known: false,
    source: {
      health: false,
      openapi: false,
    },
    paths: [],
  };
}

function normalizeCapabilityPath(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value}`;
}

function pathSetIncludes(paths, path) {
  const safePath = normalizeCapabilityPath(path);
  return Boolean(safePath && Array.isArray(paths) && paths.includes(safePath));
}

export function isMissingEndpointError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("404") || message.includes("not found");
}

export async function getApiCapabilities(options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const now = Date.now();
  if (!forceRefresh && capabilitiesCache && now - capabilitiesCacheAt <= CAPABILITY_CACHE_TTL_MS) {
    return capabilitiesCache;
  }
  if (!forceRefresh && capabilitiesPromise) {
    return capabilitiesPromise;
  }

  capabilitiesPromise = (async () => {
    const next = buildDefaultCapabilities();
    let openApiPaths = [];

    try {
      const healthResponse = await fetch(`${API_BASE}/health`, {
        cache: "no-store",
      });
      const healthPayload = await healthResponse.json().catch(() => ({}));
      if (healthResponse.ok && healthPayload?.capabilities && typeof healthPayload.capabilities === "object") {
        const caps = healthPayload.capabilities;
        next.blog_public = caps.blog_public === true;
        next.predictions_public = caps.predictions_public === true;
        next.fixture_detail_public = caps.fixture_detail_public === true;
        next.source.health = true;
      }
    } catch (_err) {
      // Health endpoint capability hints are optional.
    }

    try {
      const openApiResponse = await fetch(`${API_BASE}/openapi.json`, {
        cache: "no-store",
      });
      const openApiPayload = await openApiResponse.json().catch(() => ({}));
      const pathsObject = openApiPayload?.paths;
      if (openApiResponse.ok && pathsObject && typeof pathsObject === "object") {
        openApiPaths = Object.keys(pathsObject).map((item) => normalizeCapabilityPath(item)).filter(Boolean);
        next.source.openapi = openApiPaths.length > 0;
      }
    } catch (_err) {
      // OpenAPI lookup is best-effort.
    }

    if (openApiPaths.length) {
      next.blog_public =
        next.blog_public ||
        pathSetIncludes(openApiPaths, "/blog/posts") ||
        pathSetIncludes(openApiPaths, "/blog/posts/{slug}");
      next.predictions_public =
        next.predictions_public ||
        pathSetIncludes(openApiPaths, "/predictions/public") ||
        pathSetIncludes(openApiPaths, "/predictions/public/{fixture_id}");
      next.fixture_detail_public =
        next.fixture_detail_public || pathSetIncludes(openApiPaths, "/fixtures/public/{fixture_id}");
      next.paths = openApiPaths;
    }

    next.known = next.source.health || next.source.openapi;
    capabilitiesCache = next;
    capabilitiesCacheAt = Date.now();
    capabilitiesPromise = null;
    return next;
  })();

  return capabilitiesPromise;
}

export async function hasEndpoint(path, options = {}) {
  const unknownAs = options.unknownAs !== undefined ? Boolean(options.unknownAs) : true;
  const safePath = normalizeCapabilityPath(path);
  const resolveSupport = (caps) => {
    if (
      safePath === "/blog/posts" ||
      safePath === "/blog/posts/{slug}" ||
      safePath === "/blog/categories" ||
      safePath === "/blog/tags"
    ) {
      return caps.known ? caps.blog_public : unknownAs;
    }

    if (safePath === "/predictions/public" || safePath === "/predictions/public/{fixture_id}") {
      return caps.known ? caps.predictions_public : unknownAs;
    }

    if (safePath === "/fixtures/public/{fixture_id}") {
      return caps.known ? caps.fixture_detail_public : unknownAs;
    }

    if (Array.isArray(caps.paths) && caps.paths.length) {
      return pathSetIncludes(caps.paths, safePath);
    }

    return unknownAs;
  };

  if (!safePath) return unknownAs;

  const caps = await getApiCapabilities();
  let supported = resolveSupport(caps);
  if (supported) {
    return true;
  }

  // Negative capability data can be stale right after backend restarts/deploys.
  // Recheck once with force refresh before declaring endpoint unavailable.
  const refreshed = await getApiCapabilities({ forceRefresh: true });
  supported = resolveSupport(refreshed);
  return Boolean(supported);
}

export async function getPublicFixtures(options = {}) {
  const params = new URLSearchParams();
  params.set("page", String(options.page || 1));
  params.set("page_size", String(options.pageSize || 24));
  params.set("upcoming_only", String(options.upcomingOnly !== false));
  params.set("sort", String(options.sort || "asc"));
  if (options.leagueId) params.set("league_id", String(options.leagueId));
  if (options.q) params.set("q", String(options.q));
  return apiRequest(`/fixtures/public?${params.toString()}`, { skipAuth: true });
}

export async function getPublicFixtureDetail(fixtureId) {
  return apiRequest(`/fixtures/public/${fixtureId}`, { skipAuth: true });
}

export async function getPublicPredictions(options = {}) {
  const params = new URLSearchParams();
  params.set("locale", String(options.locale || "tr"));
  params.set("page", String(options.page || 1));
  params.set("page_size", String(options.pageSize || 12));
  return apiRequest(`/predictions/public?${params.toString()}`, { skipAuth: true });
}

export async function getPublicPredictionDetail(fixtureId, options = {}) {
  const params = new URLSearchParams();
  params.set("locale", String(options.locale || "tr"));
  return apiRequest(`/predictions/public/${fixtureId}?${params.toString()}`, { skipAuth: true });
}

export async function getBlogPosts(options = {}) {
  const params = new URLSearchParams();
  params.set("locale", String(options.locale || "tr"));
  params.set("page", String(options.page || 1));
  params.set("page_size", String(options.pageSize || 12));
  if (options.category) params.set("category", String(options.category));
  if (options.tag) params.set("tag", String(options.tag));
  return apiRequest(`/blog/posts?${params.toString()}`, { skipAuth: true });
}

export async function getBlogPostDetail(slug, options = {}) {
  const params = new URLSearchParams();
  params.set("locale", String(options.locale || "tr"));
  return apiRequest(`/blog/posts/${encodeURIComponent(slug)}?${params.toString()}`, { skipAuth: true });
}

export async function getBlogCategories(options = {}) {
  const params = new URLSearchParams();
  params.set("locale", String(options.locale || "tr"));
  return apiRequest(`/blog/categories?${params.toString()}`, { skipAuth: true });
}

export async function getBlogTags(options = {}) {
  const params = new URLSearchParams();
  params.set("locale", String(options.locale || "tr"));
  return apiRequest(`/blog/tags?${params.toString()}`, { skipAuth: true });
}
