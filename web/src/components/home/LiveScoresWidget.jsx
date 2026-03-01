import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import LiveMatchCard from "./LiveMatchCard";
import "./LiveScoresWidget.css";

const REFRESH_INTERVAL = 60000; // 60 saniye
const API_TIMEOUT = 5000; // 5 saniye
const LIVE_STATUS_TOKENS = ["live", "inplay", "1st half", "2nd half", "halftime", "extra time", "penalty"];

function toLocalISODate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function normalizeApiBase(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value === "undefined" || value === "null") {
    return "";
  }
  return value.replace(/\/+$/, "");
}

function buildApiUrl(apiBase, path) {
  if (!path.startsWith("/")) {
    return apiBase ? `${apiBase}/${path}` : `/${path}`;
  }
  return apiBase ? `${apiBase}${path}` : path;
}

function asNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(rawMatch) {
  const status = String(rawMatch?.status ?? rawMatch?.state?.state ?? rawMatch?.state?.name ?? "").trim();
  return status || "scheduled";
}

function isLiveMatch(rawMatch, status, minute) {
  if (rawMatch?.is_live === true) {
    return true;
  }
  if (minute !== null && minute > 0) {
    return true;
  }
  const normalizedStatus = status.toLowerCase();
  return LIVE_STATUS_TOKENS.some((token) => normalizedStatus.includes(token));
}

function normalizeLiveMatch(rawMatch) {
  const fixtureId = rawMatch?.fixture_id ?? rawMatch?.id ?? null;
  const status = normalizeStatus(rawMatch);
  const matchMinute = asNumberOrNull(rawMatch?.match_minute ?? rawMatch?.state?.minute);
  const homeScore = asNumberOrNull(rawMatch?.home_score ?? rawMatch?.scores?.home_score ?? rawMatch?.scores?.home);
  const awayScore = asNumberOrNull(rawMatch?.away_score ?? rawMatch?.scores?.away_score ?? rawMatch?.scores?.away);
  const matchResultMarket = rawMatch?.market_match_result_json ?? rawMatch?.markets?.match_result ?? null;

  return {
    fixture_id: fixtureId,
    league_name: rawMatch?.league_name ?? rawMatch?.league?.name ?? rawMatch?.league ?? null,
    status,
    is_live: isLiveMatch(rawMatch, status, matchMinute),
    match_minute: matchMinute,
    home_score: homeScore,
    away_score: awayScore,
    home_team_name: rawMatch?.home_team_name ?? rawMatch?.home_team?.name ?? "Home",
    away_team_name: rawMatch?.away_team_name ?? rawMatch?.away_team?.name ?? "Away",
    home_team_logo: rawMatch?.home_team_logo ?? rawMatch?.home_team?.logo_url ?? rawMatch?.home_team?.image_path ?? null,
    away_team_logo: rawMatch?.away_team_logo ?? rawMatch?.away_team?.logo_url ?? rawMatch?.away_team?.image_path ?? null,
    market_match_result_json: matchResultMarket,
    markets: rawMatch?.markets ?? (matchResultMarket ? { match_result: matchResultMarket } : {}),
    scores: rawMatch?.scores ?? {
      home_score: homeScore,
      away_score: awayScore,
    },
    state: rawMatch?.state ?? {
      state: rawMatch?.match_state ?? null,
      minute: matchMinute,
      second: rawMatch?.match_second ?? null,
      added_time: rawMatch?.match_added_time ?? null,
    },
  };
}

function normalizeLiveMatches(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item) => normalizeLiveMatch(item))
    .filter((match) => Boolean(match?.home_team_name) && Boolean(match?.away_team_name));
}

