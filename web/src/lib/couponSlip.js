export const COUPON_SLIP_STATE_KEY = "football_ai_coupon_slip_state_v2";
export const COUPON_SLIP_UI_KEY = "football_ai_coupon_slip_ui_v1";
export const COUPON_SLIP_LEGACY_SNAPSHOT_KEY = "football_ai_coupon_slip_snapshot_v1";

export const DEFAULT_COUPON_COUNT = 1;
export const DEFAULT_STAKE = 50;
export const DEFAULT_SLIP_OPEN = true;

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function normalizeLineValue(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function inferMarketKeyFromSelection(selection) {
  const normalized = String(selection || "").trim().toUpperCase();
  if (!normalized) return "match_result";
  if (["1", "0", "2"].includes(normalized)) return "match_result";
  if (normalized.startsWith("IY-")) return "first_half";
  if (normalized.startsWith("HCP(")) return "handicap";
  if (normalized.startsWith("ALT-") || normalized.startsWith("UST-")) return "over_under_25";
  if (normalized.startsWith("KG-")) return "btts";
  return "match_result";
}

export function buildSlipPickKey(item) {
  const fixtureId = Number(item?.fixture_id);
  const selection = String(item?.selection || "").trim();
  if (!Number.isFinite(fixtureId) || !selection) return "";
  const marketKey = String(item?.market_key || inferMarketKeyFromSelection(selection)).trim() || "match_result";
  const line = normalizeLineValue(item?.line, "-");
  return `${Math.trunc(fixtureId)}:${marketKey}:${line || "-"}:${selection}`;
}

export function resolveSlipPickKey(item) {
  const explicit = String(item?.pick_key || "").trim();
  if (explicit) return explicit;
  return buildSlipPickKey(item);
}

export function couponTotalOdds(items = []) {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce((acc, item) => {
    const odd = safeNumber(item?.odd, 1);
    return acc * (odd > 1 ? odd : 1);
  }, 1);
}

export function sanitizeCouponCount(value, fallback = DEFAULT_COUPON_COUNT) {
  const parsed = Math.trunc(safeNumber(value, fallback));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function sanitizeStake(value, fallback = DEFAULT_STAKE) {
  const parsed = safeNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.round(parsed);
}

export function sanitizeSlipItem(item) {
  if (!item || typeof item !== "object") return null;
  const fixtureId = Number(item?.fixture_id);
  const selection = String(item?.selection || "").trim();
  if (!Number.isFinite(fixtureId) || !selection) return null;

  const normalized = {
    fixture_id: Math.trunc(fixtureId),
    home_team_name: String(item?.home_team_name || "-").trim() || "-",
    away_team_name: String(item?.away_team_name || "-").trim() || "-",
    starting_at: item?.starting_at || null,
    selection,
    selection_display: String(item?.selection_display || selection).trim() || selection,
    market_key: String(item?.market_key || inferMarketKeyFromSelection(selection)).trim() || "match_result",
    market_label: item?.market_label ? String(item.market_label).trim() : null,
    line: normalizeLineValue(item?.line, "") || null,
    odd: safeNumber(item?.odd, 1),
    task_id: String(item?.task_id || "").trim(),
    source: String(item?.source || "generated").trim() || "generated",
    model_id: item?.model_id || null,
  };

  const pickKey = resolveSlipPickKey({ ...normalized, pick_key: item?.pick_key });
  if (!pickKey) return null;

  return {
    ...normalized,
    pick_key: pickKey,
  };
}

export function sanitizeSlipItems(items) {
  if (!Array.isArray(items)) return [];
  const keyMap = new Map();

  items.forEach((item) => {
    const normalized = sanitizeSlipItem(item);
    if (!normalized) return;
    const key = resolveSlipPickKey(normalized);
    if (!key || keyMap.has(key)) return;
    keyMap.set(key, normalized);
  });

  return Array.from(keyMap.values());
}

export function sanitizeCouponSlipState(rawState) {
  const source = rawState && typeof rawState === "object" ? rawState : {};
  return {
    items: sanitizeSlipItems(source.items),
    couponCount: sanitizeCouponCount(source.couponCount, DEFAULT_COUPON_COUNT),
    stake: sanitizeStake(source.stake, DEFAULT_STAKE),
  };
}

export function sanitizeCouponSlipUi(rawUi) {
  const source = rawUi && typeof rawUi === "object" ? rawUi : {};
  return {
    isOpen: typeof source.isOpen === "boolean" ? source.isOpen : DEFAULT_SLIP_OPEN,
  };
}

function readJsonStorage(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function loadCouponSlipStateFromStorage() {
  const payload = readJsonStorage(COUPON_SLIP_STATE_KEY);
  if (!payload || typeof payload !== "object") return null;
  return sanitizeCouponSlipState(payload);
}

export function loadCouponSlipUiFromStorage() {
  const payload = readJsonStorage(COUPON_SLIP_UI_KEY);
  if (!payload || typeof payload !== "object") return null;
  return sanitizeCouponSlipUi(payload);
}

export function loadLegacyCouponSlipSnapshot() {
  const payload = readJsonStorage(COUPON_SLIP_LEGACY_SNAPSHOT_KEY);
  if (!payload || typeof payload !== "object") return null;

  return {
    items: sanitizeSlipItems(payload.items),
    couponCount: sanitizeCouponCount(payload.coupon_count, DEFAULT_COUPON_COUNT),
    stake: sanitizeStake(payload.stake, DEFAULT_STAKE),
  };
}

export function createDefaultCouponSlipState() {
  return {
    items: [],
    couponCount: DEFAULT_COUPON_COUNT,
    stake: DEFAULT_STAKE,
    isOpen: DEFAULT_SLIP_OPEN,
  };
}
