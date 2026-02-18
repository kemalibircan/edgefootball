import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionButton from "../dashboard/ActionButton";
import TeamBadge from "../dashboard/TeamBadge";
import { uiText } from "../../i18n/terms.tr";

const MAX_SLIDES = 10;
const DEFAULT_SLIDER_IMAGES = [
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1486286701208-1d58e9338013?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1543357480-c60d400e2ef9?auto=format&fit=crop&w=1600&q=80",
];

function todayLocalISODate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function parsePositiveOdd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 1) return null;
  return parsed;
}

function deriveAllOdds(row) {
  const odd1 = parsePositiveOdd(row?.home);
  const oddX = parsePositiveOdd(row?.draw);
  const odd2 = parsePositiveOdd(row?.away);
  if (!odd1 || !oddX || !odd2) {
    return null;
  }

  const p1 = 1 / odd1;
  const px = 1 / oddX;
  const p2 = 1 / odd2;
  const total = p1 + px + p2;
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  const n1 = p1 / total;
  const nx = px / total;
  const n2 = p2 / total;
  const asOdd = (probability) => (probability > 0 ? (1 / probability).toFixed(2) : "-");

  return {
    homeOrDraw: asOdd(n1 + nx),
    homeOrAway: asOdd(n1 + n2),
    drawOrAway: asOdd(nx + n2),
    homeProb: `${(n1 * 100).toFixed(1)}%`,
    drawProb: `${(nx * 100).toFixed(1)}%`,
    awayProb: `${(n2 * 100).toFixed(1)}%`,
  };
}

