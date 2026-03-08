import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import GuestLanding from "../components/guest/GuestLanding";
import {
  fetchAllModels,
  filterByLeague,
  isVisibleForCurrentUser,
  resolveModelScope,
  sortVisibleModels,
} from "../lib/modelCatalog";
import { API_BASE, apiRequest, isAuthTerminalError, logoutCurrentSession } from "../lib/api";
import { clearAuthToken, readAuthToken } from "../lib/auth";
import { CREDIT_PACKAGES, PAYMENT_WALLETS } from "../lib/tokenPackages";
import { useChat } from "../contexts/ChatContext";
import DashboardAuthenticatedPage from "./dashboard/DashboardAuthenticatedPage";
import DashboardLoadingPage from "./dashboard/DashboardLoadingPage";
import DashboardModelsPage from "./dashboard/DashboardModelsPage";

const LAST_SIMULATION_STORAGE_KEY = "football_ai_last_simulation_snapshot";
const LEAGUE_OPTIONS = [
  { id: 600, code: "TR-SL", label: "Super Lig" },
  { id: 564, code: "ES-LL", label: "La Liga" },
  { id: 8, code: "EN-PL", label: "Premier League" },
  { id: 384, code: "IT-SA", label: "Serie A" },
  { id: 2, code: "UEFA-CL", label: "Champions League" },
  { id: 5, code: "UEFA-EL", label: "Europa League" },
];
const DEFAULT_LEAGUE_ID = 600;

function shiftedLocalISODate(offsetDays = 0) {
  const base = new Date();
  base.setDate(base.getDate() + Number(offsetDays || 0));
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

const FIXTURE_CUSTOM_MAX_RANGE_DAYS = 14;
const FIXTURE_DAY_WINDOW_OPTIONS = [
  { value: "today", label: "Bugun" },
  { value: "tomorrow", label: "Yarin" },
  { value: "this_week", label: "Bu Hafta" },
  { value: "custom", label: "Tarih Sec" },
];
const SIMULATION_CREDIT_COST = 7;
const AI_COMMENTARY_CREDIT_COST = 10;
const MODEL_TRAINING_CREDIT_COST = 5;
const MODEL_LIST_PAGE_SIZE = 5;
const MODEL_CATALOG_FILTERS = [
  { value: "all", label: "Tum Modeller" },
  { value: "ready", label: "Hazir Modeller" },
  { value: "mine", label: "Kendi Modellerim" },
];
const AUTH_BOOTSTRAP_TIMEOUT_MS = 2500;

function getFixtureDateRangeLimits() {
  return {
    minDate: shiftedLocalISODate(0),
    maxDate: shiftedLocalISODate(FIXTURE_CUSTOM_MAX_RANGE_DAYS),
  };
}

function clampISODate(value, minDate, maxDate) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  if (minDate && text < minDate) return minDate;
  if (maxDate && text > maxDate) return maxDate;
  return text;
}

function resolveFixtureDateRange(filters = {}) {
  const dayWindow = String(filters.day_window || "today");
  if (dayWindow === "today") {
    const today = shiftedLocalISODate(0);
    return { date_from: today, date_to: today };
  }
  if (dayWindow === "tomorrow") {
    const tomorrow = shiftedLocalISODate(1);
    return { date_from: tomorrow, date_to: tomorrow };
  }
  if (dayWindow === "this_week") {
    return { date_from: shiftedLocalISODate(0), date_to: shiftedLocalISODate(6) };
  }
  if (dayWindow === "custom") {
    const { minDate, maxDate } = getFixtureDateRangeLimits();
    const date_from = clampISODate(filters.date_from || minDate, minDate, maxDate) || minDate;
    let date_to = clampISODate(filters.date_to || date_from, minDate, maxDate) || date_from;
    if (date_to < date_from) {
      date_to = date_from;
    }
    return { date_from, date_to };
  }
  return {
    date_from: shiftedLocalISODate(0),
    date_to: shiftedLocalISODate(0),
  };
}

function buildDefaultFixtureFilters(leagueId = DEFAULT_LEAGUE_ID) {
  const { minDate } = getFixtureDateRangeLimits();
  return {
    q: "",
    day_window: "this_week",
    league_id: String(leagueId),
    sort: "asc",
    upcoming_only: true,
    date_from: minDate,
    date_to: minDate,
  };
}
const EMPTY_SAVED_PREDICTIONS = {
  day: "",
  page: 1,
  page_size: 10,
  total: 0,
  total_pages: 1,
  items: [],
};
const EMPTY_TRAINING_MATCHES = {
  model_id: "",
  league_id: null,
  ingest_status: null,
  last_training_event_date: null,
  page: 1,
  page_size: 12,
  total: 0,
  total_pages: 1,
  rows_used: 0,
  items: [],
};
const EMPTY_MODEL_CATALOG = {
  page: 1,
  page_size: MODEL_LIST_PAGE_SIZE,
  total: 0,
  total_pages: 1,
  model_type: "all",
};
const DEFAULT_FEATURED_PLAYERS = {
  left: {
    key: "kenan",
    name: "Kenan Yildiz",
    subtitle: "Yukselen yildiz",
    image: "https://img.a.transfermarkt.technology/portrait/big/627228-1723922216.jpg?lm=1",
  },
  right: {
    key: "arda",
    name: "Arda Guler",
    subtitle: "Teknik oyun kurucu",
    image: "https://img.a.transfermarkt.technology/portrait/big/861410-1699472585.jpg?lm=1",
  },
};
const DEFAULT_ODDS_BANNER_SETTINGS = Object.freeze({
  banner_label: "Gunun Yapay Zeka Tahminleri",
  left_image_url: "",
  right_image_url: "",
  left_title: "",
  left_subtitle: "",
  right_title: "",
  right_subtitle: "",
  ai_home_team_name: "",
  ai_away_team_name: "",
  ai_kickoff_at: "",
  ai_odd_home: 2.08,
  ai_odd_draw: 3.12,
  ai_odd_away: 2.86,
  ai_score_home: null,
  ai_score_away: null,
  ai_insight: "",
  is_active: true,
});
const DEFAULT_PUBLIC_SLIDER_IMAGES = Object.freeze([
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1486286701208-1d58e9338013?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1543357480-c60d400e2ef9?auto=format&fit=crop&w=1600&q=80",
]);
const DEFAULT_MANUAL_ODDS_ROWS = Object.freeze([
  {
    id: "sample-1",
    home_team_name: "Fenerbahce",
    away_team_name: "Galatasaray",
    label: "Fenerbahce vs Galatasaray",
    home_team_logo: null,
    away_team_logo: null,
    home: "2.15",
    draw: "3.26",
    away: "2.88",
    model_score_home: 2,
    model_score_away: 1,
    score_text: "2-1",
  },
  {
    id: "sample-2",
    home_team_name: "Real Madrid",
    away_team_name: "Barcelona",
    label: "Real Madrid vs Barcelona",
    home_team_logo: null,
    away_team_logo: null,
    home: "1.94",
    draw: "3.08",
    away: "3.42",
    model_score_home: 2,
    model_score_away: 2,
    score_text: "2-2",
  },
  {
    id: "sample-3",
    home_team_name: "Besiktas",
    away_team_name: "Trabzonspor",
    label: "Besiktas vs Trabzonspor",
    home_team_logo: null,
    away_team_logo: null,
    home: "2.37",
    draw: "3.17",
    away: "2.64",
    model_score_home: 1,
    model_score_away: 1,
    score_text: "1-1",
  },
]);
const FEATURED_TEAM_PLAYER_FALLBACKS = [
  {
    keys: ["real madrid", "madrid"],
    player: {
      name: "Kylian Mbappe",
      subtitle: "Dunya yildizi",
      image: "https://img.a.transfermarkt.technology/portrait/big/342229-1682683695.jpg?lm=1",
    },
  },
  {
    keys: ["barcelona", "barca"],
    player: {
      name: "Luka Modric",
      subtitle: "Oyun akli",
      image: "https://img.a.transfermarkt.technology/portrait/big/27992-1687776160.jpg?lm=1",
    },
  },
  {
    keys: ["fenerbahce"],
    player: {
      name: "Cristiano Ronaldo",
      subtitle: "Bitirici profil",
      image: "https://img.a.transfermarkt.technology/portrait/big/8198-1694609670.jpg?lm=1",
    },
  },
  {
    keys: ["galatasaray"],
    player: {
      name: "Lionel Messi",
      subtitle: "Yildiz profil",
      image: "https://img.a.transfermarkt.technology/portrait/big/28003-1671435885.jpg?lm=1",
    },
  },
  {
    keys: ["besiktas"],
    player: {
      name: "Vinicius Junior",
      subtitle: "Kanat tehditi",
      image: "https://img.a.transfermarkt.technology/portrait/big/371998-1664869583.jpg?lm=1",
    },
  },
];

function clampProgress(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

function sourceStatusLabel(status) {
  if (status === "used_in_training") return "Egitimde kullanildi";
  if (status === "not_selected") return "Secili degil";
  if (status === "selected_but_missing_columns") return "Kolon yok";
  if (status === "selected_but_not_yet_engineered") return "Hazir degil";
  return status || "-";
}

function taskProgress(task) {
  if (task?.meta?.progress !== undefined && task?.meta?.progress !== null) {
    return clampProgress(task.meta.progress, 0);
  }
  if (task?.ready) {
    return task?.successful ? 100 : 0;
  }
  if (task?.state === "PENDING") return 5;
  if (task?.state === "STARTED") return 15;
  return 10;
}

function taskStage(task) {
  if (task?.meta?.stage) return String(task.meta.stage);
  if (task?.ready && task?.successful) return "Tamamlandi";
  if (task?.ready && !task?.successful) return "Basarisiz";
  return "Calisiyor";
}

function asPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("tr-TR");
}

function toDecimalOdds(probability, fallbackValue) {
  const prob = Number(probability);
  if (Number.isFinite(prob) && prob > 0) {
    return (1 / prob).toFixed(2);
  }
  return fallbackValue;
}

function normalizeTeamKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFallbackFeaturedPlayer(teamName, side = "left") {
  const normalized = normalizeTeamKey(teamName);
  const byTeam = FEATURED_TEAM_PLAYER_FALLBACKS.find((item) =>
    item.keys.some((key) => normalized.includes(normalizeTeamKey(key)))
  );
  if (byTeam) return byTeam.player;
  return DEFAULT_FEATURED_PLAYERS[side] || DEFAULT_FEATURED_PLAYERS.left;
}

function outcomeLabel(value) {
  if (value === "home_win") return "Ev";
  if (value === "away_win") return "Deplasman";
  if (value === "draw") return "Beraberlik";
  return "-";
}

function normalizeOddsBannerSettings(payload) {
  const raw = payload?.item || payload || {};
  const parseOdd = (value, fallback) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1.01) {
      return Number(parsed.toFixed(2));
    }
    return fallback;
  };
  const parseScore = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.trunc(parsed);
    }
    return null;
  };
  return {
    banner_label:
      String(raw.banner_label || DEFAULT_ODDS_BANNER_SETTINGS.banner_label).trim() || "Gunun Yapay Zeka Tahminleri",
    left_image_url: String(raw.left_image_url || "").trim(),
    right_image_url: String(raw.right_image_url || "").trim(),
    left_title: String(raw.left_title || "").trim(),
    left_subtitle: String(raw.left_subtitle || "").trim(),
    right_title: String(raw.right_title || "").trim(),
    right_subtitle: String(raw.right_subtitle || "").trim(),
    ai_home_team_name: String(raw.ai_home_team_name || "").trim(),
    ai_away_team_name: String(raw.ai_away_team_name || "").trim(),
    ai_kickoff_at: String(raw.ai_kickoff_at || "").trim(),
    ai_odd_home: parseOdd(raw.ai_odd_home, 2.08),
    ai_odd_draw: parseOdd(raw.ai_odd_draw, 3.12),
    ai_odd_away: parseOdd(raw.ai_odd_away, 2.86),
    ai_score_home: parseScore(raw.ai_score_home),
    ai_score_away: parseScore(raw.ai_score_away),
    ai_insight: String(raw.ai_insight || "").trim(),
    is_active: raw.is_active !== false,
  };
}

function toFixedOdds(value, fallback = "2.00") {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed.toFixed(2);
  }
  return fallback;
}

function parseOptionalScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed);
  }
  return null;
}

function scoreTextFromValues(homeScore, awayScore) {
  if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
    return `${homeScore}-${awayScore}`;
  }
  return "Skor bekleniyor";
}

function parseTopScorelineText(scoreText) {
  const parts = String(scoreText || "")
    .split("-")
    .map((part) => Number(String(part || "").trim()));
  if (parts.length !== 2) return { home: null, away: null };
  const [home, away] = parts;
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    return { home: null, away: null };
  }
  return { home: Math.trunc(home), away: Math.trunc(away) };
}

function mapShowcasePopularOddsRows(sectionsPayload) {
  const popularRows = sectionsPayload?.popular_odds?.items || [];
  if (!Array.isArray(popularRows) || !popularRows.length) {
    return [];
  }
  return popularRows
    .filter((row) => row && row.is_active !== false)
    .slice(0, 8)
    .map((row, index) => {
      const home = String(row?.home_team_name || "").trim() || "Home";
      const away = String(row?.away_team_name || "").trim() || "Away";
      return {
        id: row?.id != null ? String(row.id) : `showcase-popular-${index}`,
        fixture_id: row?.fixture_id != null ? Number(row.fixture_id) : null,
        home_team_name: home,
        away_team_name: away,
        home_team_logo: row?.home_team_logo || null,
        away_team_logo: row?.away_team_logo || null,
        label: `${home} vs ${away}`,
        home: toFixedOdds(row?.odd_home, "2.08"),
        draw: toFixedOdds(row?.odd_draw, "3.12"),
        away: toFixedOdds(row?.odd_away, "2.86"),
        model_score_home: parseOptionalScore(row?.model_score_home),
        model_score_away: parseOptionalScore(row?.model_score_away),
        score_text: scoreTextFromValues(parseOptionalScore(row?.model_score_home), parseOptionalScore(row?.model_score_away)),
      };
    });
}

function buildLastSimulationSnapshot(fixture, simulationResult) {
  const fallbackMatch = simulationResult?.match || {};
  const fixtureId = Number(fixture?.fixture_id ?? fallbackMatch?.fixture_id);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }

  const homeName = String(fixture?.home_team_name || fallbackMatch?.home_team_name || "").trim();
  const awayName = String(fixture?.away_team_name || fallbackMatch?.away_team_name || "").trim();
  if (!homeName || !awayName) {
    return null;
  }

  const homeOdd = Number(toDecimalOdds(simulationResult?.outcomes?.home_win, "2.08"));
  const drawOdd = Number(toDecimalOdds(simulationResult?.outcomes?.draw, "3.12"));
  const awayOdd = Number(toDecimalOdds(simulationResult?.outcomes?.away_win, "2.86"));
  const topScoreline = Array.isArray(simulationResult?.top_scorelines) ? simulationResult.top_scorelines[0] : null;
  const parsedScore = parseTopScorelineText(topScoreline?.score);

  return {
    fixture_id: fixtureId,
    home_team_name: homeName,
    away_team_name: awayName,
    home_team_logo: String(fixture?.home_team_logo || fallbackMatch?.home_team_logo || "").trim() || null,
    away_team_logo: String(fixture?.away_team_logo || fallbackMatch?.away_team_logo || "").trim() || null,
    kickoff_at: String(fixture?.starting_at || fallbackMatch?.starting_at || "").trim() || null,
    odd_home: Number.isFinite(homeOdd) && homeOdd > 0 ? Number(homeOdd.toFixed(2)) : 2.08,
    odd_draw: Number.isFinite(drawOdd) && drawOdd > 0 ? Number(drawOdd.toFixed(2)) : 3.12,
    odd_away: Number.isFinite(awayOdd) && awayOdd > 0 ? Number(awayOdd.toFixed(2)) : 2.86,
    model_score_home: parsedScore.home,
    model_score_away: parsedScore.away,
    created_at: new Date().toISOString(),
  };
}

