import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { slugify, normalizeLocale } from "../../lib/seo";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8001").replace(/\/+$/, "");

function formatKickoff(value, locale) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString(locale === "en" ? "en-GB" : "tr-TR");
}

export default function PublicFixturesPage() {
  const { locale: localeParam } = useParams();
  const locale = normalizeLocale(localeParam);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    fetch(`${API_BASE}/fixtures/public?page=1&page_size=30&upcoming_only=true&sort=asc`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || `Request failed: ${response.status}`);
        }
        return payload;
      })
      .then((payload) => {
        if (!isMounted) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(String(err.message || "Failed to load fixtures."));
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const title = locale === "en" ? "Football Fixtures | EdgeFootball" : "Futbol Maclari | EdgeFootball";
  const description =
    locale === "en"
      ? "Upcoming football fixtures with match details, odds and AI insights."
      : "Yaklasan futbol maclari, mac detaylari, oranlar ve yapay zeka icgoruleri.";

  const breadcrumbData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: locale === "en" ? "Home" : "Ana Sayfa",
          item: `/${locale}`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: locale === "en" ? "Fixtures" : "Maclar",
          item: `/${locale}/fixtures`,
        },
      ],
    }),
    [locale],
  );

  return (
    <div className="container">
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}/fixtures`}
        trPath="/tr/fixtures"
        enPath="/en/fixtures"
        defaultPath="/tr/fixtures"
        ogType="website"
      />
      <JsonLd id="fixtures-breadcrumb" data={breadcrumbData} />

      <section className="card wide">
        <h2>{locale === "en" ? "Upcoming Fixtures" : "Yaklasan Maclar"}</h2>
        <p className="small-text">
          {locale === "en"
            ? "Public fixture board for SEO-friendly fixture discovery."
            : "SEO odakli mac kesfi icin acik fixture listesi."}
        </p>

        {loading && <div className="small-text">{locale === "en" ? "Loading..." : "Yukleniyor..."}</div>}
        {error && <div className="error">{error}</div>}

        {!loading && !error && (
          <div className="guest-fixture-list">
            {items.length === 0 && (
              <div className="small-text">{locale === "en" ? "No fixtures found." : "Mac bulunamadi."}</div>
            )}
            {items.map((item) => {
              const fixtureId = Number(item.fixture_id || 0);
              const label = String(item.match_label || `${item.home_team_name || "Home"} vs ${item.away_team_name || "Away"}`);
              const slug = slugify(label);
              return (
                <article key={`fixture-${fixtureId}`} className="guest-fixture-item">
                  <div>
                    <strong>{label}</strong>
                    <div className="small-text">{formatKickoff(item.starting_at, locale)}</div>
                    <div className="small-text">{item.league_name || "-"}</div>
                  </div>
                  <Link className="btn-secondary" to={`/${locale}/fixtures/${fixtureId}/${slug}`}>
                    {locale === "en" ? "View" : "Goruntule"}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
