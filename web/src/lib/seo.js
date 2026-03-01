const RAW_SITE_BASE = import.meta.env.VITE_SITE_BASE_URL || "";

export const SUPPORTED_LOCALES = ["tr", "en"];
export const DEFAULT_LOCALE = "tr";

export function normalizeLocale(value) {
  const locale = String(value || "").trim().toLowerCase();
  if (SUPPORTED_LOCALES.includes(locale)) {
    return locale;
  }
  return DEFAULT_LOCALE;
}

export function getSiteBaseUrl() {
  const fromEnv = String(RAW_SITE_BASE || "").trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, "");
  }
  return "http://localhost:3001";
}

export function toAbsoluteUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return getSiteBaseUrl();
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${getSiteBaseUrl()}${path}`;
}

export function slugify(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "item";

  const map = {
    c: /[cCçÇ]/g,
    g: /[gGğĞ]/g,
    i: /[ıİiI]/g,
    o: /[oOöÖ]/g,
    s: /[sSşŞ]/g,
    u: /[uUüÜ]/g,
  };

  let normalized = raw;
  Object.entries(map).forEach(([ascii, regex]) => {
    normalized = normalized.replace(regex, ascii);
  });

  normalized = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "item";
}

export function buildCanonicalPath(pathname) {
  const path = String(pathname || "/").trim();
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function buildLocalePath(locale, pathWithoutLocale = "") {
  const safeLocale = normalizeLocale(locale);
  const safePath = String(pathWithoutLocale || "").replace(/^\/+/, "");
  return safePath ? `/${safeLocale}/${safePath}` : `/${safeLocale}`;
}

export function hreflangLinks({
  trPath,
  enPath,
  defaultPath,
}) {
  const tr = toAbsoluteUrl(trPath || `/${DEFAULT_LOCALE}`);
  const en = toAbsoluteUrl(enPath || "/en");
  const xDefault = toAbsoluteUrl(defaultPath || trPath || `/${DEFAULT_LOCALE}`);

  return [
    { hreflang: "tr", href: tr },
    { hreflang: "en", href: en },
    { hreflang: "x-default", href: xDefault },
  ];
}

export function localeToOgLocale(locale) {
  const safe = normalizeLocale(locale);
  return safe === "en" ? "en_US" : "tr_TR";
}
