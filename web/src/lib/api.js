import { clearAuthToken, readAuthToken } from "./auth";

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";
export const API_BASE = String(RAW_API_BASE).replace(/\/+$/, "");

export async function apiRequest(path, options = {}) {
  const { skipAuth = false, headers: extraHeaders = {}, ...restOptions } = options || {};
  const safePath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (!skipAuth) {
    const token = readAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${safePath}`, {
    headers,
    ...restOptions,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !skipAuth) {
      clearAuthToken();
    }
    throw new Error(data.detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function loginWithGoogle(idToken) {
  return apiRequest("/auth/login/google", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ id_token: String(idToken || "").trim() }),
  });
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