function buildRequestError(message, meta) {
  const err = new Error(message);
  err.meta = meta;
  return err;
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload?.detail === "string" ? payload.detail : "";
      throw buildRequestError(`HTTP ${response.status}${detail ? ` - ${detail}` : ""}`, {
        endpoint: url,
        status: response.status,
        detail: detail || null,
      });
    }
    return payload;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw buildRequestError(`Request timeout after ${API_TIMEOUT}ms`, {
        endpoint: url,
        status: 0,
        detail: "timeout",
      });
    }
    if (!err?.meta) {
      throw buildRequestError(err?.message || "Request failed", {
        endpoint: url,
        status: 0,
        detail: err?.message || "unknown_error",
      });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function LiveScoresWidget({ apiBase }) {
  const { t } = useLanguage();
  const normalizedApiBase = useMemo(() => normalizeApiBase(apiBase), [apiBase]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [previousOdds, setPreviousOdds] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);
  const isVisibleRef = useRef(true);
  const lastSuccessfulMatchesRef = useRef([]);
  const hasSuccessfulFetchRef = useRef(false);

  const fetchLiveMatches = useCallback(async () => {
    const today = toLocalISODate();
    const attempts = [
      {
        label: "fixtures/board",
        path: "/fixtures/board?page=1&page_size=10&sort=asc",
      },
      {
        label: "fixtures/public/today",
        path: `/fixtures/public/today?page=1&page_size=20&sort=asc&day=${today}`,
      },
    ];

    let lastError = null;

    for (const attempt of attempts) {
      const endpoint = buildApiUrl(normalizedApiBase, attempt.path);
      try {
        const payload = await fetchJsonWithTimeout(endpoint);
        const matches = normalizeLiveMatches(payload).filter((match) => match.is_live === true);

        const newPreviousOdds = {};
        lastSuccessfulMatchesRef.current.forEach((match) => {
          if (match.fixture_id && match.market_match_result_json) {
            newPreviousOdds[match.fixture_id] = match.market_match_result_json;
          }
        });

        setPreviousOdds(newPreviousOdds);
        lastSuccessfulMatchesRef.current = matches;
        setLiveMatches(matches);
        setLastUpdate(new Date());
        setError(null);
        setLoading(false);
        hasSuccessfulFetchRef.current = true;
        return;
      } catch (err) {
        lastError = err;
        console.error(`[LiveScoresWidget] ${attempt.label} failed`, {
          endpoint,
          status: err?.meta?.status ?? 0,
          detail: err?.meta?.detail ?? err?.message ?? "unknown_error",
        });
      }
    }

    setLoading(false);
    if (hasSuccessfulFetchRef.current) {
      return;
    }
    setError(lastError?.message || "Live scores request failed");
  }, [normalizedApiBase]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchLiveMatches();
  }, [fetchLiveMatches]);

  useEffect(() => {
    fetchLiveMatches();
  }, [fetchLiveMatches]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (isVisibleRef.current) {
        fetchLiveMatches();
      }
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchLiveMatches]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      if (isVisibleRef.current) {
        fetchLiveMatches();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchLiveMatches]);

  if (loading) {
    return (
      <section className="live-scores-widget">
        <div className="live-scores-container">
          <div className="live-scores-loading">
            <div className="loading-spinner" />
            <p>{t.liveScores?.loading || "Canlı maçlar yükleniyor..."}</p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="live-scores-widget">
        <div className="live-scores-container">
          <div className="live-scores-error">
            <p>{t.liveScores?.error || "Canlı skorlar yüklenemedi"}</p>
            <button onClick={handleRetry} className="retry-button">
              {t.liveScores?.retry || "Tekrar Dene"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (liveMatches.length === 0) {
    return null;
  }

  return (
    <section className="live-scores-widget">
      <div className="live-scores-container">
        <div className="live-scores-header">
          <div className="live-scores-title">
            <span className="live-indicator">🔴</span>
            <h2>{t.liveScores?.title || "Canlı Skorlar"}</h2>
          </div>
          {lastUpdate && (
            <div className="live-scores-update">
              {t.liveScores?.lastUpdate || "Son güncelleme"}: {lastUpdate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>

        <div className="live-scores-grid">
          {liveMatches.map((match, index) => (
            <LiveMatchCard
              key={match.fixture_id || `live-match-${index}`}
              match={match}
              previousOdds={previousOdds[match.fixture_id]}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
