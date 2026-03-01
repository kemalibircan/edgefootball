import React from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

const LOCALE_STORAGE_KEY = "football_ai_locale";

function resolvePreferredLocale(pathname) {
  const path = String(pathname || "");
  if (path.startsWith("/en/")) return "en";
  if (path === "/en") return "en";
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en") return "en";
  }
  return "tr";
}

export default function LegacyFixtureRedirect() {
  const { fixtureId } = useParams();
  const location = useLocation();
  const safeId = String(fixtureId || "").trim();
  const locale = resolvePreferredLocale(location.pathname);
  const search = String(location.search || "");
  const hash = String(location.hash || "");
  if (!safeId) {
    return <Navigate to={`/${locale}/fixtures${search}${hash}`} replace />;
  }
  return <Navigate to={`/${locale}/fixtures/${safeId}${search}${hash}`} replace />;
}
