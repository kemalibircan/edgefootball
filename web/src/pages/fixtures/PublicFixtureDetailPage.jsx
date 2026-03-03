import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { normalizeLocale, slugify } from "../../lib/seo";

// Backend varsayılan portu 8000; env yoksa buna düş.
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

function formatKickoff(value, locale) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString(locale === "en" ? "en-GB" : "tr-TR");
}

export default function PublicFixtureDetailPage() {
  const { locale: localeParam, fixtureId } = useParams();
  const locale = normalizeLocale(localeParam);
  const [fixture, setFixture] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!fixtureId) return;
    let isMounted = true;
    setLoading(true);
    setError("");

    async function load() {
      try {
        const detailResponse = await fetch(`${API_BASE}/fixtures/public/${fixtureId}`, { cache: "no-store" });
        const detailPayload = await detailResponse.json().catch(() => ({}));
        if (!detailResponse.ok) {
          throw new Error(detailPayload.detail || `Request failed: ${detailResponse.status}`);
        }

        const marketsResponse = await fetch(`${API_BASE}/fixtures/public/${fixtureId}/markets`, { cache: "no-store" });
        const marketsPayload = await marketsResponse.json().catch(() => ({}));

        const merged = {
          ...detailPayload,
          markets: marketsResponse.ok ? (marketsPayload.markets || detailPayload.markets || {}) : (detailPayload.markets || {}),
        };

        if (!isMounted) return;
        setFixture(merged);
      } catch (err) {
        if (!isMounted) return;
        setError(String(err.message || "Failed to load fixture."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [fixtureId]);

  const matchLabel = String(
    fixture?.match_label || `${fixture?.home_team_name || "Home"} vs ${fixture?.away_team_name || "Away"}`,
  ).trim();
  const matchSlug = slugify(matchLabel);

  const title = fixture
    ? `${matchLabel} | ${locale === "en" ? "Fixture Analysis" : "Mac Analizi"}`
    : locale === "en"
      ? "Fixture Detail | EdgeFootball"
      : "Mac Detayi | EdgeFootball";

  const description = fixture
    ? `${matchLabel} - ${locale === "en" ? "odds, timing and event details" : "oran, zamanlama ve mac detaylari"}.`
    : locale === "en"
      ? "Detailed football fixture page with odds and event info."
      : "Oran ve mac bilgileri ile detayli fixture sayfasi.";

  const jsonLdData = useMemo(() => {
    if (!fixture) return null;
    return {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: matchLabel,
      startDate: fixture.starting_at || fixture.event_date,
      eventStatus: fixture.status || undefined,
      location: {
        "@type": "Place",
        name: fixture.league_name || "Football",
      },
      homeTeam: {
        "@type": "SportsTeam",
        name: fixture.home_team_name || "Home",
      },
      awayTeam: {
        "@type": "SportsTeam",
        name: fixture.away_team_name || "Away",
      },
    };
  }, [fixture, matchLabel]);

  return (
    <div className="container">
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        trPath={`/tr/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        enPath={`/en/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        defaultPath={`/tr/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        ogType="sports.event"
      />
      {jsonLdData && <JsonLd id="fixture-event" data={jsonLdData} />}

      <section className="card wide">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>{matchLabel || (locale === "en" ? "Fixture" : "Mac")}</h2>
          <Link className="btn-secondary" to={`/${locale}/fixtures`}>
            {locale === "en" ? "Back to Fixtures" : "Maclara Don"}
          </Link>
        </div>

        {loading && <div className="small-text">{locale === "en" ? "Loading..." : "Yukleniyor..."}</div>}
        {error && <div className="error">{error}</div>}

        {!loading && !error && fixture && (
          <div className="grid" style={{ gap: 12 }}>
            <div className="small-text">
              <strong>{locale === "en" ? "League:" : "Lig:"}</strong> {fixture.league_name || "-"}
            </div>
            <div className="small-text">
              <strong>{locale === "en" ? "Kickoff:" : "Baslama:"}</strong> {formatKickoff(fixture.starting_at, locale)}
            </div>
            <div className="small-text">
              <strong>{locale === "en" ? "Status:" : "Durum:"}</strong> {fixture.status || "-"}
            </div>
            <div className="small-text">
              <strong>{locale === "en" ? "Score:" : "Skor:"}</strong> {fixture?.scores?.home_score ?? "-"} - {fixture?.scores?.away_score ?? "-"}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
