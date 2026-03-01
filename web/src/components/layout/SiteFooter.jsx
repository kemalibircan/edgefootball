import React from "react";
import { useLanguage } from "../../contexts/LanguageContext";

export default function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className="container">
      <div className="site-footer-bar card">
        <div>
          <strong>{t.footer.title}</strong>
          <p className="small-text">{t.footer.text}</p>
        </div>
        <span className="small-text">
          {t.footer.copyrightPrefix} {new Date().getFullYear()} EdgeFootball
        </span>
      </div>
    </footer>
  );
}
