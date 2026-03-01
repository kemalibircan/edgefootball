import React from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import "./LanguageSwitcher.css";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="language-switcher">
      <button
        onClick={() => setLocale("tr")}
        className={`language-switcher-btn ${locale === "tr" ? "active" : ""}`}
        aria-label="Türkçe"
      >
        TR
      </button>
      <button
        onClick={() => setLocale("en")}
        className={`language-switcher-btn ${locale === "en" ? "active" : ""}`}
        aria-label="English"
      >
        EN
      </button>
    </div>
  );
}
