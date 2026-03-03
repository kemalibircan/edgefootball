import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TeamLogo from "../components/common/TeamLogo";
import OddsButton from "../components/coupon/OddsButton";
import SavePredictionModal from "../components/predictions/SavePredictionModal";
import JsonLd from "../components/seo/JsonLd";
import SeoHead from "../components/seo/SeoHead";
import { useChat } from "../contexts/ChatContext";
import { useLanguage } from "../contexts/LanguageContext";
import { apiRequest, savePrediction } from "../lib/api";
import { readAuthToken } from "../lib/auth";
import { normalizeLocale, slugify } from "../lib/seo";
import "./FixtureDetailPage.css";

// Backend varsayılan portu 8000; env yoksa buna düş.
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

function toPositiveOdd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return null;
  }
  return Number(parsed.toFixed(2));
}

function normalizeOneX2Market(rawMarket) {
  if (!rawMarket || typeof rawMarket !== "object") return null;
  const home = toPositiveOdd(rawMarket["1"] ?? rawMarket.home);
  const draw = toPositiveOdd(rawMarket["0"] ?? rawMarket["X"] ?? rawMarket.draw);
  const away = toPositiveOdd(rawMarket["2"] ?? rawMarket.away);
  const lineValue = rawMarket.line == null ? null : String(rawMarket.line);
  if (!home && !draw && !away) return null;
  return {
    "1": home,
    "0": draw,
    "2": away,
    line: lineValue,
  };
}

function normalizeOverUnderMarket(rawMarket) {
  if (!rawMarket || typeof rawMarket !== "object") return null;
  const over = toPositiveOdd(rawMarket.over);
  const under = toPositiveOdd(rawMarket.under);
  const lineValue = rawMarket.line == null ? "2.5" : String(rawMarket.line);
  if (!over && !under) return null;
  return {
    over,
    under,
    line: lineValue,
  };
}

function normalizeBttsMarket(rawMarket) {
  if (!rawMarket || typeof rawMarket !== "object") return null;
  const yes = toPositiveOdd(rawMarket.yes);
  const no = toPositiveOdd(rawMarket.no);
  if (!yes && !no) return null;
  return { yes, no };
}

function normalizeFixtureMarkets(rawMarkets) {
  const markets = rawMarkets && typeof rawMarkets === "object" ? rawMarkets : {};
  return {
    match_result: normalizeOneX2Market(markets.match_result || markets.matchResult),
    first_half: normalizeOneX2Market(markets.first_half || markets.firstHalf),
    handicap: normalizeOneX2Market(markets.handicap),
    over_under_25: normalizeOverUnderMarket(markets.over_under_25 || markets.overUnder),
    btts: normalizeBttsMarket(markets.btts),
  };
}

function hasAnyMarketOdds(markets) {
  if (!markets || typeof markets !== "object") return false;
  return Boolean(markets.match_result || markets.first_half || markets.handicap || markets.over_under_25 || markets.btts);
}

