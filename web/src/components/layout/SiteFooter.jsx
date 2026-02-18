import React from "react";
import { uiText } from "../../i18n/terms.tr";

export default function SiteFooter() {
  return (
    <footer className="site-footer-bar card">
      <div>
        <strong>{uiText.footer.title}</strong>
        <p className="small-text">{uiText.footer.text}</p>
      </div>
      <span className="small-text">
        {uiText.footer.copyrightPrefix} {new Date().getFullYear()} Football AI
      </span>
    </footer>
  );
}
