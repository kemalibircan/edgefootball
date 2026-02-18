import { apiRequest } from "./api";

let couponApiPrefix = "/coupons";

function isNotFoundError(err) {
  const raw = String(err?.message || "").trim().toLowerCase();
  return raw === "not found" || raw.includes("404");
}

export function resetCouponApiPrefix() {
  couponApiPrefix = "/coupons";
}

export async function requestCouponApi(path, options = {}) {
  const suffixPath = String(path || "").trim();
  if (!suffixPath.startsWith("/")) {
    throw new Error("Coupon API path must start with '/'.");
  }

  const primary = `${couponApiPrefix}${suffixPath}`;
  try {
    return await apiRequest(primary, options);
  } catch (err) {
    const canFallback = couponApiPrefix !== "/admin/coupons" && isNotFoundError(err);
    if (!canFallback) {
      throw err;
    }
    const fallback = `/admin/coupons${suffixPath}`;
    const payload = await apiRequest(fallback, options);
    couponApiPrefix = "/admin/coupons";
    return payload;
  }
}

export async function fetchChatThreads(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  return requestCouponApi(`/chat/threads?limit=${safeLimit}`);
}

export async function fetchChatMessages(threadId, { limit = 100, beforeId = null } = {}) {
  const safeThreadId = Number(threadId);
  if (!Number.isFinite(safeThreadId) || safeThreadId <= 0) {
    throw new Error("threadId gecersiz.");
  }
  const params = new URLSearchParams();
  params.set("limit", String(Math.max(1, Math.min(Number(limit || 100), 300))));
  if (beforeId !== null && beforeId !== undefined) {
    const safeBeforeId = Number(beforeId);
    if (Number.isFinite(safeBeforeId) && safeBeforeId > 0) {
      params.set("before_id", String(safeBeforeId));
    }
  }
  return requestCouponApi(`/chat/threads/${safeThreadId}/messages?${params.toString()}`);
}

export async function searchChatFixtures(q, limit = 20) {
  const params = new URLSearchParams();
  params.set("q", String(q || "").trim());
  params.set("limit", String(Math.max(1, Math.min(Number(limit || 20), 100))));
  return requestCouponApi(`/chat/fixtures/search?${params.toString()}`);
}

export async function createChatMessage(payload) {
  return requestCouponApi("/chat/messages", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}