function buildMarketSections(fixture, t) {
  const markets = normalizeFixtureMarkets(fixture?.markets);
  const out = [];

  const matchResultLabel = t?.coupon?.odds?.matchResult || "Maç Sonucu";
  const firstHalfLabel = t?.coupon?.odds?.firstHalf || "İlk Yarı";
  const handicapLabel = t?.coupon?.odds?.handicap || "Handikap";
  const overUnderLabel = t?.coupon?.odds?.overUnder || "Alt/Üst 2.5";
  const bttsLabel = t?.coupon?.odds?.btts || "Karşılıklı Gol";

  const matchResult = markets.match_result;
  if (matchResult) {
    const options = [
      { key: "1", selection: "1", odd: matchResult["1"], selectionDisplay: "MS 1", line: null },
      { key: "0", selection: "0", odd: matchResult["0"], selectionDisplay: "MS X", line: null },
      { key: "2", selection: "2", odd: matchResult["2"], selectionDisplay: "MS 2", line: null },
    ].filter((item) => item.odd);
    if (options.length) {
      out.push({
        marketKey: "match_result",
        marketLabel: matchResultLabel,
        title: `${matchResultLabel} (1X2)`,
        options,
      });
    }
  }

  const firstHalf = markets.first_half;
  if (firstHalf) {
    const options = [
      { key: "IY-1", selection: "IY-1", odd: firstHalf["1"], selectionDisplay: "IY 1", line: null },
      { key: "IY-0", selection: "IY-0", odd: firstHalf["0"], selectionDisplay: "IY X", line: null },
      { key: "IY-2", selection: "IY-2", odd: firstHalf["2"], selectionDisplay: "IY 2", line: null },
    ].filter((item) => item.odd);
    if (options.length) {
      out.push({
        marketKey: "first_half",
        marketLabel: firstHalfLabel,
        title: firstHalfLabel,
        options,
      });
    }
  }

  const handicap = markets.handicap;
  if (handicap) {
    const handicapLine = String(handicap.line || "0.0");
    const options = [
      {
        key: `HCP(${handicapLine})-1`,
        selection: `HCP(${handicapLine})-1`,
        odd: handicap["1"],
        selectionDisplay: `HCP ${handicapLine} 1`,
        line: handicapLine,
      },
      {
        key: `HCP(${handicapLine})-0`,
        selection: `HCP(${handicapLine})-0`,
        odd: handicap["0"],
        selectionDisplay: `HCP ${handicapLine} X`,
        line: handicapLine,
      },
      {
        key: `HCP(${handicapLine})-2`,
        selection: `HCP(${handicapLine})-2`,
        odd: handicap["2"],
        selectionDisplay: `HCP ${handicapLine} 2`,
        line: handicapLine,
      },
    ].filter((item) => item.odd);
    if (options.length) {
      out.push({
        marketKey: "handicap",
        marketLabel: handicapLabel,
        title: `${handicapLabel} (${handicapLine})`,
        options,
      });
    }
  }

  const overUnder = markets.over_under_25;
  if (overUnder) {
    const overUnderLine = String(overUnder.line || "2.5");
    const options = [
      {
        key: `UST-${overUnderLine}`,
        selection: `UST-${overUnderLine}`,
        odd: overUnder.over,
        selectionDisplay: `UST ${overUnderLine}`,
        line: overUnderLine,
      },
      {
        key: `ALT-${overUnderLine}`,
        selection: `ALT-${overUnderLine}`,
        odd: overUnder.under,
        selectionDisplay: `ALT ${overUnderLine}`,
        line: overUnderLine,
      },
    ].filter((item) => item.odd);
    if (options.length) {
      out.push({
        marketKey: "over_under_25",
        marketLabel: overUnderLabel,
        title: overUnderLabel,
        options,
      });
    }
  }

  const btts = markets.btts;
  if (btts) {
    const options = [
      {
        key: "KG-VAR",
        selection: "KG-VAR",
        odd: btts.yes,
        selectionDisplay: "KG Var",
        line: null,
      },
      {
        key: "KG-YOK",
        selection: "KG-YOK",
        odd: btts.no,
        selectionDisplay: "KG Yok",
        line: null,
      },
    ].filter((item) => item.odd);
    if (options.length) {
      out.push({
        marketKey: "btts",
        marketLabel: bttsLabel,
        title: bttsLabel,
        options,
      });
    }
  }

  return out;
}

