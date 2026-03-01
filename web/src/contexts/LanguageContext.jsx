import React, { createContext, useContext, useEffect, useState } from "react";
import { uiTextTr } from "../i18n/terms.tr";
import { uiTextEn } from "../i18n/terms.en";

const LanguageContext = createContext({
  locale: "tr",
  setLocale: (locale) => {},
  t: uiTextTr,
});

const LOCALE_STORAGE_KEY = "football_ai_locale";

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    if (typeof window === "undefined") return "tr";
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === "en" ? "en" : "tr";
  });

  const t = locale === "en" ? uiTextEn : uiTextTr;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const setLocale = (newLocale) => {
    if (newLocale === "tr" || newLocale === "en") {
      setLocaleState(newLocale);
    }
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
