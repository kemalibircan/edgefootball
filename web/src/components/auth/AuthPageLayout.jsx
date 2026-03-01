import React from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useLanguage } from "../../contexts/LanguageContext";
import logoLight from "../../images/logo.png";
import logoDark from "../../images/logo-dark.png";
import "./AuthPageLayout.css";

export default function AuthPageLayout({ children, title, subtitle }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const logoSrc = theme === "dark" ? logoDark : logoLight;

  return (
    <div className="auth-layout-shell">
      <div className="auth-layout-bg" />
      <div className="auth-layout-content">
        <div className="auth-layout-brand">
          <img src={logoSrc} alt={t.app.name} className="auth-layout-logo" />
          <span className="auth-layout-app-name">{t.app.name}</span>
        </div>
        <div className="auth-layout-card glass-card">
          {title ? <h1 className="auth-layout-title">{title}</h1> : null}
          {subtitle ? <p className="auth-layout-subtitle">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
