import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getPublicPredictionDetail, hasEndpoint, isMissingEndpointError } from "../../lib/api";
import { normalizeLocale, slugify } from "../../lib/seo";

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `%${(num * 100).toFixed(1)}`;
}

export default function PublicPredictionDetailPage() {
  const { locale: localeParam, fixtureId } = useParams();
  const locale = normalizeLocale(localeParam);

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!fixtureId) return;
    let isMounted = true;
    setLoading(true);
    setError("");
    setUnavailable(false);

    (async () => {
      try {
        const supported = await hasEndpoint("/predictions/public/{fixture_id}", { unknownAs: true });
        if (!supported) {
          if (!isMounted) return;
          setUnavailable(true);
          setItem(null);
          return;
        }

        const payload = await getPublicPredictionDetail(fixtureId, { locale });
        if (!isMounted) return;
        setItem(payload || null);
      } catch (err) {
        if (!isMounted) return;
        if (isMissingEndpointError(err)) {
          setUnavailable(true);
          setItem(null);
          return;
        }
        setError(String(err.message || "Failed to load prediction detail."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [fixtureId, locale]);

  const matchLabel = String(item?.match_label || "Match");
  const matchSlug = slugify(item?.slug || matchLabel);

  const title = item
    ? `${matchLabel} | ${locale === "en" ? "Prediction Detail" : "Tahmin Detayi"}`
    : locale === "en"
      ? "Prediction Detail | EdgeFootball"
      : "Tahmin Detayi | EdgeFootball";

  const description = item
    ? `${matchLabel} - ${locale === "en" ? "probability breakdown and model snapshot" : "olasilik dagilimi ve model snapshot"}.`
    : locale === "en"
      ? "Public match prediction detail page."
      : "Herkese acik mac tahmin detay sayfasi.";

  const jsonLdData = useMemo(() => {
    if (!item) return null;
    return {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: matchLabel,
      startDate: item.fixture_starting_at || item.fixture_date,
      homeTeam: {
        "@type": "SportsTeam",
        name: item.home_team_name || "Home",
      },
      awayTeam: {
        "@type": "SportsTeam",
        name: item.away_team_name || "Away",
      },
      description,
    };
  }, [item, matchLabel, description]);

  return (
    <div className="container">
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}/predictions/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        trPath={`/tr/predictions/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        enPath={`/en/predictions/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        defaultPath={`/tr/predictions/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        ogType="sports.event"
      />
      {jsonLdData && <JsonLd id="prediction-event" data={jsonLdData} />}

      <section className="card wide">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>{matchLabel}</h2>
          <Link className="btn-secondary" to={`/${locale}/predictions`}>
            {locale === "en" ? "Back to Predictions" : "Tahminlere Don"}
          </Link>
        </div>

        {loading && <div className="small-text">{locale === "en" ? "Loading..." : "Yukleniyor..."}</div>}
        {!loading && unavailable && (
          <div className="small-text">
            {locale === "en"
              ? "Prediction detail is temporarily unavailable on this environment."
              : "Tahmin detay servisi bu ortamda gecici olarak kullanilamiyor."}
          </div>
        )}
        {error && <div className="error">{error}</div>}

        {!loading && !error && !unavailable && item && (
          <div className="grid" style={{ gap: 12 }}>
            <div className="small-text">
              <strong>1:</strong> {formatPercent(item.predicted_home_win)}
            </div>
            <div className="small-text">
              <strong>X:</strong> {formatPercent(item.predicted_draw)}
            </div>
            <div className="small-text">
              <strong>2:</strong> {formatPercent(item.predicted_away_win)}
            </div>
            <div className="small-text">
              <strong>{locale === "en" ? "Outcome:" : "Tahmin:"}</strong> {item.prediction_outcome || "-"}
            </div>
            <div className="small-text">
              <strong>{locale === "en" ? "Model:" : "Model:"}</strong> {item.model_name || "AI"}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
