export const AUTH_TOKEN_KEY = "football_ai_access_token";

function emitAuthTokenChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("auth-token-changed"));
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

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  emitAuthTokenChanged();
}
