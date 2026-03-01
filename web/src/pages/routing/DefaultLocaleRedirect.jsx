import React from "react";
import { Navigate, useLocation } from "react-router-dom";

const DEFAULT_LOCALE_PREFIX = "/tr";

function normalizeLegacyPath(pathname) {
  const safePath = String(pathname || "/").trim() || "/";

  // Legacy blog feed aliases
  if (safePath === "/blog/posts") {
    return "/blog";
  }
  if (safePath.startsWith("/blog/posts/")) {
    return `/blog/${safePath.slice("/blog/posts/".length)}`;
  }

  return safePath;
}

export default function DefaultLocaleRedirect() {
  const location = useLocation();
  const normalizedPath = normalizeLegacyPath(location.pathname);
  const hasLocalePrefix =
    normalizedPath === "/tr" ||
    normalizedPath === "/en" ||
    normalizedPath.startsWith("/tr/") ||
    normalizedPath.startsWith("/en/");

  const nextPath = hasLocalePrefix ? normalizedPath : `${DEFAULT_LOCALE_PREFIX}${normalizedPath}`;
  const search = String(location.search || "");
  const hash = String(location.hash || "");

  return <Navigate to={`${nextPath}${search}${hash}`} replace />;
}
