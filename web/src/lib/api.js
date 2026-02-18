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
