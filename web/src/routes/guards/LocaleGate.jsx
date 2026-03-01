import React, { useEffect } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";

export default function LocaleGate() {
  const { locale } = useParams();
  const location = useLocation();
  const { setLocale } = useLanguage();

  const safeLocale = locale === "en" ? "en" : locale === "tr" ? "tr" : "";

  useEffect(() => {
    if (!safeLocale) return;
    setLocale(safeLocale);
  }, [safeLocale, setLocale]);

  if (!safeLocale) {
    const nextPath = String(location.pathname || "").replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
    return <Navigate to={`/tr${nextPath}`} replace />;
  }

  return <Outlet />;
}