export default function FixtureDetailPage() {
  const { locale: localeParam, fixtureId } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const { askFromAction, openSidebar } = useChat();
  const activeLocale = normalizeLocale(localeParam || locale);

  const [fixture, setFixture] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadFixture = useCallback(async () => {
    if (!fixtureId) return;

    setLoading(true);
    setError("");

    try {
      let detailFixture = null;

      // Prefer direct detail endpoint; fallback to day list for older backend deployments.
      try {
        const detailResponse = await fetch(`${API_BASE}/fixtures/public/${fixtureId}`, { cache: "no-store" });
        const detailPayload = await detailResponse.json().catch(() => ({}));
        if (detailResponse.ok) {
          detailFixture = detailPayload;
        } else if (detailResponse.status !== 404) {
          throw new Error(detailPayload.detail || `Request failed: ${detailResponse.status}`);
        }
      } catch (directErr) {
        console.warn("[FixtureDetailPage] direct detail endpoint unavailable, using list fallback", {
          fixtureId,
          error: String(directErr?.message || directErr || "unknown_error"),
        });
      }

      if (!detailFixture) {
        const listResponse = await fetch(`${API_BASE}/fixtures/public/today?page=1&page_size=500`, { cache: "no-store" });
        const listPayload = await listResponse.json().catch(() => ({}));
        if (!listResponse.ok) {
          throw new Error(listPayload.detail || "Failed to load fixture");
        }

        const items = Array.isArray(listPayload.items) ? listPayload.items : [];
        const found = items.find((item) => String(item.fixture_id) === String(fixtureId));
        if (!found) {
          throw new Error("Fixture not found");
        }
        detailFixture = found;
      }

      setFixture({
        ...detailFixture,
        markets: normalizeFixtureMarkets(detailFixture.markets),
      });

      try {
        const marketsResponse = await fetch(`${API_BASE}/fixtures/public/${fixtureId}/markets`, { cache: "no-store" });
        const marketsPayload = await marketsResponse.json().catch(() => ({}));
        if (!marketsResponse.ok) {
          throw new Error(marketsPayload.detail || `HTTP ${marketsResponse.status}`);
        }

        const normalizedMarkets = normalizeFixtureMarkets(marketsPayload.markets);
        if (hasAnyMarketOdds(normalizedMarkets)) {
          setFixture((prev) => (prev ? { ...prev, markets: normalizedMarkets } : prev));
        }
      } catch (marketErr) {
        console.error("[FixtureDetailPage] markets endpoint failed, keeping fallback markets", {
          fixtureId,
          error: String(marketErr?.message || marketErr || "unknown_error"),
        });
      }
    } catch (err) {
      setError(String(err.message || "Failed to load fixture"));
    } finally {
      setLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    loadFixture();
  }, [loadFixture]);

  const handleSimulate = async () => {
    if (!fixture || !readAuthToken()) {
      navigate("/login");
      return;
    }

    setSimulating(true);

    try {
      const result = await apiRequest(`/simulate?fixture_id=${fixture.fixture_id}`);
      setSimulation(result);
    } catch (err) {
      alert(String(err.message || "Simulation failed"));
    } finally {
      setSimulating(false);
    }
  };

  const handleAskAi = () => {
    if (!fixture) return;

    askFromAction({
      fixture_id: fixture.fixture_id,
      home_team_name: fixture.home_team_name,
      away_team_name: fixture.away_team_name,
      home_team_logo: fixture.home_team_logo,
      away_team_logo: fixture.away_team_logo,
      league_id: fixture.league_id,
      league_name: fixture.league_name,
      starting_at: fixture.starting_at,
      match_label: fixture.match_label || `${fixture.home_team_name} - ${fixture.away_team_name}`,
    });

    openSidebar();
  };

  const handleSavePrediction = async ({ note, includeAI }) => {
    if (!fixture || !simulation) return;

    await savePrediction(fixture.fixture_id, {
      note,
      simulation,
      includeAI,
      language: activeLocale,
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const marketSections = useMemo(() => buildMarketSections(fixture, t), [fixture, t]);
  const matchLabel = useMemo(() => {
    if (!fixture) {
      return activeLocale === "en" ? "Fixture Detail" : "Mac Detayi";
    }
    return String(
      fixture.match_label || `${fixture.home_team_name || "Home"} vs ${fixture.away_team_name || "Away"}`
    ).trim();
  }, [fixture, activeLocale]);
  const matchSlug = useMemo(() => slugify(matchLabel), [matchLabel]);
  const canonicalPath = `/${activeLocale}/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`;
  const seoDescription = fixture
    ? activeLocale === "en"
      ? `${matchLabel} fixture details, odds and AI simulation panel.`
      : `${matchLabel} mac detayi, oranlar ve AI simulasyon paneli.`
    : activeLocale === "en"
      ? "Fixture detail page."
      : "Mac detay sayfasi.";
  const jsonLdData = useMemo(() => {
    if (!fixture) return null;
    return {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: matchLabel,
      startDate: fixture.starting_at || null,
      eventStatus: fixture.status || null,
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

  if (loading) {
    return (
      <>
        <SeoHead
          title={`${matchLabel} | EdgeFootball`}
          description={seoDescription}
          locale={activeLocale}
          canonicalPath={canonicalPath}
          trPath={`/tr/fixtures/${fixtureId}`}
          enPath={`/en/fixtures/${fixtureId}`}
          defaultPath={`/tr/fixtures/${fixtureId}`}
          ogType="sports.event"
        />
        <div className="fixture-detail-page">
          <div className="container">
            <div className="fixture-loading">Loading fixture details...</div>
          </div>
        </div>
      </>
    );
  }

  if (error || !fixture) {
    return (
      <>
        <SeoHead
          title={`${matchLabel} | EdgeFootball`}
          description={seoDescription}
          locale={activeLocale}
          canonicalPath={canonicalPath}
          trPath={`/tr/fixtures/${fixtureId}`}
          enPath={`/en/fixtures/${fixtureId}`}
          defaultPath={`/tr/fixtures/${fixtureId}`}
          ogType="sports.event"
        />
        <div className="fixture-detail-page">
          <div className="container">
            <div className="fixture-error">{error || "Fixture not found"}</div>
            <button className="btn-ghost" onClick={() => navigate(`/${activeLocale}/fixtures`)}>
              {activeLocale === "en" ? "Back to Fixtures" : "Maclara Don"}
            </button>
          </div>
        </div>
      </>
    );
  }

  const startTime = fixture.starting_at
    ? new Date(fixture.starting_at).toLocaleString(activeLocale === "en" ? "en-GB" : "tr-TR", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : "";

  return (
    <>
      <SeoHead
        title={`${matchLabel} | EdgeFootball`}
        description={seoDescription}
        locale={activeLocale}
        canonicalPath={canonicalPath}
        trPath={`/tr/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        enPath={`/en/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        defaultPath={`/tr/fixtures/${fixtureId}${matchSlug ? `/${matchSlug}` : ""}`}
        ogType="sports.event"
      />
      {jsonLdData ? <JsonLd id="fixture-detail-event" data={jsonLdData} /> : null}

      <div className="fixture-detail-page">
        <div className="container">
          <button className="fixture-back-btn btn-ghost" onClick={() => navigate(`/${activeLocale}`)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {activeLocale === "en" ? "Back to Fixtures" : "Maclara Don"}
          </button>

          <div className="fixture-detail-header glass-card">
            <div className="fixture-detail-teams">
              <div className="fixture-detail-team">
                <TeamLogo
                  src={fixture.home_team_logo}
                  teamName={fixture.home_team_name}
                  alt={fixture.home_team_name}
                  size="xl"
                />
                <h2 className="fixture-detail-team-name">{fixture.home_team_name}</h2>
              </div>

              <div className="fixture-detail-vs">
                <div className="fixture-detail-vs-label">VS</div>
                {startTime ? <div className="fixture-detail-time">{startTime}</div> : null}
              </div>

              <div className="fixture-detail-team">
                <TeamLogo
                  src={fixture.away_team_logo}
                  teamName={fixture.away_team_name}
                  alt={fixture.away_team_name}
                  size="xl"
                />
                <h2 className="fixture-detail-team-name">{fixture.away_team_name}</h2>
              </div>
            </div>

            {fixture.league_name ? (
              <div className="fixture-detail-league">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                {fixture.league_name}
              </div>
            ) : null}
          </div>

          <div className="fixture-detail-actions">
            <button className="btn-primary" onClick={handleSimulate} disabled={simulating}>
              {simulating
                ? activeLocale === "en"
                  ? "Simulating..."
                  : "Simülasyon Yapılıyor..."
                : activeLocale === "en"
                ? "Run AI Simulation"
                : "AI Simülasyonu Çalıştır"}
            </button>
            <button className="btn-secondary" onClick={handleAskAi}>
              {activeLocale === "en" ? "Ask AI About This Match" : "Bu Maç Hakkında AI'a Sor"}
            </button>
          </div>

          <div className="fixture-detail-odds-section">
            {marketSections.length === 0 ? (
              <div className="fixture-odds-card glass-card">
                <div className="odds-not-available">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <h3>{activeLocale === "en" ? "Odds Not Available" : "Oranlar Mevcut Değil"}</h3>
                  <p>
                    {activeLocale === "en"
                      ? "Betting odds for this match are not available yet. You can still run AI simulation to see predictions."
                      : "Bu maç için bahis oranları henüz mevcut değil. Tahmin görmek için AI simülasyonu çalıştırabilirsiniz."}
                  </p>
                </div>
              </div>
            ) : null}

            {marketSections.map((section) => {
              const gridClass =
                section.options.length === 2 ? "two-col" : section.options.length === 1 ? "one-col" : "";
              return (
                <div key={section.marketKey} className="fixture-odds-card glass-card">
                  <h3 className="fixture-odds-title">{section.title}</h3>
                  <div className={`fixture-odds-buttons-grid ${gridClass}`.trim()}>
                    {section.options.map((option) => (
                      <div key={option.key} className="fixture-odds-option">
                        <OddsButton
                          fixture={fixture}
                          selection={option.selection}
                          odd={option.odd}
                          marketKey={section.marketKey}
                          marketLabel={section.marketLabel}
                          selectionDisplay={option.selectionDisplay}
                          line={option.line}
                          requiresAuth={true}
                          size="lg"
                        />
                        <span className="fixture-odds-prob">{((1 / option.odd) * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {simulation ? (
            <div className="fixture-detail-simulation glass-card">
              <h3 className="fixture-detail-section-title">
                {activeLocale === "en" ? "AI Simulation Results" : "AI Simülasyon Sonuçları"}
              </h3>

              {simulation.outcomes ? (
                <div className="simulation-outcomes">
                  <div className="simulation-outcome">
                    <div className="simulation-outcome-label">{activeLocale === "en" ? "Home Win" : "Ev Sahibi"}</div>
                    <div className="simulation-outcome-value">
                      {(() => {
                        const p = Number(simulation.outcomes.home_win ?? simulation.outcomes.home);
                        return Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "-";
                      })()}
                    </div>
                  </div>
                  <div className="simulation-outcome">
                    <div className="simulation-outcome-label">{activeLocale === "en" ? "Draw" : "Beraberlik"}</div>
                    <div className="simulation-outcome-value">
                      {(() => {
                        const p = Number(simulation.outcomes.draw);
                        return Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "-";
                      })()}
                    </div>
                  </div>
                  <div className="simulation-outcome">
                    <div className="simulation-outcome-label">{activeLocale === "en" ? "Away Win" : "Deplasman"}</div>
                    <div className="simulation-outcome-value">
                      {(() => {
                        const p = Number(simulation.outcomes.away_win ?? simulation.outcomes.away);
                        return Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "-";
                      })()}
                    </div>
                  </div>
                </div>
              ) : null}

              {simulation.top_scorelines && simulation.top_scorelines.length > 0 ? (
                <div className="simulation-scorelines">
                  <h4>{activeLocale === "en" ? "Most Likely Scorelines" : "En Olası Skorlar"}</h4>
                  <div className="scoreline-list">
                    {simulation.top_scorelines.slice(0, 5).map((scoreline, idx) => {
                      const scoreLabel =
                        typeof scoreline.score === "string" && scoreline.score
                          ? scoreline.score
                          : [scoreline.home_goals, scoreline.away_goals].every((n) => Number.isFinite(Number(n)))
                            ? `${scoreline.home_goals} - ${scoreline.away_goals}`
                            : "-";
                      const prob = Number(scoreline.probability);
                      const probLabel = Number.isFinite(prob) ? `${(prob * 100).toFixed(1)}%` : "-";
                      return (
                        <div key={idx} className="scoreline-item">
                          <div className="scoreline-score">{scoreLabel}</div>
                          <div className="scoreline-prob">{probLabel}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {saveSuccess && (
                <div className="save-success-message">
                  {activeLocale === "en" ? "Prediction saved successfully!" : "Tahmin başarıyla kaydedildi!"}
                </div>
              )}

              <div className="simulation-actions">
                <button className="btn-primary" onClick={() => setShowSaveModal(true)}>
                  {t.savedPredictions.actions.save}
                </button>
              </div>
            </div>
          ) : null}

          <SavePredictionModal
            isOpen={showSaveModal}
            onClose={() => setShowSaveModal(false)}
            onSave={handleSavePrediction}
            matchLabel={fixture?.match_label || `${fixture?.home_team_name} - ${fixture?.away_team_name}`}
            simulation={simulation}
          />
        </div>
      </div>
    </>
  );
}
