import React from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

export default function NotFoundPage() {
  const { locale } = useLanguage();
  const safeLocale = locale === "en" ? "en" : "tr";

  const title = safeLocale === "en" ? "Page not found" : "Sayfa bulunamadi";
  const text =
    safeLocale === "en"
      ? "The page you requested does not exist or has moved."
      : "Istediginiz sayfa bulunamadi veya tasinmis olabilir.";
  const homeLabel = safeLocale === "en" ? "Go to home" : "Anasayfaya don";
  const blogLabel = safeLocale === "en" ? "Go to blog" : "Bloga git";

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <section className="card" style={{ display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <p className="small-text">{text}</p>
        <div className="row wrap">
          <Link className="btn-primary" to={`/${safeLocale}`}>
            {homeLabel}
          </Link>
          <Link className="btn-ghost" to={`/${safeLocale}/blog`}>
            {blogLabel}
          </Link>
        </div>
      </section>
    </div>
  );
}
