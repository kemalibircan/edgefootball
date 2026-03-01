import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import TeamLogo from "../common/TeamLogo";
import "./AiFeaturedHighlights.css";

const MAX_HIGHLIGHTS = 4;

function parsePositiveOdd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 1) return null;
  return parsed;
}

function normalizeMatchResultOdds(matchResult) {
  if (!matchResult || typeof matchResult !== "object") return null;
  const home = parsePositiveOdd(matchResult["1"] ?? matchResult.home);
  const draw = parsePositiveOdd(matchResult["0"] ?? matchResult.draw);
  const away = parsePositiveOdd(matchResult["2"] ?? matchResult.away);
  if (!home || !draw || !away) return null;
  return { home, draw, away };
}

function normalizeHighlightRow(row, index) {
  if (!row) return null;

  const fixtureIdRaw = Number(row.fixture_id ?? row.id);
  const fixtureId = Number.isFinite(fixtureIdRaw) && fixtureIdRaw > 0 ? Math.trunc(fixtureIdRaw) : null;

  const homeTeamName = String(row.home_team_name ?? row.home_team?.name ?? "").trim() || "Home";
  const awayTeamName = String(row.away_team_name ?? row.away_team?.name ?? "").trim() || "Away";
  const homeTeamLogo = String(row.home_team_logo ?? row.home_team?.logo_url ?? "").trim() || null;
  const awayTeamLogo = String(row.away_team_logo ?? row.away_team?.logo_url ?? "").trim() || null;
  const leagueName = String(row.league_name ?? row.league?.name ?? row.league ?? "").trim() || null;

  const directHome = parsePositiveOdd(row.odd_home);
  const directDraw = parsePositiveOdd(row.odd_draw);
  const directAway = parsePositiveOdd(row.odd_away);
  const odds =
    directHome && directDraw && directAway
      ? { home: directHome, draw: directDraw, away: directAway }
      : normalizeMatchResultOdds(row.markets?.match_result);

  if (!odds) return null;

  const stableKey = fixtureId ? String(fixtureId) : `highlight-${index}-${homeTeamName}-${awayTeamName}`;
  return {
    key: stableKey,
    fixture_id: fixtureId,
    home_team_name: homeTeamName,
    away_team_name: awayTeamName,
    home_team_logo: homeTeamLogo,
    away_team_logo: awayTeamLogo,
    league_name: leagueName,
    odds,
  };
}

function formatOdd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "-";
  return parsed.toFixed(2);
}

export default function AiFeaturedHighlights({ apiBase }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadHighlights = useCallback(async () => {
    setLoading(true);
    setError("");

    const fetchJson = async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Failed to load highlights");
      }
      return payload;
    };

    try {
      const showcasePayload = await fetchJson(`${apiBase}/showcase/public`);
      const showcaseItems = Array.isArray(showcasePayload?.sections?.popular_odds?.items)
        ? showcasePayload.sections.popular_odds.items
        : [];
      const showcaseHighlights = showcaseItems
        .map((row, index) => normalizeHighlightRow(row, index))
        .filter(Boolean)
        .slice(0, MAX_HIGHLIGHTS);

      if (showcaseHighlights.length) {
        setHighlights(showcaseHighlights);
        return;
      }

      const fixturesPayload = await fetchJson(`${apiBase}/fixtures/public/today?page=1&page_size=8&sort=desc`);
      const fixtureItems = Array.isArray(fixturesPayload?.items) ? fixturesPayload.items : [];
      const fallbackHighlights = fixtureItems
        .map((row, index) => normalizeHighlightRow(row, index))
        .filter(Boolean)
        .slice(0, MAX_HIGHLIGHTS);

      setHighlights(fallbackHighlights);
    } catch (err) {
      setError(String(err.message || "Failed to load highlights"));
      setHighlights([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  const calculateAiConfidence = (odds) => {
    if (!odds) return 0;
    const home = parsePositiveOdd(odds.home) || 0;
    const draw = parsePositiveOdd(odds.draw) || 0;
    const away = parsePositiveOdd(odds.away) || 0;
    
    if (home <= 0 || draw <= 0 || away <= 0) return 0;
    
    const homeProb = 1 / home;
    const drawProb = 1 / draw;
    const awayProb = 1 / away;
    const total = homeProb + drawProb + awayProb;
    
    const maxProb = Math.max(homeProb, drawProb, awayProb);
    const confidence = (maxProb / total) * 100;
    
    return Math.round(confidence);
  };

  if (loading) {
    return (
      <section className="ai-featured-highlights">
        <div className="container">
          <h2 className="section-title">{t.guestLanding.featuredOddsTitle}</h2>
          <div className="highlights-loading">Loading highlights...</div>
        </div>
      </section>
    );
  }

  if (error || highlights.length === 0) {
    return null;
  }

  return (
    <section className="ai-featured-highlights">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">{t.guestLanding.featuredOddsTitle}</h2>
          <div className="ai-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            AI Powered
          </div>
        </div>

        <div className="highlights-grid">
          {highlights.map((fixture) => {
            const confidence = calculateAiConfidence(fixture.odds);
            const canOpenFixture = Number.isFinite(fixture.fixture_id) && fixture.fixture_id > 0;

            return (
              <div
                key={fixture.key}
                className="highlight-card glass-card"
                onClick={() => {
                  if (canOpenFixture) navigate(`/fixture/${fixture.fixture_id}`);
                }}
                style={{ cursor: canOpenFixture ? "pointer" : "default" }}
              >
                <div className="highlight-teams">
                  <div className="highlight-team">
                    <TeamLogo
                      src={fixture.home_team_logo}
                      teamName={fixture.home_team_name}
                      alt={fixture.home_team_name}
                      size="lg"
                    />
                    <div className="highlight-team-name">{fixture.home_team_name}</div>
                  </div>

                  <div className="highlight-vs">VS</div>

                  <div className="highlight-team">
                    <TeamLogo
                      src={fixture.away_team_logo}
                      teamName={fixture.away_team_name}
                      alt={fixture.away_team_name}
                      size="lg"
                    />
                    <div className="highlight-team-name">{fixture.away_team_name}</div>
                  </div>
                </div>

                <div className="highlight-odds">
                  <div className="highlight-odd">
                    <div className="highlight-odd-label">1</div>
                    <div className="highlight-odd-value">{formatOdd(fixture.odds?.home)}</div>
                  </div>
                  <div className="highlight-odd">
                    <div className="highlight-odd-label">X</div>
                    <div className="highlight-odd-value">{formatOdd(fixture.odds?.draw)}</div>
                  </div>
                  <div className="highlight-odd">
                    <div className="highlight-odd-label">2</div>
                    <div className="highlight-odd-value">{formatOdd(fixture.odds?.away)}</div>
                  </div>
                </div>

                <div className="highlight-confidence">
                  <div className="highlight-confidence-bar">
                    <div
                      className="highlight-confidence-fill"
                      style={{ width: `${confidence}%` }}
                    />
                  </div>
                  <div className="highlight-confidence-label">AI Confidence: {confidence}%</div>
                </div>

                {fixture.league_name ? (
                  <div className="highlight-league">{fixture.league_name}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
