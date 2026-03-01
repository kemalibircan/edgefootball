import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { useChat } from "../../contexts/ChatContext";
import TeamLogo from "../common/TeamLogo";
import OddsButton from "../coupon/OddsButton";
import "./MatchPredictionCenter.css";

const LEAGUE_OPTIONS = [
  { id: null, label_tr: "Tüm Ligler", label_en: "All Leagues" },
  { id: 600, label_tr: "Süper Lig", label_en: "Super Lig" },
  { id: 564, label_tr: "La Liga", label_en: "La Liga" },
  { id: 8, label_tr: "Premier League", label_en: "Premier League" },
  { id: 384, label_tr: "Serie A", label_en: "Serie A" },
  { id: 2, label_tr: "Şampiyonlar Ligi", label_en: "Champions League" },
  { id: 5, label_tr: "Avrupa Ligi", label_en: "Europa League" },
];

function todayLocalISODate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function addDaysToISODate(isoDate, daysToAdd) {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return isoDate;
  }
  const dt = new Date(year, month - 1, day);
  dt.setDate(dt.getDate() + Number(daysToAdd || 0));
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

async function fetchJsonOrThrow(url) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to load fixtures");
  }
  return payload;
}

function compareFixtures(left, right) {
  const leftTime = left?.starting_at ? Date.parse(left.starting_at) : Number.POSITIVE_INFINITY;
  const rightTime = right?.starting_at ? Date.parse(right.starting_at) : Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return Number(left?.fixture_id || 0) - Number(right?.fixture_id || 0);
}

