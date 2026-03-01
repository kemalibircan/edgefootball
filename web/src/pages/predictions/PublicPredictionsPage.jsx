import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getPublicPredictions, hasEndpoint, isMissingEndpointError } from "../../lib/api";
import { normalizeLocale, slugify } from "../../lib/seo";

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `%${(num * 100).toFixed(1)}`;
}

export default function PublicPredictionsPage() {
  const { locale: localeParam } = useParams();
  const locale = normalizeLocale(localeParam);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");
    setUnavailable(false);

    (async () => {
      try {
        const supported = await hasEndpoint("/predictions/public", { unknownAs: true });
        if (!supported) {
          if (!isMounted) return;
          setUnavailable(true);
          setItems([]);
          return;
        }

        const payload = await getPublicPredictions({ locale, page: 1, pageSize: 20 });
        if (!isMounted) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
      } catch (err) {
        if (!isMounted) return;
        if (isMissingEndpointError(err)) {
          setUnavailable(true);
          setItems([]);
          return;
        }
        setError(String(err.message || "Failed to load predictions."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [locale]);

  const title = locale === "en" ? "Football Predictions | EdgeFootball" : "Futbol Tahminleri | EdgeFootball";
  const description =
    locale === "en"
      ? "Public AI-powered match prediction cards with probability breakdown."
      : "Olasilik dagilimi iceren herkese acik yapay zeka mac tahminleri.";

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
          name: locale === "en" ? "Predictions" : "Tahminler",
          item: `/${locale}/predictions`,
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
        canonicalPath={`/${locale}/predictions`}
        trPath="/tr/predictions"
        enPath="/en/predictions"
        defaultPath="/tr/predictions"
      />
      <JsonLd id="predictions-breadcrumb" data={breadcrumbData} />

      <section className="card wide">
        <h2>{locale === "en" ? "Public Match Predictions" : "Acik Mac Tahminleri"}</h2>
        <p className="small-text">
          {locale === "en"
            ? "Latest fixture prediction snapshots selected from the public prediction stream."
            : "Herkese acik tahmin akisindan secilen son mac tahmin snapshotlari."}
        </p>

        {loading && <div className="small-text">{locale === "en" ? "Loading..." : "Yukleniyor..."}</div>}
        {!loading && unavailable && (
          <div className="small-text">
            {locale === "en"
              ? "Public predictions are temporarily unavailable on this environment."
              : "Acik tahmin servisi bu ortamda gecici olarak kullanilamiyor."}
          </div>
        )}
        {error && <div className="error">{error}</div>}

        {!loading && !error && !unavailable && (
          <div className="guest-fixture-list">
            {items.length === 0 && (
              <div className="small-text">{locale === "en" ? "No predictions found." : "Tahmin bulunamadi."}</div>
            )}
            {items.map((item) => {
              const fixtureId = Number(item.fixture_id || 0);
              const label = String(item.match_label || "Match");
              const slug = slugify(item.slug || label);
              return (
                <article key={`prediction-${fixtureId}`} className="guest-fixture-item">
                  <div>
                    <strong>{label}</strong>
                    <div className="small-text">
                      1: {formatPercent(item.predicted_home_win)} | X: {formatPercent(item.predicted_draw)} | 2: {formatPercent(item.predicted_away_win)}
                    </div>
                    <div className="small-text">{item.model_name || "AI"}</div>
                  </div>
                  <Link className="btn-secondary" to={`/${locale}/predictions/${fixtureId}/${slug}`}>
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