export default function DashboardPage({ mode = "dashboard" }) {
  const isAdminRouteMode = mode === "models" || mode === "admin";
  const { askFromAction } = useChat();

  const [overview, setOverview] = useState(null);
  const [recentFeatures, setRecentFeatures] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [fixtureCatalog, setFixtureCatalog] = useState({
    page: 1,
    page_size: 25,
    total: 0,
    total_pages: 1,
    items: [],
  });
  const [fixturePage, setFixturePage] = useState(1);
  const [fixtureFilters, setFixtureFilters] = useState(() => buildDefaultFixtureFilters(DEFAULT_LEAGUE_ID));
  const [models, setModels] = useState([]);
  const [modelCatalog, setModelCatalog] = useState(EMPTY_MODEL_CATALOG);
  const [modelCatalogPage, setModelCatalogPage] = useState(1);
  const [modelCatalogFilter, setModelCatalogFilter] = useState("all");
  const [modelCatalogLeagueFilter, setModelCatalogLeagueFilter] = useState("all");
  const [modelSources, setModelSources] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [loadingMap, setLoadingMap] = useState({});
  const [operations, setOperations] = useState({});
  const [selectedLeagueId, setSelectedLeagueId] = useState(DEFAULT_LEAGUE_ID);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [publicSliderImages, setPublicSliderImages] = useState(DEFAULT_PUBLIC_SLIDER_IMAGES);
  const [showcaseSectionsPublic, setShowcaseSectionsPublic] = useState({});
  const [sliderImagesAdmin, setSliderImagesAdmin] = useState([]);
  const [oddsBannerSettings, setOddsBannerSettings] = useState(DEFAULT_ODDS_BANNER_SETTINGS);
  const [showPackages, setShowPackages] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState("");
  const [featuredTeamPlayers, setFeaturedTeamPlayers] = useState({
    left: null,
    right: null,
  });
  const [paymentForm, setPaymentForm] = useState({
    package_key: CREDIT_PACKAGES[0].key,
    chain: "solana",
    transaction_id: "",
    telegram_contact: "",
    note: "",
  });
  const [paymentNotices, setPaymentNotices] = useState([]);
  const [paymentStatusDrafts, setPaymentStatusDrafts] = useState({});
  const [managedUsers, setManagedUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    password: "",
    role: "user",
    credits: "100",
  });
  const [creditDrafts, setCreditDrafts] = useState({});
  const [passwordDrafts, setPasswordDrafts] = useState({});

  const [ingestForm, setIngestForm] = useState({
    start_date: "2025-08-01",
    end_date: "2026-02-08",
    league_id: String(DEFAULT_LEAGUE_ID),
  });
  const [historyTarget, setHistoryTarget] = useState("2000");
  const [fixtureId, setFixtureId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [simulation, setSimulation] = useState(null);
  const [aiCommentary, setAiCommentary] = useState("");
  const [aiProvider, setAiProvider] = useState("");
  const [aiProviderError, setAiProviderError] = useState("");
  const [aiOddsSummary, setAiOddsSummary] = useState(null);
  const [aiAnalysisTable, setAiAnalysisTable] = useState([]);
  const [modelForm, setModelForm] = useState({
    model_name: "",
    description: "",
    league_id: String(DEFAULT_LEAGUE_ID),
    limit: "",
    set_active: true,
    data_sources: ["team_form", "elo", "injuries", "lineup_strength", "weather", "referee", "market_odds"],
    training_mode: "latest",
    date_from: shiftedLocalISODate(0),
    date_to: shiftedLocalISODate(6),
  });
  const [trainingMatches, setTrainingMatches] = useState(EMPTY_TRAINING_MATCHES);
  const [trainingMatchesError, setTrainingMatchesError] = useState("");
  const [predictionNote, setPredictionNote] = useState("");
  const [savedPredictionsDay, setSavedPredictionsDay] = useState(new Date().toISOString().slice(0, 10));
  const [savedPredictions, setSavedPredictions] = useState(EMPTY_SAVED_PREDICTIONS);

  const isLoading = (key) => !!loadingMap[key];

  const setOperation = (key, patch) => {
    setOperations((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  };

  const clearOperation = (key, delayMs = 1800) => {
    window.setTimeout(() => {
      setOperations((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, delayMs);
  };

  const runOperation = async (key, config, fn) => {
    const options = {
      start: 10,
      stage: "Islem baslatildi",
      successStage: "Tamamlandi",
      clearMs: 1800,
      indeterminate: false,
      ...config,
    };

    setLoadingMap((prev) => ({ ...prev, [key]: true }));
    setOperation(key, {
      progress: clampProgress(options.start, 10),
      stage: options.stage,
      indeterminate: options.indeterminate,
      error: false,
    });

    const helpers = {
      setProgress: (progress, stage, indeterminate = false) => {
        setOperation(key, {
          progress: clampProgress(progress, options.start),
          stage: stage || options.stage,
          indeterminate,
        });
      },
    };

    try {
      const result = await fn(helpers);
      setOperation(key, { progress: 100, stage: options.successStage, indeterminate: false, error: false });
      return result;
    } catch (err) {
      setOperation(key, {
        progress: 100,
        stage: err?.message ? `Hata: ${err.message}` : "Hata olustu",
        indeterminate: false,
        error: true,
      });
      throw err;
    } finally {
      setLoadingMap((prev) => ({ ...prev, [key]: false }));
      clearOperation(key, options.clearMs);
    }
  };

  const operationFor = (...keys) => keys.map((key) => operations[key]).find(Boolean) || null;

  const selectedFixture = useMemo(() => {
    const allItems = [...(fixtureCatalog.items || []), ...fixtures];
    return allItems.find((item) => String(item.fixture_id) === String(fixtureId)) || null;
  }, [fixtureCatalog.items, fixtures, fixtureId]);

  const fixtureLookup = useMemo(() => {
    const byId = new Map();
    [...fixtures, ...(fixtureCatalog.items || [])].forEach((item) => {
      byId.set(String(item.fixture_id), item);
    });
    return byId;
  }, [fixtures, fixtureCatalog.items]);

  const selectedModel = useMemo(
    () => models.find((item) => String(item.model_id) === String(selectedModelId)) || null,
    [models, selectedModelId]
  );
  const selectedLeague = useMemo(
    () => LEAGUE_OPTIONS.find((league) => Number(league.id) === Number(selectedLeagueId)) || null,
    [selectedLeagueId]
  );
  const selectedLeagueLabel = selectedLeague?.label || `Lig ${selectedLeagueId}`;
  const isManager = currentUser?.role === "admin" || currentUser?.role === "superadmin";
  const fixtureDateRangeLimits = getFixtureDateRangeLimits();

  const topScorelines = useMemo(() => simulation?.top_scorelines || [], [simulation]);
  const firstGoalDist = useMemo(() => simulation?.first_goal_minute_distribution || [], [simulation]);
  const oddsHeadlineFixture = useMemo(() => {
    if (selectedFixture) return selectedFixture;
    if (fixtureCatalog.items?.length) return fixtureCatalog.items[0];
    if (fixtures.length) return fixtures[0];
    return null;
  }, [selectedFixture, fixtureCatalog.items, fixtures]);

  const featuredOddsRows = useMemo(() => {
    const manualRows = mapShowcasePopularOddsRows(showcaseSectionsPublic);
    if (manualRows.length) {
      return manualRows;
    }

    const upcoming = (fixtureCatalog.items || []).slice(0, 3);
    if (!upcoming.length) {
      return DEFAULT_MANUAL_ODDS_ROWS;
    }
    return upcoming.map((item, index) => {
      const seed = Math.abs(Number(item.fixture_id) || index + 1) % 9;
      return {
        id: String(item.fixture_id),
        fixture_id: item.fixture_id,
        home_team_id: item.home_team_id,
        away_team_id: item.away_team_id,
        home_team_name: item.home_team_name,
        away_team_name: item.away_team_name,
        home_team_logo: item.home_team_logo || null,
        away_team_logo: item.away_team_logo || null,
        label: `${item.home_team_name || "Home"} vs ${item.away_team_name || "Away"}`,
        home: (1.72 + seed * 0.07).toFixed(2),
        draw: (2.95 + (seed % 4) * 0.12).toFixed(2),
        away: (2.02 + (seed % 5) * 0.15).toFixed(2),
        model_score_home: null,
        model_score_away: null,
        score_text: "Skor bekleniyor",
      };
    });
  }, [fixtureCatalog.items, showcaseSectionsPublic]);

  const aiPredictionCenter = useMemo(() => {
    const fallbackHome = oddsHeadlineFixture?.home_team_name || "Ev Sahibi";
    const fallbackAway = oddsHeadlineFixture?.away_team_name || "Deplasman";
    const fallbackKickoff = oddsHeadlineFixture?.starting_at || "";
    const scoreHome = oddsBannerSettings?.ai_score_home;
    const scoreAway = oddsBannerSettings?.ai_score_away;
    const hasScore = Number.isFinite(scoreHome) && Number.isFinite(scoreAway);

    return {
      home_team_name: String(oddsBannerSettings?.ai_home_team_name || "").trim() || fallbackHome,
      away_team_name: String(oddsBannerSettings?.ai_away_team_name || "").trim() || fallbackAway,
      kickoff_at: String(oddsBannerSettings?.ai_kickoff_at || "").trim() || fallbackKickoff,
      odd_home: toFixedOdds(oddsBannerSettings?.ai_odd_home, "2.08"),
      odd_draw: toFixedOdds(oddsBannerSettings?.ai_odd_draw, "3.12"),
      odd_away: toFixedOdds(oddsBannerSettings?.ai_odd_away, "2.86"),
      score_text: hasScore ? `${scoreHome} - ${scoreAway}` : "Skor bekleniyor",
      insight: String(oddsBannerSettings?.ai_insight || "").trim(),
    };
  }, [oddsBannerSettings, oddsHeadlineFixture]);

  const featuredPlayers = useMemo(() => {
    const homeTeamName = String(oddsBannerSettings?.ai_home_team_name || "").trim() || oddsHeadlineFixture?.home_team_name || "";
    const awayTeamName = String(oddsBannerSettings?.ai_away_team_name || "").trim() || oddsHeadlineFixture?.away_team_name || "";
    const baseLeftPlayer = featuredTeamPlayers.left || pickFallbackFeaturedPlayer(homeTeamName, "left");
    const baseRightPlayer = featuredTeamPlayers.right || pickFallbackFeaturedPlayer(awayTeamName, "right");
    const customLeftImage = String(oddsBannerSettings?.left_image_url || "").trim();
    const customRightImage = String(oddsBannerSettings?.right_image_url || "").trim();
    const leftName = String(oddsBannerSettings?.left_title || "").trim();
    const leftSubtitle = String(oddsBannerSettings?.left_subtitle || "").trim();
    const rightName = String(oddsBannerSettings?.right_title || "").trim();
    const rightSubtitle = String(oddsBannerSettings?.right_subtitle || "").trim();

    return {
      left: {
        ...baseLeftPlayer,
        image: customLeftImage || baseLeftPlayer.image,
        name: leftName || baseLeftPlayer.name,
        subtitle: leftSubtitle || baseLeftPlayer.subtitle,
      },
      right: {
        ...baseRightPlayer,
        image: customRightImage || baseRightPlayer.image,
        name: rightName || baseRightPlayer.name,
        subtitle: rightSubtitle || baseRightPlayer.subtitle,
      },
    };
  }, [featuredTeamPlayers, oddsHeadlineFixture, oddsBannerSettings]);
  const PLAYER_SHOWCASE = featuredPlayers;

  const loadPublicSliderImages = async () => {
    try {
      const response = await fetch(`${API_BASE}/slider/public`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || `Request failed: ${response.status}`);
      }
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      const nextImages = rows
        .map((item) => {
          if (typeof item === "string") return item.trim();
          return String(item?.image_url || "").trim();
        })
        .filter(Boolean)
        .slice(0, 10);
      setPublicSliderImages(nextImages.length ? nextImages : DEFAULT_PUBLIC_SLIDER_IMAGES);
    } catch (err) {
      setPublicSliderImages(DEFAULT_PUBLIC_SLIDER_IMAGES);
    }
  };

  const loadShowcasePublic = async () => {
    try {
      const response = await fetch(`${API_BASE}/showcase/public`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || `Request failed: ${response.status}`);
      }
      setShowcaseSectionsPublic(payload?.sections || {});
    } catch (err) {
      setShowcaseSectionsPublic({});
    }
  };

  const loadCurrentUser = async () => {
    const profile = await apiRequest("/auth/me");
    setCurrentUser(profile || null);
    return profile;
  };

  const logout = async () => {
    try {
      await logoutCurrentSession();
    } catch (_err) {
      // Local logout still proceeds if backend revoke call fails.
    }
    clearAuthToken();
    setCurrentUser(null);
    setSliderImagesAdmin([]);
    setOddsBannerSettings(DEFAULT_ODDS_BANNER_SETTINGS);
    setManagedUsers([]);
    setTasks([]);
    setModels([]);
    setModelCatalog(EMPTY_MODEL_CATALOG);
    setModelCatalogPage(1);
    setModelCatalogFilter("all");
    setSimulation(null);
    setAiCommentary("");
    setAiProvider("");
    setAiProviderError("");
    setAiOddsSummary(null);
    setAiAnalysisTable([]);
    setError("");
    setShowPackages(false);
    setFeaturedTeamPlayers({ left: null, right: null });
  };

  const copyWalletAddress = async (key) => {
    const value = PAYMENT_WALLETS[key];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedWallet(key);
      window.setTimeout(() => setCopiedWallet(""), 1400);
    } catch (err) {
      setError("Cuzdan adresi kopyalanamadi.");
    }
  };

  const loadFeaturedPlayerForTeam = async (teamId, teamName, side) => {
    if (!teamId) return pickFallbackFeaturedPlayer(teamName, side);
    try {
      const payload = await apiRequest(`/admin/teams/featured-player?team_id=${Number(teamId)}`);
      const player = payload?.player || {};
      if (player?.image_path && player?.player_name) {
        return {
          name: player.player_name,
          subtitle: payload?.team_name || teamName || "Takimin one cikan oyuncusu",
          image: player.image_path,
        };
      }
    } catch (err) {
      // Silent fallback to static player cards when featured lookup is unavailable.
    }
    return pickFallbackFeaturedPlayer(teamName, side);
  };

  const loadSliderImages = async (silent = false) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      setSliderImagesAdmin([]);
      return;
    }

    const endpoint = "/admin/slider-images";
    const applyRows = (payload) => {
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      const urls = rows
        .map((row) => String(row?.image_url || "").trim())
        .filter(Boolean)
        .slice(0, 10);
      setSliderImagesAdmin(urls);
    };

    if (silent) {
      try {
        const payload = await apiRequest(endpoint);
        applyRows(payload);
      } catch (err) {
        setSliderImagesAdmin([]);
      }
      return;
    }

    try {
      const payload = await runOperation(
        "slider-images-load",
        {
          start: 12,
          stage: "Slider gorselleri yukleniyor",
          successStage: "Slider gorselleri guncel",
          clearMs: 1000,
        },
        async ({ setProgress }) => {
          const response = await apiRequest(endpoint);
          setProgress(82, "Slider listesi hazirlaniyor");
          return response;
        }
      );
      applyRows(payload);
      setError("");
    } catch (err) {
      setError(err.message || "Slider gorselleri yuklenemedi.");
    }
  };

  const saveSliderImages = async (images = []) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      setError("Bu islem sadece superadmin icindir.");
      return false;
    }

    const normalized = (Array.isArray(images) ? images : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 10);
    const rows = normalized.map((imageUrl, index) => ({
      image_url: imageUrl,
      display_order: index,
      is_active: true,
    }));

    try {
      const payload = await runOperation(
        "slider-images-save",
        {
          start: 14,
          stage: "Slider gorselleri kaydediliyor",
          successStage: "Slider gorselleri kaydedildi",
          clearMs: 1200,
        },
        async ({ setProgress }) => {
          const response = await apiRequest("/admin/slider-images", {
            method: "PUT",
            body: JSON.stringify({ rows }),
          });
          setProgress(86, "Slider listesi yenileniyor");
          return response;
        }
      );
      const resultRows = Array.isArray(payload?.items) ? payload.items : [];
      const urls = resultRows
        .map((row) => String(row?.image_url || "").trim())
        .filter(Boolean)
        .slice(0, 10);
      setSliderImagesAdmin(urls);
      setError("");
      return true;
    } catch (err) {
      setError(err.message || "Slider gorselleri kaydedilemedi.");
      return false;
    }
  };

  const loadOddsBannerSettings = async (silent = true) => {
    if (!currentUser) {
      setOddsBannerSettings(DEFAULT_ODDS_BANNER_SETTINGS);
      return;
    }

    const endpoint = "/admin/odds-banner-settings";
    const applyItem = (payload) => {
      setOddsBannerSettings(normalizeOddsBannerSettings(payload));
    };

    if (silent) {
      try {
        const payload = await apiRequest(endpoint);
        applyItem(payload);
      } catch (err) {
        setOddsBannerSettings(DEFAULT_ODDS_BANNER_SETTINGS);
      }
      return;
    }

    try {
      const payload = await runOperation(
        "odds-banner-settings-load",
        {
          start: 12,
          stage: "Iddia oranlar ayari yukleniyor",
          successStage: "Iddia oranlar ayari guncel",
          clearMs: 1000,
        },
        async ({ setProgress }) => {
          const response = await apiRequest(endpoint);
          setProgress(80, "Iddia oranlar alani hazirlaniyor");
          return response;
        }
      );
      applyItem(payload);
      setError("");
    } catch (err) {
      setError(err.message || "Iddia oranlar ayari okunamadi.");
    }
  };

  const loadPaymentNotices = async (silent = false) => {
    if (!isManager) return;
    const endpoint = "/admin/payments/notices?limit=200";
    const applyRows = (payload) => setPaymentNotices(payload?.items || []);

    if (silent) {
      try {
        const payload = await apiRequest(endpoint);
        applyRows(payload);
      } catch (err) {
        setPaymentNotices([]);
      }
      return;
    }

    try {
      const payload = await runOperation(
        "payments-load",
        {
          start: 16,
          stage: "Odeme bildirimleri yukleniyor",
          successStage: "Odeme bildirimleri guncel",
          clearMs: 1200,
        },
        async ({ setProgress }) => {
          const response = await apiRequest(endpoint);
          setProgress(85, "Bildirim listesi hazirlaniyor");
          return response;
        }
      );
      applyRows(payload);
      setError("");
    } catch (err) {
      setError(err.message || "Odeme bildirimleri okunamadi.");
    }
  };

  const submitPaymentNotice = async () => {
    const selectedPackage = CREDIT_PACKAGES.find((item) => item.key === paymentForm.package_key) || CREDIT_PACKAGES[0];
    const transactionId = (paymentForm.transaction_id || "").trim();
    if (!transactionId) {
      setError("Lutfen transaction id gir.");
      return;
    }

    try {
      await runOperation(
        "payments-notify",
        {
          start: 14,
          stage: "Odeme bildirimi gonderiliyor",
          successStage: "Bildirim admin ekibine iletildi",
          clearMs: 1400,
        },
        async () => {
          await apiRequest("/admin/payments/notify", {
            method: "POST",
            body: JSON.stringify({
              package_key: selectedPackage.key,
              package_title: selectedPackage.title,
              chain: paymentForm.chain,
              amount_tl: selectedPackage.price_tl,
              transaction_id: transactionId,
              telegram_contact: paymentForm.telegram_contact || null,
              note: paymentForm.note || null,
            }),
          });
        }
      );
      setPaymentForm((prev) => ({ ...prev, transaction_id: "", note: "" }));
      setError("");
    } catch (err) {
      setError(err.message || "Odeme bildirimi gonderilemedi.");
    }
  };

  const setPaymentNoticeStatus = async (noticeId, nextStatus) => {
    try {
      await runOperation(
        `payments-status-${noticeId}`,
        {
          start: 12,
          stage: "Bildirim durumu guncelleniyor",
          successStage: "Durum guncellendi",
          clearMs: 1000,
        },
        async () => {
          const response = await apiRequest(`/admin/payments/notices/${noticeId}/status`, {
            method: "POST",
            body: JSON.stringify({
              status: nextStatus,
              admin_note: paymentStatusDrafts[noticeId] || null,
            }),
          });
          setPaymentNotices((prev) =>
            prev.map((row) => (Number(row.id) === Number(noticeId) ? response.notice || row : row))
          );
          setPaymentStatusDrafts((prev) => ({ ...prev, [noticeId]: "" }));
        }
      );
      setError("");
    } catch (err) {
      setError(err.message || "Bildirim durumu guncellenemedi.");
    }
  };

  const deletePaymentNotice = async (noticeId) => {
    const target = (paymentNotices || []).find((row) => Number(row.id) === Number(noticeId));
    if (!target) {
      setError("Odeme bildirimi bulunamadi.");
      return;
    }
    if (String(target.status || "").trim().toLowerCase() !== "rejected") {
      setError("Sadece reddedilen odeme bildirimleri silinebilir.");
      return;
    }

    if (typeof window !== "undefined") {
      const approved = window.confirm("Bu reddedilen odeme bildirimini kalici olarak silmek istiyor musun?");
      if (!approved) return;
    }

    try {
      await runOperation(
        `payments-delete-${noticeId}`,
        {
          start: 14,
          stage: "Odeme bildirimi siliniyor",
          successStage: "Reddedilen bildirim silindi",
          clearMs: 1100,
        },
        async () => {
          await apiRequest(`/admin/payments/notices/${noticeId}`, {
            method: "DELETE",
          });
          setPaymentNotices((prev) => prev.filter((row) => Number(row.id) !== Number(noticeId)));
          setPaymentStatusDrafts((prev) => {
            const next = { ...prev };
            delete next[noticeId];
            return next;
          });
        }
      );
      setError("");
    } catch (err) {
      setError(err.message || "Odeme bildirimi silinemedi.");
    }
  };

  const loadManagedUsers = async (silent = false) => {
    if (!isManager) return;
    const endpoint = "/admin/users?limit=500";

    const applyItems = (payload) => {
      setManagedUsers(payload?.items || []);
    };

    if (silent) {
      try {
        const payload = await apiRequest(endpoint);
        applyItems(payload);
      } catch (err) {
        setManagedUsers([]);
      }
      return;
    }

    try {
      const payload = await runOperation(
        "users-load",
        {
          start: 15,
          stage: "Kullanicilar yukleniyor",
          successStage: "Kullanici listesi guncel",
          clearMs: 1200,
        },
        async ({ setProgress }) => {
          const response = await apiRequest(endpoint);
          setProgress(82, "Kullanici listesi hazirlaniyor");
          return response;
        }
      );
      applyItems(payload);
      setError("");
    } catch (err) {
      setError(err.message || "Kullanici listesi okunamadi.");
    }
  };

  const createManagedUser = async () => {
    const email = (newUserForm.email || "").trim().toLowerCase();
    const password = newUserForm.password || "";
    const role = (newUserForm.role || "user").trim();
    const creditsText = (newUserForm.credits || "").trim();

    if (!email) {
      setError("Yeni kullanici icin email gerekli.");
      return;
    }
    if (password.length < 6) {
      setError("Yeni kullanici sifresi en az 6 karakter olmali.");
      return;
    }

    let creditsValue = null;
    if (creditsText !== "") {
      const parsedCredits = Number(creditsText);
      if (!Number.isFinite(parsedCredits) || parsedCredits < 0) {
        setError("Baslangic kredi 0 veya daha buyuk olmali.");
        return;
      }
      creditsValue = Math.floor(parsedCredits);
    }

    try {
      await runOperation(
        "users-create",
        {
          start: 12,
          stage: "Kullanici olusturuluyor",
          successStage: "Kullanici olusturuldu",
          clearMs: 1500,
        },
        async ({ setProgress }) => {
          await apiRequest("/admin/users", {
            method: "POST",
            body: JSON.stringify({
              email,
              password,
              role,
              credits: creditsValue,
            }),
          });
          setProgress(74, "Kullanici listesi yenileniyor");
          await loadManagedUsers(true);
        }
      );
      setNewUserForm({
        email: "",
        password: "",
        role: "user",
        credits: "100",
      });
      setError("");
    } catch (err) {
      setError(err.message || "Kullanici olusturulamadi.");
    }
  };

  const updateManagedUserCredits = async (userId) => {
    const deltaRaw = creditDrafts[userId];
    const delta = Number(deltaRaw);
    if (!Number.isFinite(delta) || !delta) {
      setError("Kredi degisikligi icin 0 disi bir deger gir.");
      return;
    }

    try {
      await runOperation(
        `users-credits-${userId}`,
        {
          start: 10,
          stage: "Kredi guncelleniyor",
          successStage: "Kredi guncellendi",
          clearMs: 1000,
        },
        async ({ setProgress }) => {
          const payload = await apiRequest(`/admin/users/${userId}/credits`, {
            method: "POST",
            body: JSON.stringify({
              delta: Math.trunc(delta),
              reason: "panel_manual_adjustment",
            }),
          });
          setProgress(80, "Kullanici listesi guncelleniyor");
          setManagedUsers((prev) =>
            prev.map((user) => (Number(user.id) === Number(userId) ? payload.user || user : user))
          );
          setCurrentUser((prev) => {
            if (!prev || Number(prev.id) !== Number(userId)) return prev;
            return payload.user || prev;
          });
        }
      );
      setCreditDrafts((prev) => ({ ...prev, [userId]: "" }));
      setError("");
    } catch (err) {
      setError(err.message || "Kredi guncellenemedi.");
    }
  };

  const setManagedUserPassword = async (userId) => {
    const nextPassword = passwordDrafts[userId] || "";
    if (nextPassword.length < 6) {
      setError("Sifre en az 6 karakter olmali.");
      return;
    }

    try {
      await runOperation(
        `users-password-${userId}`,
        {
          start: 10,
          stage: "Sifre guncelleniyor",
          successStage: "Sifre guncellendi",
          clearMs: 1000,
        },
        async () => {
          await apiRequest(`/admin/users/${userId}/password`, {
            method: "POST",
            body: JSON.stringify({ new_password: nextPassword }),
          });
        }
      );
      setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
      setError("");
    } catch (err) {
      setError(err.message || "Sifre guncellenemedi.");
    }
  };

  const requestModelsCatalog = async ({
    page = modelCatalogPage,
    modelFilter = modelCatalogFilter,
    leagueId = mode === "models" ? modelCatalogLeagueFilter : selectedLeagueId,
  } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeFilter = ["all", "ready", "mine"].includes(String(modelFilter || "").toLowerCase())
      ? String(modelFilter).toLowerCase()
      : "all";
    const normalizedLeagueFilter = String(leagueId ?? "").trim() || (mode === "models" ? "all" : String(selectedLeagueId));

    if (mode === "models") {
      const payload = await fetchAllModels(apiRequest);
      const fetchedItems = Array.isArray(payload?.items) ? payload.items : [];
      let filteredItems = fetchedItems.filter((item) => isVisibleForCurrentUser(item, currentUser));
      filteredItems = filterByLeague(filteredItems, normalizedLeagueFilter);
      if (safeFilter === "ready") {
        filteredItems = filteredItems.filter((item) => resolveModelScope(item) === "ready");
      } else if (safeFilter === "mine") {
        filteredItems = filteredItems.filter((item) => Boolean(item?.is_owned_by_me));
      }
      const activeModelId = String(payload?.active_model_id || "").trim();
      const sortedItems = sortVisibleModels(filteredItems, activeModelId);
      const total = sortedItems.length;
      const pageSize = MODEL_LIST_PAGE_SIZE;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const nextPage = Math.min(Math.max(1, safePage), totalPages);
      const startIndex = (nextPage - 1) * pageSize;
      const modelItems = sortedItems.slice(startIndex, startIndex + pageSize);
      const catalogMeta = {
        page: nextPage,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        model_type: safeFilter,
      };

      setModels(modelItems);
      setModelCatalog(catalogMeta);
      setModelCatalogPage(nextPage);
      setModelCatalogFilter(safeFilter);
      setModelCatalogLeagueFilter(String(normalizedLeagueFilter || "all"));

      const hasActiveInPage = modelItems.some((item) => String(item.model_id) === activeModelId);
      const preferredModelId = hasActiveInPage ? activeModelId : modelItems[0]?.model_id || "";
      setSelectedModelId((prev) => {
        const previousExists = modelItems.some((item) => String(item.model_id) === String(prev));
        if (prev && previousExists) return prev;
        return String(preferredModelId || "");
      });

      return {
        ...payload,
        items: modelItems,
        model_type: safeFilter,
        page: nextPage,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      };
    }

    const params = new URLSearchParams();
    params.set("page", String(safePage));
    params.set("page_size", String(MODEL_LIST_PAGE_SIZE));
    params.set("model_type", safeFilter);
    if (normalizedLeagueFilter) {
      params.set("league_id", String(normalizedLeagueFilter));
    }

    const payload = await apiRequest(`/admin/models?${params.toString()}`);
    const modelItems = Array.isArray(payload?.items) ? payload.items : [];
    const nextPage = Math.max(1, Number(payload?.page) || safePage);
    const nextFilter = String(payload?.model_type || safeFilter);
    const catalogMeta = {
      page: nextPage,
      page_size: Number(payload?.page_size) || MODEL_LIST_PAGE_SIZE,
      total: Number(payload?.total) || 0,
      total_pages: Math.max(1, Number(payload?.total_pages) || 1),
      model_type: nextFilter,
    };

    setModels(modelItems);
    setModelCatalog(catalogMeta);
    setModelCatalogPage(nextPage);
    setModelCatalogFilter(nextFilter);

    const preferredModelId = payload?.active_model_id || modelItems[0]?.model_id || "";
    setSelectedModelId((prev) => {
      const previousExists = modelItems.some((item) => String(item.model_id) === String(prev));
      if (prev && previousExists) return prev;
      return String(preferredModelId || "");
    });

    return payload;
  };

  const loadModelsCatalog = async ({
    page = modelCatalogPage,
    modelFilter = modelCatalogFilter,
    leagueFilter = mode === "models" ? modelCatalogLeagueFilter : selectedLeagueId,
    opKey = "models-load",
    silent = false,
  } = {}) => {
    if (silent) {
      try {
        await requestModelsCatalog({ page, modelFilter, leagueId: leagueFilter });
      } catch (err) {
        setModels([]);
        setModelCatalog((prev) => ({ ...prev, page, model_type: modelFilter }));
      }
      return;
    }

    try {
      await runOperation(
        opKey,
        {
          start: 12,
          stage: "Model katalogu yukleniyor",
          successStage: "Model katalogu guncel",
          clearMs: 1000,
        },
        async ({ setProgress }) => {
          const payload = await requestModelsCatalog({ page, modelFilter, leagueId: leagueFilter });
          setProgress(85, `Toplam ${Number(payload?.total || 0)} model hazirlandi`);
        }
      );
      setError("");
    } catch (err) {
      setError(err.message || "Model katalogu yuklenemedi.");
    }
  };

  const fetchDashboard = async (setProgress) => {
    setProgress(15, "Temel panel verileri cekiliyor");
    const [overviewData, recentData, sourceData] = await Promise.all([
      apiRequest("/admin/overview"),
      apiRequest("/admin/features/recent?limit=12"),
      apiRequest("/admin/models/sources"),
    ]);

    setProgress(72, "Temel panel verileri isleniyor");

    setOverview(overviewData);
    setRecentFeatures(recentData.items || []);
    setModelSources(sourceData.items || []);

    await requestModelsCatalog({
      page: 1,
      modelFilter: modelCatalogFilter,
      leagueId: mode === "models" ? modelCatalogLeagueFilter : selectedLeagueId,
    });
    setProgress(88, "Model katalogu guncel");
  };

  const loadOverview = async (opKey = "overview-refresh") => {
    try {
      await runOperation(
        opKey,
        {
          start: 8,
          stage: "Panel yukleniyor",
          successStage: "Panel guncel",
        },
        async ({ setProgress }) => {
          await fetchDashboard(setProgress);
        }
      );
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const requestFixtureCatalog = async (_pageToLoad, filters, setProgress) => {
    const { date_from, date_to } = resolveFixtureDateRange(filters);
    const leagueFilter = String(filters?.league_id || "").trim();
    const safePage = 1;

    const params = new URLSearchParams();
    params.set("page", String(safePage));
    params.set("page_size", "25");
    params.set("sort", filters.sort || "asc");
    if (leagueFilter && leagueFilter !== "all") {
      params.set("league_id", leagueFilter);
    }
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    if (date_from) params.set("date_from", date_from);
    if (date_to) params.set("date_to", date_to);
    params.set("upcoming_only", "true");

    setProgress(35, "Mac listesi cekiliyor");
    const payload = await apiRequest(`/admin/fixtures/paged?${params.toString()}`);
    setProgress(82, "Mac listesi isleniyor");

    setFixtureCatalog(payload);
    setFixtures(payload.items || []);
    setFixturePage(safePage);
    setFixtureId((prev) => {
      const fixtureIdSet = new Set((payload.items || []).map((item) => String(item.fixture_id)));
      if (prev && fixtureIdSet.has(String(prev))) return prev;
      return payload.items?.[0] ? String(payload.items[0].fixture_id) : "";
    });
  };

  const loadFixtureCatalog = async ({
    opKey = "fixtures-load",
    pageToLoad = fixturePage,
    filters = fixtureFilters,
    successStage = "Mac listesi guncel",
  } = {}) => {
    try {
      await runOperation(
        opKey,
        {
          start: 10,
          stage: "Mac listesi yukleniyor",
          successStage,
        },
        async ({ setProgress }) => {
          await requestFixtureCatalog(pageToLoad, filters, setProgress);
        }
      );
      setError("");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const applyFixtureFilters = async () => {
    await loadFixtureCatalog({
      opKey: "fixtures-filter",
      pageToLoad: 1,
      filters: fixtureFilters,
      successStage: "Filtreli mac listesi hazir",
    });
  };

  const resetFixtureFilters = async () => {
    const next = buildDefaultFixtureFilters(selectedLeagueId);
    setFixtureFilters(next);
    await loadFixtureCatalog({
      opKey: "fixtures-filter-reset",
      pageToLoad: 1,
      filters: next,
      successStage: "Filtreler sifirlandi",
    });
  };

  const queueTask = async (path, payload = {}, opKey = "task-enqueue", stage = "Task kuyruga ekleniyor") => {
    try {
      const task = await runOperation(
        opKey,
        {
          start: 15,
          stage,
          successStage: "Task kuyruga alindi",
        },
        async ({ setProgress }) => {
          const created = await apiRequest(path, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          setProgress(85, "Task kimligi alindi");
          return created;
        }
      );
      let taskKind = null;
      if (path === "/admin/tasks/train") {
        taskKind = "model_training";
      } else if (path === "/admin/tasks/models-reset-and-reseed-pro") {
        taskKind = "models_reset_reseed";
      }
      const queuedTask = taskKind ? { ...task, client_task_kind: taskKind } : task;

      setTasks((prev) => [queuedTask, ...prev].slice(0, 20));
      if (typeof queuedTask?.credits_remaining === "number") {
        setCurrentUser((prev) => (prev ? { ...prev, credits: queuedTask.credits_remaining } : prev));
        if (queuedTask.credits_remaining <= 0) {
          setShowPackages(true);
        }
      }
      setError("");
      return queuedTask;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const refreshTask = async (taskId, options = { silent: false }) => {
    const silent = !!options?.silent;
    const opKey = `task-refresh-${taskId}`;

    try {
      const task = silent
        ? await apiRequest(`/admin/tasks/${taskId}`)
        : await runOperation(
            opKey,
            {
              start: 20,
              stage: "Task durumu yenileniyor",
              successStage: "Task durumu guncel",
              clearMs: 1000,
            },
            async ({ setProgress }) => {
              const data = await apiRequest(`/admin/tasks/${taskId}`);
              setProgress(80, "Task cevabi alindi");
              return data;
            }
          );

      setTasks((prev) => {
        const existing = prev.find((item) => item.task_id === taskId);
        const mergedTask =
          existing?.client_task_kind && !task?.client_task_kind
            ? { ...task, client_task_kind: existing.client_task_kind }
            : task;
        if (!existing) return [mergedTask, ...prev].slice(0, 20);
        return prev.map((item) => (item.task_id === taskId ? mergedTask : item));
      });
    } catch (err) {
      if (!silent) {
        setError(err.message);
      }
    }
  };

  const runSimulation = async () => {
    if (!fixtureId) {
      setError("Lutfen once bir mac secin.");
      return;
    }
    if (Number(currentUser?.credits || 0) < SIMULATION_CREDIT_COST) {
      setError(
        "Krediniz tükendi. Lütfen Token Satın Al sayfasından kredi satın alarak işlemi tekrar deneyin."
      );
      setShowPackages(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    try {
      const data = await runOperation(
        "simulate",
        {
          start: 12,
          stage: "Mac verisi aliniyor",
          successStage: "Simulasyon tamamlandi",
          indeterminate: true,
          clearMs: 2200,
        },
        async ({ setProgress }) => {
          const params = new URLSearchParams();
          params.set("fixture_id", String(fixtureId));

          setProgress(45, "Monte Carlo simulasyonu calisiyor", true);
          const response = await apiRequest(`/simulate?${params.toString()}`);
          setProgress(85, "Simulasyon sonucu isleniyor");
          return response;
        }
      );

      setSimulation(data);
      setAiCommentary("");
      setAiProvider("");
      setAiProviderError("");
      setAiOddsSummary(null);
      setAiAnalysisTable([]);
      if (typeof window !== "undefined") {
        const snapshot = buildLastSimulationSnapshot(
          selectedFixture || fixtureLookup.get(String(fixtureId)),
          data
        );
        if (snapshot) {
          try {
            window.localStorage.setItem(LAST_SIMULATION_STORAGE_KEY, JSON.stringify(snapshot));
            window.dispatchEvent(new Event("football-ai-last-simulation-updated"));
          } catch (_err) {
            // Storage write failures should not block simulation flow.
          }
        }
      }
      if (typeof data?.credits_remaining === "number") {
        setCurrentUser((prev) => (prev ? { ...prev, credits: data.credits_remaining } : prev));
        if (data.credits_remaining <= 0) {
          setShowPackages(true);
        }
      }
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const runAiCommentary = async () => {
    if (!fixtureId) {
      setError("Lutfen once bir mac secin.");
      return { ok: false, reason: "missing_fixture" };
    }
    if (Number(currentUser?.credits || 0) < AI_COMMENTARY_CREDIT_COST) {
      setError(
        "Krediniz tükendi. Lütfen Token Satın Al sayfasından kredi satın alarak işlemi tekrar deneyin."
      );
      setShowPackages(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return { ok: false, reason: "no_credits" };
    }

    try {
      const data = await runOperation(
        "ai-commentary",
        {
          start: 10,
          stage: "AI analiz istegi gonderiliyor",
          successStage: "AI analiz tamamlandi",
          indeterminate: true,
          clearMs: 2600,
        },
        async ({ setProgress }) => {
          setProgress(35, "Model olasiliklari ve oranlar toplaniyor", true);
          const fixtureInfo = selectedFixture || fixtureLookup.get(String(fixtureId)) || null;
          const response = await askFromAction({
            source: "manual",
            fixture_id: Number(fixtureId),
            home_team_name: fixtureInfo?.home_team_name || null,
            away_team_name: fixtureInfo?.away_team_name || null,
            match_label:
              fixtureInfo?.match_label ||
              [fixtureInfo?.home_team_name, fixtureInfo?.away_team_name].filter(Boolean).join(" - ") ||
              null,
            question: "Bu maci detayli analiz et ve olasi senaryolari acikla.",
            language: "tr",
          });
          if (!response?.ok) {
            throw new Error(response?.error || "AI yorumu alinamadi.");
          }
          setProgress(88, "AI cikti tablosu hazirlaniyor");
          return response.data;
        }
      );

      const insight = data?.insight || {};
      const commentaryText = String(insight.commentary || data?.assistant_message?.content_markdown || "").trim();
      setAiCommentary(commentaryText);
      setAiProvider(insight.provider || "");
      setAiProviderError(insight.provider_error || "");
      setAiOddsSummary(insight.odds_summary || null);
      setAiAnalysisTable(Array.isArray(insight.analysis_table) ? insight.analysis_table : []);
      if (typeof data?.credits_remaining === "number") {
        setCurrentUser((prev) => (prev ? { ...prev, credits: data.credits_remaining } : prev));
        if (data.credits_remaining <= 0) {
          setShowPackages(true);
        }
      }
      setError("");
      return { ok: true, data };
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("yetersiz kredi")) {
        setShowPackages(true);
        setError(
          "Krediniz tükendi. Lütfen Token Satın Al sayfasından kredi satın alarak işlemi tekrar deneyin."
        );
        return { ok: false, reason: "no_credits", error: err.message };
      }
      setError(err.message || "AI yorumu alinamadi.");
      return { ok: false, reason: "error", error: err.message || "AI yorumu alinamadi." };
    }
  };

  const toggleModelSource = (key) => {
    setModelForm((prev) => {
      const has = prev.data_sources.includes(key);
      return {
        ...prev,
        data_sources: has ? prev.data_sources.filter((item) => item !== key) : [...prev.data_sources, key],
      };
    });
  };

  const queueModelTraining = async () => {
    if (Number(currentUser?.credits || 0) < MODEL_TRAINING_CREDIT_COST) {
      setError(
        "Krediniz tükendi. Lütfen Token Satın Al sayfasından kredi satın alarak işlemi tekrar deneyin."
      );
      setShowPackages(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const trainingMode = String(modelForm.training_mode || "standard").trim().toLowerCase();
    if (!["standard", "latest", "date_range"].includes(trainingMode)) {
      setError("Egitim modu gecersiz.");
      return;
    }
    const parsedLimit = modelForm.limit ? Number(modelForm.limit) : null;
    if (trainingMode !== "date_range" && parsedLimit !== null && (!Number.isFinite(parsedLimit) || parsedLimit < 10)) {
      setError("Egitim mac sayisi en az 10 olmalidir.");
      return;
    }
    const effectiveLimit = trainingMode === "date_range" ? null : parsedLimit;

    let dateFrom = null;
    let dateTo = null;
    if (trainingMode === "date_range") {
      dateFrom = String(modelForm.date_from || "").trim();
      dateTo = String(modelForm.date_to || "").trim();
      if (!dateFrom || !dateTo) {
        setError("Tarih araligiyla egitim icin baslangic ve bitis tarihi zorunludur.");
        return;
      }
      if (dateTo < dateFrom) {
        setError("Bitis tarihi baslangic tarihinden kucuk olamaz.");
        return;
      }
    }

    const payload = {
      model_name: modelForm.model_name || null,
      description: modelForm.description || null,
      league_id: modelForm.league_id ? Number(modelForm.league_id) : Number(selectedLeagueId),
      limit: effectiveLimit,
      set_active: !!modelForm.set_active,
      data_sources: modelForm.data_sources,
      training_mode: trainingMode,
      date_from: dateFrom,
      date_to: dateTo,
    };

    await queueTask("/admin/tasks/train", payload, "task-train-model", "Model egitim taski kuyruga aliniyor");
  };

  const loadTrainingMatches = async (
    modelId = selectedModelId,
    page = 1,
    options = { opKey: "training-matches-load", silent: false }
  ) => {
    const opKey = options.opKey || "training-matches-load";
    const silent = !!options.silent;
    if (!modelId) {
      setTrainingMatches(EMPTY_TRAINING_MATCHES);
      return;
    }

    const endpoint = `/admin/models/${modelId}/training-matches?page=${page}&page_size=12`;
    const applyPayload = (payload) => {
      setTrainingMatches(payload || { ...EMPTY_TRAINING_MATCHES, model_id: modelId });
      setTrainingMatchesError("");
    };

    if (silent) {
      try {
        const payload = await apiRequest(endpoint);
        applyPayload(payload);
      } catch (err) {
        setTrainingMatches({ ...EMPTY_TRAINING_MATCHES, model_id: modelId });
        setTrainingMatchesError(err.message || "Egitim maclari okunamadi.");
      }
      return;
    }

    try {
      const payload = await runOperation(
        opKey,
        {
          start: 12,
          stage: "Egitimde kullanilan maclar yukleniyor",
          successStage: "Egitim maclari guncel",
          clearMs: 1200,
        },
        async ({ setProgress }) => {
          const response = await apiRequest(endpoint);
          setProgress(80, "Tablo hazirlaniyor");
          return response;
        }
      );
      applyPayload(payload);
      setError("");
    } catch (err) {
      setTrainingMatches({ ...EMPTY_TRAINING_MATCHES, model_id: modelId });
      setTrainingMatchesError(err.message || "Egitim maclari okunamadi.");
    }
  };

  const loadDailyPredictions = async ({
    day = savedPredictionsDay,
    page = 1,
    autoRefreshResults = false,
    opKey = "predictions-load",
    silent = false,
  } = {}) => {
    const params = new URLSearchParams();
    params.set("day", day);
    params.set("page", String(page));
    params.set("page_size", "10");
    params.set("league_id", String(selectedLeagueId));
    if (autoRefreshResults) params.set("auto_refresh_results", "true");
    const endpoint = `/admin/predictions/daily?${params.toString()}`;

    const applyPayload = (payload) => {
      setSavedPredictions(payload || EMPTY_SAVED_PREDICTIONS);
      setSavedPredictionsDay(day);
    };

    if (silent) {
      try {
        const payload = await apiRequest(endpoint);
        applyPayload(payload);
      } catch (err) {
        setSavedPredictions(EMPTY_SAVED_PREDICTIONS);
      }
      return;
    }

    try {
      const payload = await runOperation(
        opKey,
        {
          start: 10,
          stage: autoRefreshResults ? "Mac sonuclari kontrol ediliyor" : "Kaydedilen tahminler yukleniyor",
          successStage: "Tahmin listesi guncel",
          clearMs: 1200,
        },
        async ({ setProgress }) => {
          const response = await apiRequest(endpoint);
          setProgress(85, "Gunluk tahmin listesi hazir");
          return response;
        }
      );
      applyPayload(payload);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const saveCurrentPrediction = async () => {
    if (!fixtureId) {
      setError("Kaydetmeden once bir mac sec.");
      return;
    }

    const aiPayload =
      aiCommentary || aiAnalysisTable.length || aiOddsSummary
        ? {
            commentary: aiCommentary || null,
            provider: aiProvider || null,
            provider_error: aiProviderError || null,
            odds_summary: aiOddsSummary || null,
            analysis_table: aiAnalysisTable || [],
          }
        : null;
    const simulationModelId = String(simulation?.model?.model_id || "").trim() || null;

    try {
      await runOperation(
        "prediction-save",
        {
          start: 12,
          stage: "Tahmin kaydi olusturuluyor",
          successStage: "Tahmin kaydedildi",
          clearMs: 1600,
        },
        async ({ setProgress }) => {
          await apiRequest("/admin/predictions/save", {
            method: "POST",
            body: JSON.stringify({
              fixture_id: Number(fixtureId),
              model_id: simulationModelId,
              language: "tr",
              note: predictionNote || null,
              simulation: simulation || null,
              ai_payload: aiPayload,
              include_ai_if_missing: false,
            }),
          });
          setProgress(72, "Gunluk liste yenileniyor");
          await loadDailyPredictions({
            day: savedPredictionsDay,
            page: 1,
            autoRefreshResults: false,
            opKey: "predictions-load-after-save",
          });
        }
      );
      setPredictionNote("");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const refreshSavedPredictionResult = async (predictionId) => {
    try {
      await runOperation(
        `prediction-refresh-${predictionId}`,
        {
          start: 15,
          stage: "Mac sonucu kontrol ediliyor",
          successStage: "Kayit guncellendi",
          clearMs: 1200,
        },
        async ({ setProgress }) => {
          await apiRequest(`/admin/predictions/${predictionId}/refresh-result`, { method: "POST" });
          setProgress(78, "Gunluk liste yenileniyor");
          await loadDailyPredictions({
            day: savedPredictionsDay,
            page: savedPredictions.page || 1,
            autoRefreshResults: false,
            opKey: "predictions-load-refresh",
          });
        }
      );
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const activateModel = async (modelId = selectedModelId, options = {}) => {
    const targetModelId = String(modelId || "").trim();
    if (!targetModelId) return false;

    const opKey = options?.opKey || "activate-model";
    const silent = options?.silent === true;
    const nextPage = Math.max(1, Number(options?.page || modelCatalogPage || 1));
    const nextFilter = String(options?.modelFilter || modelCatalogFilter || "all");

    const activateAndRefresh = async (setProgressCb = null) => {
      await apiRequest(`/admin/models/${targetModelId}/activate`, { method: "POST" });
      setSelectedModelId(targetModelId);
      setModels((prev) =>
        (prev || []).map((item) => ({
          ...item,
          is_active: String(item.model_id) === targetModelId,
        }))
      );
      if (setProgressCb) setProgressCb(58, "Model katalogu yenileniyor");
      await requestModelsCatalog({
        page: nextPage,
        modelFilter: nextFilter,
        leagueId: mode === "models" ? modelCatalogLeagueFilter : selectedLeagueId,
      });
    };

    if (silent) {
      try {
        await activateAndRefresh();
        setError("");
        return true;
      } catch (err) {
        setError(err.message || "Model aktiflenemedi.");
        return false;
      }
    }

    try {
      await runOperation(
        opKey,
        {
          start: 15,
          stage: "Model aktifleniyor",
          successStage: "Model aktiflendi",
        },
        async ({ setProgress }) => {
          await activateAndRefresh(setProgress);
        }
      );
      setError("");
      return true;
    } catch (err) {
      setError(err.message || "Model aktiflenemedi.");
      return false;
    }
  };

  const deleteModel = async (modelId = selectedModelId, options = {}) => {
    const targetModelId = String(modelId || "").trim();
    if (!targetModelId) return false;

    const opKey = options?.opKey || "delete-model";
    const silent = options?.silent === true;
    const nextPage = Math.max(1, Number(options?.page || modelCatalogPage || 1));
    const nextFilter = String(options?.modelFilter || modelCatalogFilter || "all");
    const shouldConfirm = options?.confirm !== false;
    if (shouldConfirm && typeof window !== "undefined") {
      const accepted = window.confirm("Bu modeli silmek istediginize emin misiniz?");
      if (!accepted) return false;
    }

    const deleteAndRefresh = async (setProgressCb = null) => {
      const payload = await apiRequest(`/admin/models/${targetModelId}`, { method: "DELETE" });
      if (setProgressCb) setProgressCb(56, "Model katalogu yenileniyor");
      const refreshed = await requestModelsCatalog({
        page: nextPage,
        modelFilter: nextFilter,
        leagueId: mode === "models" ? modelCatalogLeagueFilter : selectedLeagueId,
      });
      const nextActive = String(payload?.active_model_id || refreshed?.active_model_id || "").trim();
      setSelectedModelId((prev) => {
        if (nextActive) return nextActive;
        const firstId = String(refreshed?.items?.[0]?.model_id || "").trim();
        if (firstId) return firstId;
        if (String(prev) === targetModelId) return "";
        return prev;
      });
      return payload;
    };

    if (silent) {
      try {
        await deleteAndRefresh();
        setError("");
        return true;
      } catch (err) {
        setError(err.message || "Model silinemedi.");
        return false;
      }
    }

    try {
      await runOperation(
        opKey,
        {
          start: 14,
          stage: "Model siliniyor",
          successStage: "Model silindi",
          clearMs: 1200,
        },
        async ({ setProgress }) => {
          await deleteAndRefresh(setProgress);
        }
      );
      setError("");
      return true;
    } catch (err) {
      setError(err.message || "Model silinemedi.");
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const refreshPublicShell = async () => {
      if (cancelled) return;
      await Promise.all([loadPublicSliderImages(), loadShowcasePublic()]);
    };
    refreshPublicShell();
    const timer = window.setInterval(() => {
      refreshPublicShell();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let watchdogTimer = null;

    const settle = (fn) => {
      if (cancelled || settled) return;
      settled = true;
      if (watchdogTimer) {
        window.clearTimeout(watchdogTimer);
      }
      if (typeof fn === "function") {
        fn();
      }
      setAuthReady(true);
    };

    const token = readAuthToken();
    if (!token) {
      setCurrentUser(null);
      setAuthReady(true);
      return () => {
        cancelled = true;
      };
    }

    watchdogTimer = window.setTimeout(() => {
      settle(() => {
        setCurrentUser(null);
        setError("Oturum kontrolu zaman asimina ugradi. Misafir gorunumu gosteriliyor.");
      });
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    loadCurrentUser()
      .then((profile) => {
        settle(() => {
          setCurrentUser(profile || null);
          setError("");
        });
      })
      .catch((err) => {
        settle(() => {
          const authTerminal = isAuthTerminalError(err) || !readAuthToken();
          if (authTerminal) {
            clearAuthToken("dashboard_bootstrap_auth_terminal");
          }
          setCurrentUser(null);
          setError(
            err.message ||
              (authTerminal
                ? "Oturum gecersiz, lutfen tekrar giris yap."
                : "Oturum kontrolu gecici olarak basarisiz oldu.")
          );
        });
      });

    return () => {
      cancelled = true;
      if (watchdogTimer) {
        window.clearTimeout(watchdogTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    let cancelled = false;
    let deferredFixturesTimer = null;
    const nextFixtureFilters = buildDefaultFixtureFilters(selectedLeagueId);
    setIngestForm((prev) => ({ ...prev, league_id: String(selectedLeagueId) }));
    setModelForm((prev) => ({ ...prev, league_id: String(selectedLeagueId) }));
    setModelCatalogPage(1);
    setModelCatalog((prev) => ({ ...prev, page: 1 }));
    setFixtureFilters(nextFixtureFilters);
    setFixturePage(1);
    setFixtureCatalog({
      page: 1,
      page_size: 25,
      total: 0,
      total_pages: 1,
      items: [],
    });
    setFixtures([]);
    setFixtureId("");
    setSimulation(null);
    setAiCommentary("");
    setAiProvider("");
    setAiProviderError("");
    setAiOddsSummary(null);
    setAiAnalysisTable([]);
    loadOverview("overview-league-change");
    loadDailyPredictions({ day: savedPredictionsDay, page: 1, silent: true });

    // Defer fixture catalog fetch so authenticated screen paints fast first.
    deferredFixturesTimer = window.setTimeout(() => {
      if (cancelled) return;
      loadFixtureCatalog({
        opKey: "fixtures-load",
        pageToLoad: 1,
        filters: nextFixtureFilters,
        successStage: "Mac listesi hazir",
      });
    }, 180);

    return () => {
      cancelled = true;
      if (deferredFixturesTimer) {
        window.clearTimeout(deferredFixturesTimer);
      }
    };
  }, [selectedLeagueId, authReady, currentUser?.id]);

  useEffect(() => {
    if (!authReady || !currentUser || !tasks.length) return;
    const timer = setInterval(() => {
      tasks
        .filter((task) => !task.ready)
        .forEach((task) => {
          refreshTask(task.task_id, { silent: true });
        });
    }, 4000);
    return () => clearInterval(timer);
  }, [tasks, authReady, currentUser?.id]);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    if (mode !== "models") {
      setTrainingMatches(EMPTY_TRAINING_MATCHES);
      setTrainingMatchesError("");
      return;
    }
    if (!selectedModelId) {
      setTrainingMatches(EMPTY_TRAINING_MATCHES);
      setTrainingMatchesError("");
      return;
    }
    loadTrainingMatches(selectedModelId, 1, { silent: true, opKey: "training-matches-auto" });
  }, [selectedModelId, authReady, currentUser?.id, mode]);

  useEffect(() => {
    if (!currentUser || !isManager || !isAdminRouteMode) {
      setManagedUsers([]);
      return;
    }
    loadManagedUsers(true);
  }, [currentUser?.id, currentUser?.role, isAdminRouteMode]);

  useEffect(() => {
    if (!currentUser || !isManager || !isAdminRouteMode) {
      setPaymentNotices([]);
      return;
    }
    loadPaymentNotices(true);
  }, [currentUser?.id, currentUser?.role, isAdminRouteMode]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "superadmin" || !isAdminRouteMode) {
      setSliderImagesAdmin([]);
      return;
    }
    loadSliderImages(true);
  }, [currentUser?.id, currentUser?.role, isAdminRouteMode]);

  useEffect(() => {
    if (!currentUser) {
      setOddsBannerSettings(DEFAULT_ODDS_BANNER_SETTINGS);
      return;
    }
    loadOddsBannerSettings(true);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      setFeaturedTeamPlayers({ left: null, right: null });
      return;
    }
    const customHomeName = String(oddsBannerSettings?.ai_home_team_name || "").trim();
    const customAwayName = String(oddsBannerSettings?.ai_away_team_name || "").trim();
    const homeId = customHomeName ? null : oddsHeadlineFixture?.home_team_id;
    const awayId = customAwayName ? null : oddsHeadlineFixture?.away_team_id;
    const homeName = customHomeName || oddsHeadlineFixture?.home_team_name;
    const awayName = customAwayName || oddsHeadlineFixture?.away_team_name;

    let cancelled = false;
    Promise.all([
      loadFeaturedPlayerForTeam(homeId, homeName, "left"),
      loadFeaturedPlayerForTeam(awayId, awayName, "right"),
    ]).then(([leftPlayer, rightPlayer]) => {
      if (cancelled) return;
      setFeaturedTeamPlayers({
        left: leftPlayer,
        right: rightPlayer,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    currentUser?.id,
    oddsBannerSettings?.ai_home_team_name,
    oddsBannerSettings?.ai_away_team_name,
    oddsHeadlineFixture?.home_team_id,
    oddsHeadlineFixture?.away_team_id,
    oddsHeadlineFixture?.home_team_name,
    oddsHeadlineFixture?.away_team_name,
  ]);

  if (!authReady) {
    return <DashboardLoadingPage />;
  }

  if (!currentUser) {
    if (isAdminRouteMode) {
      return <Navigate to="/login" replace />;
    }
    return <GuestLanding apiBase={API_BASE} featuredOddsRows={featuredOddsRows} />;
  }

  if (isAdminRouteMode && !isManager) {
    return <Navigate to="/" replace />;
  }

  const dashboard = {
    outcomeLabel,
    formatDate,
    asPercent,
    taskStage,
    taskProgress,
    sourceStatusLabel,
    PAYMENT_WALLETS,
    CREDIT_PACKAGES,
    LEAGUE_OPTIONS,
    FIXTURE_DAY_WINDOW_OPTIONS,
    FIXTURE_DATE_RANGE_LIMITS: fixtureDateRangeLimits,
    API_BASE,
    publicSliderImages,
    overview,
    setOverview,
    recentFeatures,
    setRecentFeatures,
    fixtures,
    setFixtures,
    fixtureCatalog,
    setFixtureCatalog,
    fixturePage,
    setFixturePage,
    fixtureFilters,
    setFixtureFilters,
    models,
    setModels,
    modelCatalog,
    setModelCatalog,
    modelCatalogPage,
    setModelCatalogPage,
    modelCatalogFilter,
    setModelCatalogFilter,
    modelCatalogLeagueFilter,
    setModelCatalogLeagueFilter,
    MODEL_CATALOG_FILTERS,
    MODEL_LIST_PAGE_SIZE,
    SIMULATION_CREDIT_COST,
    AI_COMMENTARY_CREDIT_COST,
    MODEL_TRAINING_CREDIT_COST,
    modelSources,
    setModelSources,
    tasks,
    setTasks,
    error,
    setError,
    loadingMap,
    setLoadingMap,
    operations,
    setOperations,
    selectedLeagueId,
    setSelectedLeagueId,
    authReady,
    setAuthReady,
    currentUser,
    setCurrentUser,
    showPackages,
    setShowPackages,
    sliderImagesAdmin,
    setSliderImagesAdmin,
    oddsBannerSettings,
    setOddsBannerSettings,
    copiedWallet,
    setCopiedWallet,
    featuredTeamPlayers,
    setFeaturedTeamPlayers,
    paymentForm,
    setPaymentForm,
    paymentNotices,
    setPaymentNotices,
    paymentStatusDrafts,
    setPaymentStatusDrafts,
    managedUsers,
    setManagedUsers,
    newUserForm,
    setNewUserForm,
    creditDrafts,
    setCreditDrafts,
    passwordDrafts,
    setPasswordDrafts,
    ingestForm,
    setIngestForm,
    historyTarget,
    setHistoryTarget,
    fixtureId,
    setFixtureId,
    selectedModelId,
    setSelectedModelId,
    simulation,
    setSimulation,
    aiCommentary,
    setAiCommentary,
    aiProvider,
    setAiProvider,
    aiProviderError,
    setAiProviderError,
    aiOddsSummary,
    setAiOddsSummary,
    aiAnalysisTable,
    setAiAnalysisTable,
    modelForm,
    setModelForm,
    trainingMatches,
    setTrainingMatches,
    trainingMatchesError,
    setTrainingMatchesError,
    predictionNote,
    setPredictionNote,
    savedPredictionsDay,
    setSavedPredictionsDay,
    savedPredictions,
    setSavedPredictions,
    isLoading,
    setOperation,
    clearOperation,
    runOperation,
    operationFor,
    selectedFixture,
    fixtureLookup,
    selectedModel,
    selectedLeague,
    selectedLeagueLabel,
    isManager,
    adminView: mode === "admin",
    topScorelines,
    firstGoalDist,
    oddsHeadlineFixture,
    featuredOddsRows,
    aiPredictionCenter,
    featuredPlayers,
    PLAYER_SHOWCASE,
    loadCurrentUser,
    logout,
    copyWalletAddress,
    loadFeaturedPlayerForTeam,
    loadSliderImages,
    saveSliderImages,
    loadOddsBannerSettings,
    loadPaymentNotices,
    submitPaymentNotice,
    setPaymentNoticeStatus,
    deletePaymentNotice,
    loadManagedUsers,
    createManagedUser,
    updateManagedUserCredits,
    setManagedUserPassword,
    fetchDashboard,
    loadOverview,
    requestFixtureCatalog,
    loadFixtureCatalog,
    applyFixtureFilters,
    resetFixtureFilters,
    queueTask,
    refreshTask,
    runSimulation,
    runAiCommentary,
    loadModelsCatalog,
    toggleModelSource,
    queueModelTraining,
    deleteModel,
    loadTrainingMatches,
    loadDailyPredictions,
    saveCurrentPrediction,
    refreshSavedPredictionResult,
    activateModel,
    apiRequest,
  };

  if (mode === "models") {
    return <DashboardModelsPage dashboard={dashboard} />;
  }

  if (mode === "dashboard") {
    return (
      <GuestLanding
        apiBase={API_BASE}
        featuredOddsRows={featuredOddsRows}
        isLoggedIn
        isManager={isManager}
      />
    );
  }

  return <DashboardAuthenticatedPage dashboard={dashboard} />;
}