export default function MatchPredictionCenter({ apiBase }) {
  const { t, locale } = useLanguage();
  const navigate = useNavigate();
  const { askFromAction, openSidebar } = useChat();
  
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leagueFilter, setLeagueFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [displayMode, setDisplayMode] = useState("today");
  const [requestedDay, setRequestedDay] = useState("");
  const [fallbackDateFrom, setFallbackDateFrom] = useState(null);
  const [fallbackDateTo, setFallbackDateTo] = useState(null);

  const loadFixtures = useCallback(async () => {
    setLoading(true);
    setError("");
    const today = todayLocalISODate();
    const fallbackEnd = addDaysToISODate(today, 6);
    setRequestedDay(today);
    setDisplayMode("today");
    setFallbackDateFrom(null);
    setFallbackDateTo(null);

    try {
      const paramsBase = new URLSearchParams();
      paramsBase.set("page", String(page));
      paramsBase.set("page_size", "12");
      paramsBase.set("sort", "asc");
      if (leagueFilter !== null) {
        paramsBase.set("league_id", String(leagueFilter));
      }
      if (searchQuery.trim()) {
        paramsBase.set("q", searchQuery.trim());
      }

      const todayParams = new URLSearchParams(paramsBase);
      todayParams.set("day", today);
      const todayPayload = await fetchJsonOrThrow(`${apiBase}/fixtures/public/today?${todayParams.toString()}`);
      const todayItems = Array.isArray(todayPayload.items) ? todayPayload.items : [];
      const todayTotal = Number(todayPayload.total) || 0;

      if (todayTotal > 0 || todayItems.length > 0) {
        setFixtures(todayItems);
        setTotalPages(Math.max(1, Number(todayPayload.total_pages) || 1));
        setDisplayMode("today");
        return;
      }

      const fallbackDays = Array.from({ length: 7 }, (_, idx) => addDaysToISODate(today, idx));
      const fallbackRequests = fallbackDays.map((dayValue) => {
        const dayParams = new URLSearchParams(paramsBase);
        dayParams.set("page", "1");
        dayParams.set("page_size", "50");
        dayParams.set("day", dayValue);
        return fetchJsonOrThrow(`${apiBase}/fixtures/public/today?${dayParams.toString()}`);
      });
      const fallbackResponses = await Promise.all(fallbackRequests);
      const deduped = new Map();
      for (const payload of fallbackResponses) {
        const items = Array.isArray(payload?.items) ? payload.items : [];
        for (const item of items) {
          const fixtureId = String(item?.fixture_id || "").trim();
          if (!fixtureId || deduped.has(fixtureId)) {
            continue;
          }
          deduped.set(fixtureId, item);
        }
      }
      const allFallbackItems = Array.from(deduped.values()).sort(compareFixtures);
      const fallbackPageSize = 12;
      const fallbackTotal = allFallbackItems.length;
      const fallbackTotalPages = Math.max(1, Math.ceil(fallbackTotal / fallbackPageSize));
      const safePage = Math.max(1, Math.min(page, fallbackTotalPages));
      const offset = (safePage - 1) * fallbackPageSize;
      const pagedFallbackItems = allFallbackItems.slice(offset, offset + fallbackPageSize);
      if (safePage !== page) {
        setPage(safePage);
      }

      setFixtures(pagedFallbackItems);
      setTotalPages(fallbackTotalPages);
      setDisplayMode("fallback_week");
      setFallbackDateFrom(today);
      setFallbackDateTo(fallbackEnd);
    } catch (err) {
      setError(String(err.message || "Failed to load fixtures"));
      setFixtures([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [apiBase, page, leagueFilter, searchQuery]);

  useEffect(() => {
    loadFixtures();
  }, [loadFixtures]);

  const handleAskAi = (fixture, e) => {
    e.stopPropagation();
    
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

  const isFallbackWeek = displayMode === "fallback_week";
  const fallbackNotice = locale === "en"
    ? t.guestLanding.todaysMatchesFallbackNotice || "No matches today. Showing the next 7 days."
    : t.guestLanding.todaysMatchesFallbackNotice || "Bugün maç yok. Önümüzdeki 7 günün maçları gösteriliyor.";
  const fallbackEmpty = locale === "en"
    ? t.guestLanding.todaysMatchesFallbackEmpty || "No matches found for today or the next 7 days."
    : t.guestLanding.todaysMatchesFallbackEmpty || "Bugün ve önümüzdeki 7 günde maç bulunamadı.";
  const rangeLabel = locale === "en"
    ? t.guestLanding.todaysMatchesFallbackRangeLabel || "Range"
    : t.guestLanding.todaysMatchesFallbackRangeLabel || "Aralık";

  return (
    <section className="match-prediction-center">
      <div className="container">
        <h2 className="section-title">{t.guestLanding.todaysMatchesTitle}</h2>

        <div className="match-filters">
          <div className="match-filters-leagues">
            {LEAGUE_OPTIONS.map((league) => (
              <button
                key={league.id || "all"}
                className={`filter-btn ${leagueFilter === league.id ? "active" : ""}`}
                onClick={() => {
                  setLeagueFilter(league.id);
                  setPage(1);
                }}
              >
                {locale === "en" ? league.label_en : league.label_tr}
              </button>
            ))}
          </div>

          <div className="match-filters-search">
            <input
              type="text"
              placeholder={t.guestLanding.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="search-input"
            />
          </div>
        </div>

        {!loading && !error && isFallbackWeek ? (
          <div className="match-info-banner" role="status" aria-live="polite">
            <div className="match-info-banner-title">{fallbackNotice}</div>
            {fallbackDateFrom && fallbackDateTo ? (
              <div className="match-info-banner-meta">
                {rangeLabel}: {fallbackDateFrom} - {fallbackDateTo}
                {requestedDay ? ` • ${locale === "en" ? "Requested day" : "İstenen gün"}: ${requestedDay}` : ""}
              </div>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="match-loading">{t.guestLanding.loadingFixtures}</div>
        ) : error ? (
          <div className="match-error">{error}</div>
        ) : fixtures.length === 0 ? (
          <div className="match-empty">{isFallbackWeek ? fallbackEmpty : t.guestLanding.noMatches}</div>
        ) : (
          <>
            <div className="match-grid">
              {fixtures.map((fixture) => {
                const odds = fixture.markets?.match_result || {};
                const startTime = fixture.starting_at
                  ? new Date(fixture.starting_at).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";

                return (
                  <div
                    key={fixture.fixture_id}
                    className="match-card glass-card"
                    onClick={() => navigate(`/fixture/${fixture.fixture_id}`)}
                  >
                    <div className="match-card-league">
                      {fixture.league_name}
                      {startTime ? ` • ${startTime}` : ""}
                    </div>

                    <div className="match-card-teams">
                      <div className="match-card-team">
                        <TeamLogo
                          src={fixture.home_team_logo}
                          teamName={fixture.home_team_name}
                          alt={fixture.home_team_name}
                          size="lg"
                        />
                        <div className="match-card-team-name">{fixture.home_team_name}</div>
                      </div>

                      <div className="match-card-vs">VS</div>

                      <div className="match-card-team">
                        <TeamLogo
                          src={fixture.away_team_logo}
                          teamName={fixture.away_team_name}
                          alt={fixture.away_team_name}
                          size="lg"
                        />
                        <div className="match-card-team-name">{fixture.away_team_name}</div>
                      </div>
                    </div>

                    {odds.home && odds.draw && odds.away ? (
                      <div className="match-card-odds-row">
                        <div className="match-card-odds-group">
                          <span className="match-card-odds-label">1X2</span>
                          <div className="match-card-odds-buttons">
                            <OddsButton
                              fixture={fixture}
                              selection="1"
                              odd={odds.home}
                              marketKey="match_result"
                              marketLabel={t.coupon.odds.matchResult}
                              selectionDisplay={t.coupon.odds.home}
                              requiresAuth={true}
                              size="sm"
                            />
                            <OddsButton
                              fixture={fixture}
                              selection="X"
                              odd={odds.draw}
                              marketKey="match_result"
                              marketLabel={t.coupon.odds.matchResult}
                              selectionDisplay={t.coupon.odds.draw}
                              requiresAuth={true}
                              size="sm"
                            />
                            <OddsButton
                              fixture={fixture}
                              selection="2"
                              odd={odds.away}
                              marketKey="match_result"
                              marketLabel={t.coupon.odds.matchResult}
                              selectionDisplay={t.coupon.odds.away}
                              requiresAuth={true}
                              size="sm"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="match-card-actions">
                      <button className="btn-ghost btn-small">
                        {locale === "en" ? "Details" : "Detay Gör"}
                      </button>
                      <button
                        className="btn-secondary btn-small"
                        onClick={(e) => handleAskAi(fixture, e)}
                      >
                        {locale === "en" ? "Ask AI" : "AI'a Sor"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 ? (
              <div className="match-pagination">
                <button
                  className="btn-ghost"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  {t.guestLanding.prevPage}
                </button>
                <span className="match-pagination-info">
                  {page} / {totalPages}
                </span>
                <button
                  className="btn-ghost"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  {t.guestLanding.nextPage}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