export default function GuestLanding({
  apiBase,
  featuredOddsRows,
}) {
  const navigate = useNavigate();
  const [sliderImages, setSliderImages] = useState(DEFAULT_SLIDER_IMAGES);
  const [activeSlide, setActiveSlide] = useState(0);
  const [fixtureLeagueId, setFixtureLeagueId] = useState("all");
  const [fixtureQueryInput, setFixtureQueryInput] = useState("");
  const [fixtureQuery, setFixtureQuery] = useState("");
  const [fixturePage, setFixturePage] = useState(1);
  const [fixturePayload, setFixturePayload] = useState({
    page: 1,
    page_size: 12,
    total: 0,
    total_pages: 1,
    items: [],
  });
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureError, setFixtureError] = useState("");
  const [expandedOddsRowId, setExpandedOddsRowId] = useState("");

  const hasSlides = sliderImages.length > 0;

  const activeSlideImage = useMemo(() => {
    if (!sliderImages.length) return "";
    return sliderImages[activeSlide] || sliderImages[0];
  }, [sliderImages, activeSlide]);

  const loadSliderImages = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/slider/public`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || `Request failed: ${response.status}`);
      }
      const rows = Array.isArray(payload.items) ? payload.items : [];
      const nextImages = rows
        .map((item) => {
          if (typeof item === "string") return item.trim();
          return String(item?.image_url || "").trim();
        })
        .filter(Boolean)
        .slice(0, MAX_SLIDES);

      setSliderImages(nextImages.length ? nextImages : DEFAULT_SLIDER_IMAGES);
    } catch (err) {
      setSliderImages(DEFAULT_SLIDER_IMAGES);
    }
  }, [apiBase]);

  const loadFixtures = useCallback(
    async ({ page = fixturePage, query = fixtureQuery, leagueId = fixtureLeagueId } = {}) => {
      setFixtureLoading(true);
      setFixtureError("");
      try {
        const today = todayLocalISODate();
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", "12");
        params.set("day", today);
        if (leagueId !== "all") {
          params.set("league_id", leagueId);
        }
        if (query.trim()) {
          params.set("q", query.trim());
        }

        const response = await fetch(`${apiBase}/fixtures/public/today?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || `Request failed: ${response.status}`);
        }

        setFixturePayload({
          page: Number(payload.page) || page,
          page_size: Number(payload.page_size) || 12,
          total: Number(payload.total) || 0,
          total_pages: Number(payload.total_pages) || 1,
          items: Array.isArray(payload.items) ? payload.items : [],
        });
      } catch (err) {
        setFixturePayload({
          page: 1,
          page_size: 12,
          total: 0,
          total_pages: 1,
          items: [],
        });
        setFixtureError(err.message || "Mac listesi alinamadi.");
      } finally {
        setFixtureLoading(false);
      }
    },
    [apiBase, fixtureLeagueId, fixturePage, fixtureQuery]
  );

  useEffect(() => {
    if (!hasSlides) return;
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % sliderImages.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, [hasSlides, sliderImages.length]);

  useEffect(() => {
    if (!sliderImages.length) {
      setActiveSlide(0);
      return;
    }
    if (activeSlide >= sliderImages.length) {
      setActiveSlide(0);
    }
  }, [activeSlide, sliderImages.length]);

  useEffect(() => {
    loadFixtures();
  }, [loadFixtures]);

  useEffect(() => {
    loadSliderImages();
    const timer = window.setInterval(() => {
      loadSliderImages();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadSliderImages]);

  const kickoffLabel = (value) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString("tr-TR");
  };

  const teamInitials = (name) => {
    const words = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return "?";
    const parts = words.slice(0, 2).map((item) => item[0]);
    return parts.join("").toUpperCase();
  };

  const applyFixtureFilters = () => {
    const nextQuery = fixtureQueryInput.trim();
    const shouldReload = fixturePage === 1 && fixtureQuery === nextQuery;
    setFixturePage(1);
    setFixtureQuery(nextQuery);
    if (shouldReload) {
      loadFixtures({ page: 1, query: nextQuery, leagueId: fixtureLeagueId });
    }
  };

  return (
    <div className="container guest-modern-shell">
      <section className="card guest-betting-hero">
        <div className="guest-hero-grid">
          <div className="guest-copy">
            <span className="sports-pill">{uiText.guestLanding.heroPill}</span>
            <h1>{uiText.guestLanding.heroTitle}</h1>
            <p className="hero-text">{uiText.guestLanding.heroText}</p>
            <div className="row wrap">
              <ActionButton onClick={() => navigate("/login")}>{uiText.guestLanding.ctaLogin}</ActionButton>
              <ActionButton className="secondary" onClick={() => navigate("/register")}>
                {uiText.guestLanding.ctaRegister}
              </ActionButton>
              <ActionButton className="secondary" onClick={() => navigate("/forgot-password")}>
                {uiText.guestLanding.ctaForgotPassword}
              </ActionButton>
            </div>
          </div>

          <div className="guest-odds-wall">
            <div className="odds-board-title">{uiText.guestLanding.featuredOddsTitle}</div>
            <div className="odds-board-head">
              <span>Maç</span>
              <span>1</span>
              <span>X</span>
              <span>2</span>
              <span>Skor</span>
              <span>i</span>
            </div>
            {featuredOddsRows.map((row) => {
              const detail = deriveAllOdds(row);
              const rowId = String(row?.id || "");
              const isExpanded = rowId && expandedOddsRowId === rowId;
              const modelScoreText = String(row?.score_text || "").trim() || "Skor bekleniyor";
              return (
                <React.Fragment key={`guest-modern-odds-${row.id}`}>
                  <div className="odds-board-row">
                    <span className="match-name">
                      <div className="fixture-teams inline">
                        <TeamBadge logo={row.home_team_logo} name={row.home_team_name} small />
                        <span className="vs-chip">vs</span>
                        <TeamBadge logo={row.away_team_logo} name={row.away_team_name} small />
                      </div>
                    </span>
                    <strong>{row.home}</strong>
                    <strong>{row.draw}</strong>
                    <strong>{row.away}</strong>
                    <span className="odds-model-score">{modelScoreText}</span>
                    <button
                      type="button"
                      className="odds-info-btn"
                      aria-label="Tum oranlari goster"
                      onClick={() => setExpandedOddsRowId(isExpanded ? "" : rowId)}
                    >
                      i
                    </button>
                  </div>
                  {isExpanded && detail ? (
                    <div className="odds-board-detail">
                      <div className="odds-detail-grid">
                        <div className="odds-detail-item">
                          <span>1X</span>
                          <strong>{detail.homeOrDraw}</strong>
                        </div>
                        <div className="odds-detail-item">
                          <span>12</span>
                          <strong>{detail.homeOrAway}</strong>
                        </div>
                        <div className="odds-detail-item">
                          <span>X2</span>
                          <strong>{detail.drawOrAway}</strong>
                        </div>
                        <div className="odds-detail-item">
                          <span>Model Olasilik 1</span>
                          <strong>{detail.homeProb}</strong>
                        </div>
                        <div className="odds-detail-item">
                          <span>Model Olasilik X</span>
                          <strong>{detail.drawProb}</strong>
                        </div>
                        <div className="odds-detail-item">
                          <span>Model Olasilik 2</span>
                          <strong>{detail.awayProb}</strong>
                        </div>
                        <div className="odds-detail-item">
                          <span>Model Skor Tahmini</span>
                          <strong>{modelScoreText}</strong>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card guest-slider-showcase">
        <div className="guest-slider-stage" style={{ backgroundImage: `url(${activeSlideImage})` }}>
          <div className="guest-slider-overlay" />
          <div className="guest-slider-content">
            <div className="guest-slider-controls">
              <button
                type="button"
                className="guest-slider-btn"
                onClick={() => setActiveSlide((prev) => (prev - 1 + sliderImages.length) % sliderImages.length)}
                disabled={!hasSlides}
              >
                {uiText.guestLanding.sliderPrev}
              </button>
              <button
                type="button"
                className="guest-slider-btn"
                onClick={() => setActiveSlide((prev) => (prev + 1) % sliderImages.length)}
                disabled={!hasSlides}
              >
                {uiText.guestLanding.sliderNext}
              </button>
            </div>
          </div>
        </div>

        <div className="guest-slider-dots">
          {sliderImages.map((_, index) => (
            <button
              key={`slide-dot-${index}`}
              type="button"
              className={`guest-slider-dot ${index === activeSlide ? "active" : ""}`}
              onClick={() => setActiveSlide(index)}
            />
          ))}
        </div>
      </section>

      <section className="card guest-fixture-market">
        <div className="row spread wrap">
          <h2>{uiText.guestLanding.todaysMatchesTitle}</h2>
          <span className="small-text">
            {uiText.guestLanding.todaysMatchesTotalLabel}: <strong>{fixturePayload.total}</strong>
          </span>
        </div>

        <div className="guest-filter-row">
          <select
            value={fixtureLeagueId}
            onChange={(event) => {
              setFixtureLeagueId(event.target.value);
              setFixturePage(1);
            }}
          >
            <option value="all">{uiText.guestLanding.leagueAll}</option>
            <option value="600">{uiText.guestLanding.leagueSuperLig}</option>
            <option value="564">{uiText.guestLanding.leagueLaLiga}</option>
          </select>
          <input
            placeholder={uiText.guestLanding.searchPlaceholder}
            value={fixtureQueryInput}
            onChange={(event) => setFixtureQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyFixtureFilters();
              }
            }}
          />
          <ActionButton onClick={applyFixtureFilters}>{uiText.guestLanding.listButton}</ActionButton>
        </div>

        {fixtureError ? <div className="error">{fixtureError}</div> : null}
        {fixtureLoading ? <p className="small-text">{uiText.guestLanding.loadingFixtures}</p> : null}

        <div className="guest-fixture-list">
          {(fixturePayload.items || []).map((fixture) => (
            <article key={`guest-fixture-${fixture.fixture_id}`} className="guest-fixture-item">
              <div className="guest-fixture-main">
                <div className="guest-fixture-teams">
                  <span className="guest-team-line">
                    {fixture.home_team_logo ? (
                      <img src={fixture.home_team_logo} alt={fixture.home_team_name || "Home"} />
                    ) : (
                      <span className="guest-team-fallback">{teamInitials(fixture.home_team_name)}</span>
                    )}
                    <strong>{fixture.home_team_name || "Home"}</strong>
                  </span>

                  <span className="vs-chip">VS</span>

                  <span className="guest-team-line">
                    {fixture.away_team_logo ? (
                      <img src={fixture.away_team_logo} alt={fixture.away_team_name || "Away"} />
                    ) : (
                      <span className="guest-team-fallback">{teamInitials(fixture.away_team_name)}</span>
                    )}
                    <strong>{fixture.away_team_name || "Away"}</strong>
                  </span>
                </div>

                <div className="guest-fixture-meta">
                  <span>{kickoffLabel(fixture.starting_at)}</span>
                  <span>Fixture ID: {fixture.fixture_id}</span>
                </div>
              </div>

              <div className="guest-fixture-actions">
                <ActionButton className="secondary" onClick={() => navigate("/login")}>
                  {uiText.guestLanding.loginForAiPrediction}
                </ActionButton>
              </div>
            </article>
          ))}

          {!fixtureLoading && !(fixturePayload.items || []).length ? (
            <div className="small-text">{uiText.guestLanding.noMatches}</div>
          ) : null}
        </div>

        <div className="row wrap">
          <ActionButton
            className="secondary"
            disabled={fixturePayload.page <= 1 || fixtureLoading}
            onClick={() => setFixturePage((prev) => Math.max(1, prev - 1))}
          >
            {uiText.guestLanding.prevPage}
          </ActionButton>
          <span className="small-text">
            Sayfa {fixturePayload.page} / {fixturePayload.total_pages}
          </span>
          <ActionButton
            className="secondary"
            disabled={fixturePayload.page >= fixturePayload.total_pages || fixtureLoading}
            onClick={() => setFixturePage((prev) => prev + 1)}
          >
            {uiText.guestLanding.nextPage}
          </ActionButton>
        </div>
      </section>

    </div>
  );
}
