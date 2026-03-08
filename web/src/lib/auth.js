export const AUTH_TOKEN_KEY = "football_ai_access_token";
const TOKEN_EXP_SKEW_SECONDS = 15;

function emitAuthTokenChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("auth-token-changed"));
}

function isDevRuntime() {
  try {
    return Boolean(import.meta?.env?.DEV);
  } catch (_err) {
    return false;
  }
}

function debugAuth(message, detail = null) {
  if (!isDevRuntime()) return;
  if (detail === null || detail === undefined || detail === "") {
    console.info(`[auth] ${message}`);
    return;
  }
  console.info(`[auth] ${message}`, detail);
}

function decodeBase64Url(segment) {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return atob(normalized + padding);
  } catch (_err) {
    return "";
  }
}

export function decodeTokenPayload(token = readAuthToken()) {
  const rawToken = String(token || "").trim();
  if (!rawToken) return null;
  const payloadSegment = rawToken.split(".", 1)[0];
  const payloadJson = decodeBase64Url(payloadSegment);
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_err) {
    return null;
  }
}

export function readAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function writeAuthToken(token) {
  if (typeof window === "undefined") return;
  const next = String(token || "").trim();
  if (next) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, next);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  emitAuthTokenChanged();
}

export function isTokenExpired(token = readAuthToken(), options = {}) {
  const skewSeconds = Math.max(0, Number(options?.skewSeconds ?? TOKEN_EXP_SKEW_SECONDS) || 0);
  const payload = decodeTokenPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  const nowEpoch = Math.floor(Date.now() / 1000);
  return exp <= nowEpoch + skewSeconds;
}

export function clearAuthToken(reason = "manual") {
  if (typeof window === "undefined") return;
  const normalizedReason = String(reason || "").trim() || "manual";
  debugAuth("Clearing auth token", normalizedReason);
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  emitAuthTokenChanged();
}
