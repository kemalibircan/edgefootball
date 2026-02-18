const DEFAULT_MODEL_PAGE_SIZE = 500;

function toModelId(item) {
  return String(item?.model_id || item?.id || "").trim();
}

function toLeagueId(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toTimestamp(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return 0;
  return ts;
}

export function parseModelLeagueId(item) {
  if (!item || typeof item !== "object") return null;
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const candidates = [meta.league_id, item.league_id];
  for (const candidate of candidates) {
    const parsed = toLeagueId(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function resolveModelScope(item) {
  const rawScope = String(item?.model_scope || item?.meta?.model_scope || "")
    .trim()
    .toLowerCase();
  if (rawScope === "ready" || rawScope === "user") {
    return rawScope;
  }

  const ownerRole = String(item?.created_by_role || item?.meta?.created_by_role || "")
    .trim()
    .toLowerCase();
  if (ownerRole === "admin" || ownerRole === "superadmin") {
    return "ready";
  }

  const ownerId = item?.created_by_user_id ?? item?.meta?.created_by_user_id;
  if (ownerId === null || ownerId === undefined || ownerId === "") {
    return "ready";
  }
  return "user";
}

export function isVisibleForCurrentUser(item, currentUser = null) {
  if (!item || typeof item !== "object") return false;
  const role = String(currentUser?.role || "")
    .trim()
    .toLowerCase();
  if (role === "superadmin") {
    return true;
  }
  return resolveModelScope(item) === "ready" || Boolean(item?.is_owned_by_me);
}

export function filterByLeague(items, leagueIdOrAll = "all") {
  const safeItems = Array.isArray(items) ? items : [];
  const raw = String(leagueIdOrAll ?? "all").trim().toLowerCase();
  if (!raw || raw === "all") return safeItems;

  const targetLeagueId = toLeagueId(raw);
  if (targetLeagueId === null) return safeItems;
  return safeItems.filter((item) => parseModelLeagueId(item) === targetLeagueId);
}

export function sortVisibleModels(items, activeModelId = "") {
  const safeItems = Array.isArray(items) ? [...items] : [];
  const activeId = String(activeModelId || "").trim();
  return safeItems.sort((left, right) => {
    const leftId = toModelId(left);
    const rightId = toModelId(right);
    const leftActive = leftId && leftId === activeId ? 1 : 0;
    const rightActive = rightId && rightId === activeId ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    const dateDelta = toTimestamp(right?.trained_at) - toTimestamp(left?.trained_at);
    if (dateDelta !== 0) return dateDelta;

    const leftName = String(left?.model_name || leftId || "").trim();
    const rightName = String(right?.model_name || rightId || "").trim();
    const nameOrder = leftName.localeCompare(rightName, "tr");
    if (nameOrder !== 0) return nameOrder;

    return leftId.localeCompare(rightId, "tr");
  });
}

export async function fetchAllModels(apiRequest, options = {}) {
  const requestedPageSize = Number(options?.pageSize || DEFAULT_MODEL_PAGE_SIZE);
  const pageSize = Math.max(50, Math.min(1000, Number.isFinite(requestedPageSize) ? requestedPageSize : DEFAULT_MODEL_PAGE_SIZE));

  let page = 1;
  let totalPages = 1;
  let activeModelId = "";
  const mergedItems = [];
  const seenIds = new Set();

  while (page <= totalPages) {
    const params = new URLSearchParams();
    params.set("model_type", "all");
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    const payload = await apiRequest(`/admin/models?${params.toString()}`);
    if (!activeModelId) {
      activeModelId = String(payload?.active_model_id || "").trim();
    }
    const items = Array.isArray(payload?.items) ? payload.items : [];
    for (const item of items) {
      const modelId = toModelId(item);
      if (!modelId) continue;
      if (seenIds.has(modelId)) continue;
      seenIds.add(modelId);
      mergedItems.push(item);
    }

    const nextTotalPages = Math.max(1, Number(payload?.total_pages) || 1);
    totalPages = nextTotalPages;
    page += 1;
  }

  return {
    active_model_id: activeModelId,
    items: mergedItems,
    total: mergedItems.length,
    page: 1,
    page_size: pageSize,
    total_pages: 1,
    model_type: "all",
  };
}
