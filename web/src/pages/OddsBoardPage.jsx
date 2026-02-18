import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";

import { apiRequest } from "../lib/api";
import { readAuthToken } from "../lib/auth";
import {
  buildSlipPickKey,
  couponTotalOdds,
  inferMarketKeyFromSelection,
  normalizeLineValue,
  resolveSlipPickKey,
} from "../lib/couponSlip";
import { groupCouponsByDecision } from "../lib/mathCouponDecision";
import {
  fetchAllModels,
  filterByLeague,
  isVisibleForCurrentUser,
  parseModelLeagueId,
  resolveModelScope,
  sortVisibleModels,
} from "../lib/modelCatalog";
import { useAiChat } from "../state/chat/AiChatContext";
import { useCouponSlip } from "../state/coupon/CouponSlipContext";

const LEAGUE_OPTIONS = [
  { value: "all", label: "Tum Ligler" },
  { value: "600", label: "Super Lig" },
  { value: "564", label: "La Liga" },
  { value: "8", label: "Premier League" },
  { value: "384", label: "Serie A" },
  { value: "2", label: "Champions League" },
  { value: "5", label: "Europa League" },
];

const DEFAULT_COUPON_LEAGUES = [600, 564, 8, 384, 2, 5];

const GAME_TYPE_OPTIONS = [
  { value: "all", label: "Tum Oyun Turleri" },
  { value: "match_result", label: "Mac Sonucu" },
  { value: "first_half", label: "Ilk Yari Sonucu" },
  { value: "handicap", label: "Handikapli Mac Sonucu" },
  { value: "over_under_25", label: "Alt/Ust 2.5" },
  { value: "btts", label: "Karsilikli Gol" },
];

const RISK_SECTIONS = [
  { key: "low", title: "Dusuk Riskli Kupon", accentClass: "risk-low" },
  { key: "medium", title: "Orta Riskli Kupon", accentClass: "risk-medium" },
  { key: "high", title: "Cok Riskli Kupon", accentClass: "risk-high" },
];

function normalizeLeagueLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Lig";
  return normalized;
}

function formatKickoff(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const today = new Date();
  const isToday =
    dt.getFullYear() === today.getFullYear() &&
    dt.getMonth() === today.getMonth() &&
    dt.getDate() === today.getDate();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${isToday ? "Bugun" : dt.toLocaleDateString("tr-TR")} ${hh}:${mm}`;
}

function oddText(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 1) return "-";
  return parsed.toFixed(2);
}

function marketValue(market, key) {
  if (!market || typeof market !== "object") return "-";
  return oddText(market[key]);
}

function groupedByLeague(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const leagueName = normalizeLeagueLabel(item?.league_name || `Lig ${item?.league_id || ""}`);
    if (!groups.has(leagueName)) {
      groups.set(leagueName, []);
    }
    groups.get(leagueName).push(item);
  });
  return Array.from(groups.entries());
}

function asPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `%${(parsed * 100).toFixed(1)}`;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function resolveBankroll(value, fallback = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 100) return fallback;
  return Math.round(parsed);
}

function formatTl(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${parsed.toFixed(0)} TL`;
}

function mathVariantLabel(variant) {
  if (variant === "mix_single") return "Tekli";
  if (variant === "mix_double") return "2'li";
  if (variant === "mix_shot") return "Shot";
  return "";
}

function isNotFoundError(err) {
  const raw = String(err?.message || "").trim().toLowerCase();
  return raw === "not found" || raw.includes("404");
}

function normalizeErrorMessage(err, fallback) {
  const raw = String(err?.message || "").trim();
  if (!raw) return fallback;
  if (isNotFoundError(err)) {
    return "Kupon servisi bulunamadi. API servisini yeniden baslatin.";
  }
  return raw;
}

function formatEta(seconds) {
  const safe = Number(seconds);
  if (!Number.isFinite(safe) || safe < 0) return "-";
  if (safe <= 1) return "0 sn";
  if (safe < 60) return `${Math.round(safe)} sn`;
  const mins = Math.floor(safe / 60);
  const secs = Math.round(safe % 60);
  return `${mins} dk ${secs} sn`;
}

function isOneXTwoSelection(selection) {
  const normalized = String(selection || "").trim();
  return normalized === "1" || normalized === "0" || normalized === "2";
}

function resolveBoardSelectionMeta(marketKey, outcomeKey, rawLine) {
  const safeMarketKey = String(marketKey || "").trim();
  const safeOutcome = String(outcomeKey || "").trim();
  const line = normalizeLineValue(rawLine);
  if (safeMarketKey === "match_result") {
    if (!["1", "0", "2"].includes(safeOutcome)) return null;
    return {
      selection: safeOutcome,
      selectionDisplay: `MS ${safeOutcome}`,
      marketLabel: "Mac Sonucu",
      line: null,
    };
  }
  if (safeMarketKey === "first_half") {
    if (!["1", "0", "2"].includes(safeOutcome)) return null;
    return {
      selection: `IY-${safeOutcome}`,
      selectionDisplay: `IY ${safeOutcome}`,
      marketLabel: "Ilk Yari Sonucu",
      line: null,
    };
  }
  if (safeMarketKey === "handicap") {
    if (!["1", "0", "2"].includes(safeOutcome)) return null;
    const safeLine = line || "0.0";
    return {
      selection: `HCP(${safeLine})-${safeOutcome}`,
      selectionDisplay: `HCP ${safeLine} ${safeOutcome}`,
      marketLabel: "Handikapli Mac Sonucu",
      line: safeLine,
    };
  }
  if (safeMarketKey === "over_under_25") {
    const safeLine = line || "2.5";
    if (safeOutcome === "under") {
      return {
        selection: `ALT-${safeLine}`,
        selectionDisplay: `ALT ${safeLine}`,
        marketLabel: "Alt/Ust 2.5",
        line: safeLine,
      };
    }
    if (safeOutcome === "over") {
      return {
        selection: `UST-${safeLine}`,
        selectionDisplay: `UST ${safeLine}`,
        marketLabel: "Alt/Ust 2.5",
        line: safeLine,
      };
    }
    return null;
  }
  if (safeMarketKey === "btts") {
    if (safeOutcome === "yes") {
      return {
        selection: "KG-VAR",
        selectionDisplay: "KG Var",
        marketLabel: "Karsilikli Gol",
        line: null,
      };
    }
    if (safeOutcome === "no") {
      return {
        selection: "KG-YOK",
        selectionDisplay: "KG Yok",
        marketLabel: "Karsilikli Gol",
        line: null,
      };
    }
    return null;
  }
  return null;
}

export default function OddsBoardPage() {
  const [filters, setFilters] = useState({
    q: "",
    target_date: "",
    league_id: "all",
    game_type: "all",
    sort: "asc",
  });
  const [pageData, setPageData] = useState({
    page: 1,
    page_size: 80,
    total: 0,
    total_pages: 1,
    items: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [couponParams, setCouponParams] = useState({
    days_window: "3",
    matches_per_coupon: "3",
    model_id: "",
  });
  const [couponTask, setCouponTask] = useState({
    task_id: "",
    run_id: null,
    state: "",
    progress: 0,
    stage: "",
  });
  const [coupons, setCoupons] = useState({ low: null, medium: null, high: null });
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponInfo, setCouponInfo] = useState("");
  const [couponEtaSeconds, setCouponEtaSeconds] = useState(null);
  const [modelOptions, setModelOptions] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const activeTaskRef = useRef("");
  const couponApiPrefixRef = useRef("/coupons");
  const couponTaskStartedAtRef = useRef(0);
  const [mathCoupons, setMathCoupons] = useState(null);
  const [mathCouponWarnings, setMathCouponWarnings] = useState([]);
  const [bankrollTl, setBankrollTl] = useState("1000");
  const [mathTask, setMathTask] = useState({
    task_id: "",
    run_id: null,
    state: "",
    progress: 0,
    stage: "",
  });
  const [mathLoading, setMathLoading] = useState(false);
  const [mathError, setMathError] = useState("");
  const [mathInfo, setMathInfo] = useState("");
  const [mathEtaSeconds, setMathEtaSeconds] = useState(null);
  const [mathAutoConfig, setMathAutoConfig] = useState(null);
  const activeMathTaskRef = useRef("");
  const mathTaskStartedAtRef = useRef(0);

  const {
    items: slipItems,
    couponCount,
    stake,
    addPick,
    addPicks,
    removePick,
  } = useCouponSlip();
  const { askFromAction } = useAiChat();
  const [savedView, setSavedView] = useState("active");
  const [savedCoupons, setSavedCoupons] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState("");
  const leagueLabelMap = useMemo(() => {
    const next = new Map();
    (LEAGUE_OPTIONS || []).forEach((league) => {
      const value = String(league?.value || "").trim().toLowerCase();
      if (!value || value === "all") return;
      const leagueId = Number(value);
      if (!Number.isFinite(leagueId)) return;
      next.set(Math.trunc(leagueId), String(league?.label || `Lig ${leagueId}`));
    });
    return next;
  }, []);

  const requestCouponApi = async (suffixPath, options = {}) => {
    const primary = `${couponApiPrefixRef.current}${suffixPath}`;
    try {
      return await apiRequest(primary, options);
    } catch (err) {
      const canFallback = couponApiPrefixRef.current !== "/admin/coupons" && isNotFoundError(err);
      if (!canFallback) {
        throw err;
      }
      const fallback = `/admin/coupons${suffixPath}`;
      const payload = await apiRequest(fallback, options);
      couponApiPrefixRef.current = "/admin/coupons";
      return payload;
    }
  };

  const loadSavedCoupons = async (viewMode = savedView) => {
    setSavedLoading(true);
    setSavedError("");
    try {
      const archived = viewMode === "archived" ? "true" : "false";
      const payload = await requestCouponApi(`/saved?archived=${archived}&limit=100`);
      setSavedCoupons(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      setSavedError(normalizeErrorMessage(err, "Kuponlarim listesi yuklenemedi."));
      setSavedCoupons([]);
    } finally {
      setSavedLoading(false);
    }
  };

  const mapMatchToSavedItem = (match) => ({
    fixture_id: Number(match.fixture_id),
    home_team_name: String(match.home_team_name || "-"),
    away_team_name: String(match.away_team_name || "-"),
    starting_at: match.starting_at || null,
    selection: String(match.selection || ""),
    odd: safeNumber(match.odd, 1),
    league_id: match.league_id ? Number(match.league_id) : null,
    league_name: match.league_name || null,
    market_key: match.market_key || inferMarketKeyFromSelection(match.selection),
    market_label: match.market_label || null,
    line: normalizeLineValue(match.line, "") || null,
    selection_display: match.selection_display || null,
  });

  const mergeMatchesIntoSlip = (matches = [], sourceTaskId = "") => {
    if (!Array.isArray(matches) || !matches.length) return 0;
    const normalizedMatches = matches
      .map((match) => {
        if (!match?.fixture_id || !match?.selection) return;
        return {
          fixture_id: Number(match.fixture_id),
          home_team_name: match.home_team_name,
          away_team_name: match.away_team_name,
          starting_at: match.starting_at,
          selection: String(match.selection),
          selection_display: match.selection_display || String(match.selection),
          market_key:
            match.market_key || (isOneXTwoSelection(match.selection) ? "match_result" : inferMarketKeyFromSelection(match.selection)),
          market_label: match.market_label || null,
          line: normalizeLineValue(match.line, "") || null,
          odd: Number(match.odd),
          task_id: sourceTaskId || couponTask.task_id || "",
          source: match.source || "generated",
          model_id: match.model_id || null,
          pick_key: String(match.pick_key || "").trim() || undefined,
        };
      })
      .filter(Boolean);

    return addPicks(normalizedMatches);
  };

  const buildBoardPick = (fixtureItem, marketKey, outcomeKey) => {
    if (!fixtureItem?.fixture_id || !fixtureItem?.markets) return null;
    const market = fixtureItem.markets?.[marketKey];
    if (!market || typeof market !== "object") return null;
    const odd = safeNumber(market?.[outcomeKey], 0);
    if (!Number.isFinite(odd) || odd <= 1.0) return null;
    const meta = resolveBoardSelectionMeta(marketKey, outcomeKey, market?.line);
    if (!meta) return null;
    const pick = {
      fixture_id: Number(fixtureItem.fixture_id),
      home_team_name: fixtureItem.home_team_name,
      away_team_name: fixtureItem.away_team_name,
      starting_at: fixtureItem.starting_at,
      selection: meta.selection,
      selection_display: meta.selectionDisplay,
      market_key: marketKey,
      market_label: meta.marketLabel,
      line: meta.line,
      odd: Number(odd.toFixed(2)),
      source: "manual",
      task_id: "",
      model_id: null,
    };
    return {
      ...pick,
      pick_key: buildSlipPickKey(pick),
    };
  };

  const toggleBoardPick = (pick) => {
    const pickKey = resolveSlipPickKey(pick);
    if (!pickKey) return;
    const exists = slipItems.some((item) => resolveSlipPickKey(item) === pickKey);
    if (exists) {
      removePick(pickKey);
      return;
    }
    addPick({ ...pick, pick_key: pickKey });
  };

  const loadModels = async (leagueFilter = "all") => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const payload = await fetchAllModels(apiRequest);
      const activeModelId = String(payload?.active_model_id || "").trim();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const visibleItems = items.filter((item) => isVisibleForCurrentUser(item));
      const sortedVisibleItems = sortVisibleModels(visibleItems, activeModelId);
      const leagueFilteredItems = filterByLeague(sortedVisibleItems, leagueFilter);
      const mapped = leagueFilteredItems
        .map((item) => {
          const modelId = String(item?.model_id || "").trim();
          if (!modelId) return null;
          const modelName = String(item?.model_name || "").trim();
          const leagueId = parseModelLeagueId(item);
          const leagueLabel = leagueId !== null ? leagueLabelMap.get(leagueId) || `Lig ${leagueId}` : "Lig";
          const modelScope = resolveModelScope(item);
          const ownerLabel = item?.is_owned_by_me ? "Senin Modelin" : modelScope === "ready" ? "Hazir Model" : "Kullanici Modeli";
          const displayName = modelName || modelId;
          return {
            value: modelId,
            label: `${displayName} — ${leagueLabel} (${ownerLabel})`,
          };
        })
        .filter(Boolean);
      setModelOptions(mapped);
      setCouponParams((prev) => {
        if (!prev.model_id) return prev;
        if (mapped.some((item) => item.value === prev.model_id)) return prev;
        return { ...prev, model_id: "" };
      });
    } catch (err) {
      setModelsError(err.message || "Model listesi yuklenemedi.");
      setModelOptions([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const loadBoard = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", "80");
      params.set("sort", filters.sort || "asc");
      params.set("game_type", filters.game_type || "all");
      if (filters.target_date) params.set("target_date", filters.target_date);
      if (filters.league_id && filters.league_id !== "all") params.set("league_id", filters.league_id);
      if (filters.q?.trim()) params.set("q", filters.q.trim());
      const payload = await apiRequest(`/fixtures/board?${params.toString()}`);
      setPageData(payload || {});
    } catch (err) {
      setError(err.message || "Oran tahtasi yuklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  const resolveAutoMathConfig = () => {
    const resolvedBankroll = resolveBankroll(bankrollTl, 1000);
    const daysWindow = 3;
    const matchesPerCoupon = resolvedBankroll >= 2500 ? 4 : 3;
    // Auto math strategy is intentionally global: do not lock to board filters.
    const resolvedLeagues = [...DEFAULT_COUPON_LEAGUES];
    const leaguesLabel = resolvedLeagues.map((leagueId) => leagueLabelMap.get(leagueId) || `Lig ${leagueId}`).join(", ");
    return {
      days_window: daysWindow,
      matches_per_coupon: matchesPerCoupon,
      league_ids: resolvedLeagues,
      model_id: null,
      bankroll_tl: resolvedBankroll,
      view: {
        leaguesLabel,
        modelLabel: "Lig Bazli Otomatik",
        daysWindow,
        matchesPerCoupon,
        bankroll: resolvedBankroll,
      },
    };
  };

  const pollCouponTask = async (taskId, mode = "classic") => {
    const isMath = mode === "math";
    const activeRef = isMath ? activeMathTaskRef : activeTaskRef;
    const startedAtRef = isMath ? mathTaskStartedAtRef : couponTaskStartedAtRef;
    activeRef.current = taskId;
    let attempts = 0;
    while (activeRef.current === taskId && attempts < 120) {
      attempts += 1;
      try {
        const info = await requestCouponApi(`/tasks/${taskId}`);
        const progressValue = Math.max(0, Math.min(100, safeNumber(info.progress, 0)));
        if (progressValue > 0 && progressValue < 100 && startedAtRef.current > 0) {
          const elapsedSec = Math.max(1, (Date.now() - startedAtRef.current) / 1000);
          const eta = (elapsedSec * (100 - progressValue)) / progressValue;
          if (isMath) {
            setMathEtaSeconds(Math.max(1, Math.round(eta)));
          } else {
            setCouponEtaSeconds(Math.max(1, Math.round(eta)));
          }
        } else if (progressValue >= 100) {
          if (isMath) {
            setMathEtaSeconds(0);
          } else {
            setCouponEtaSeconds(0);
          }
        }
        if (isMath) {
          setMathTask((prev) => ({
            ...prev,
            task_id: taskId,
            state: info.state || prev.state,
            progress: progressValue,
            stage: info.stage || prev.stage,
          }));
        } else {
          setCouponTask((prev) => ({
            ...prev,
            task_id: taskId,
            state: info.state || prev.state,
            progress: progressValue,
            stage: info.stage || prev.stage,
          }));
        }

        if (!isMath && info?.result?.coupons) {
          setCoupons(info.result.coupons);
        }
        if (isMath && info?.result?.math_coupons) {
          setMathCoupons(info.result.math_coupons);
          const summaryWarnings = Array.isArray(info.result.math_coupons?.summary?.warnings)
            ? info.result.math_coupons.summary.warnings
            : [];
          setMathCouponWarnings(summaryWarnings);
        }

        const doneState = ["SUCCESS", "FAILURE", "REVOKED"].includes(String(info.state || "").toUpperCase());
        const hasResult = !!info?.result;
        if (doneState || hasResult) {
          if (isMath) {
            setMathLoading(false);
            setMathEtaSeconds(0);
            if (String(info.state || "").toUpperCase() === "FAILURE") {
              setMathError(info.stage || "Matematiksel kupon task basarisiz oldu.");
            } else {
              setMathInfo("Matematiksel kuponlar hazirlandi.");
            }
          } else {
            setCouponLoading(false);
            setCouponEtaSeconds(0);
            if (String(info.state || "").toUpperCase() === "FAILURE") {
              setCouponError(info.stage || "Kupon task basarisiz oldu.");
            } else {
              setCouponInfo("Akilli kuponlar hazirlandi.");
            }
          }
          return;
        }
      } catch (err) {
        if (isMath) {
          setMathLoading(false);
          setMathEtaSeconds(null);
          setMathError(normalizeErrorMessage(err, "Matematiksel kupon task durumu alinamadi."));
        } else {
          setCouponLoading(false);
          setCouponEtaSeconds(null);
          setCouponError(normalizeErrorMessage(err, "Kupon task durumu alinamadi."));
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    if (activeRef.current === taskId) {
      if (isMath) {
        setMathLoading(false);
        setMathEtaSeconds(null);
        setMathError("Matematiksel kupon task suresi doldu. Lutfen tekrar deneyin.");
      } else {
        setCouponLoading(false);
        setCouponEtaSeconds(null);
        setCouponError("Kupon task suresi doldu. Lutfen tekrar deneyin.");
      }
    }
  };

  const generateSmartCoupons = async () => {
    setCouponError("");
    setCouponInfo("");
    setCouponLoading(true);
    setCouponEtaSeconds(null);
    setCoupons({ low: null, medium: null, high: null });
    activeTaskRef.current = "";
    couponTaskStartedAtRef.current = Date.now();

    try {
      const resolvedLeagues =
        filters.league_id && filters.league_id !== "all" ? [Number(filters.league_id)] : [...DEFAULT_COUPON_LEAGUES];
      const payload = await requestCouponApi("/generate", {
        method: "POST",
        body: JSON.stringify({
          days_window: Number(couponParams.days_window || 3),
          matches_per_coupon: Number(couponParams.matches_per_coupon || 3),
          league_ids: resolvedLeagues,
          model_id: String(couponParams.model_id || "").trim() || null,
          include_math_coupons: false,
        }),
      });

      setCouponTask({
        task_id: String(payload?.task_id || ""),
        run_id: payload?.run_id || null,
        state: String(payload?.status || "PENDING").toUpperCase(),
        progress: 4,
        stage: "Kupon task kuyruga alindi",
      });
      if (!payload?.task_id) {
        throw new Error("Task kimligi alinamadi.");
      }
      pollCouponTask(String(payload.task_id), "classic");
    } catch (err) {
      setCouponLoading(false);
      setCouponEtaSeconds(null);
      setCouponError(normalizeErrorMessage(err, "Akilli kupon olusturulamadi."));
    }
  };

  const generateMathCouponsAuto = async () => {
    setMathError("");
    setMathInfo("");
    setMathLoading(true);
    setMathEtaSeconds(null);
    setMathCoupons(null);
    setMathCouponWarnings([]);
    activeMathTaskRef.current = "";
    mathTaskStartedAtRef.current = Date.now();

    try {
      const autoConfig = resolveAutoMathConfig();
      setMathAutoConfig(autoConfig.view);
      const payload = await requestCouponApi("/generate", {
        method: "POST",
        body: JSON.stringify({
          days_window: autoConfig.days_window,
          matches_per_coupon: autoConfig.matches_per_coupon,
          league_ids: autoConfig.league_ids,
          model_id: autoConfig.model_id,
          bankroll_tl: autoConfig.bankroll_tl,
          include_math_coupons: true,
        }),
      });
      setMathTask({
        task_id: String(payload?.task_id || ""),
        run_id: payload?.run_id || null,
        state: String(payload?.status || "PENDING").toUpperCase(),
        progress: 4,
        stage: "Matematiksel kupon task kuyruga alindi",
      });
      if (!payload?.task_id) {
        throw new Error("Task kimligi alinamadi.");
      }
      pollCouponTask(String(payload.task_id), "math");
    } catch (err) {
      setMathLoading(false);
      setMathEtaSeconds(null);
      setMathError(normalizeErrorMessage(err, "Matematiksel kupon olusturulamadi."));
    }
  };

  const openInsightModal = async ({
    source,
    fixture_id,
    selection,
    task_id,
    model_id,
    title,
    home_team_name,
    away_team_name,
  }) => {
    const response = await askFromAction({
      source,
      task_id: task_id || null,
      fixture_id: Number(fixture_id),
      selection: selection || null,
      model_id: String(model_id || "").trim() || null,
      home_team_name: home_team_name || null,
      away_team_name: away_team_name || null,
      match_label: title || null,
      question: "Bu maci detayli analiz et ve secimin gucunu acikla.",
      language: "tr",
    });
    if (!response?.ok) {
      setCouponError(response?.error || "AI analiz chat paneline aktarilamadi.");
      return;
    }
    setCouponInfo("AI cevabi chat panelinde gosterildi.");
  };

  const addCouponMatchToSlip = (match) => {
    if (!match?.fixture_id || !match?.selection) return;
    const added = mergeMatchesIntoSlip([match], couponTask.task_id || "");
    if (added > 0) {
      setCouponInfo("Mac kupona eklendi.");
    }
  };

  const addRiskCouponToSlip = (coupon) => {
    setCouponError("");
    setCouponInfo("");
    if (!coupon || coupon.unavailable || !Array.isArray(coupon.matches) || !coupon.matches.length) {
      setCouponError("Eklenecek kupon bulunamadi.");
      return;
    }
    const added = mergeMatchesIntoSlip(coupon.matches, couponTask.task_id || "");
    if (added <= 0) {
      setCouponInfo("Kupondaki maclar zaten kuponunda var.");
      return;
    }
    setCouponInfo(`${added} mac tek tikla kuponuna eklendi.`);
  };

  const saveRiskCouponToLibrary = async (riskSection, coupon) => {
    setCouponError("");
    setCouponInfo("");
    if (!coupon || coupon.unavailable || !Array.isArray(coupon.matches) || !coupon.matches.length) {
      setCouponError("Kaydedilecek kupon bulunamadi.");
      return;
    }
    try {
      const safeCouponCount = Math.max(1, Number(couponCount || 1));
      const safeStake = Math.max(1, Number(stake || 1));
      const totalOddsValue = safeNumber(coupon.total_odds, couponTotalOdds(coupon.matches));
      const couponAmountValue = safeCouponCount * safeStake;
      const maxWinValue = couponAmountValue * totalOddsValue;
      await requestCouponApi("/saved", {
        method: "POST",
        body: JSON.stringify({
          name: `${riskSection.title} ${new Date().toLocaleString("tr-TR")}`,
          risk_level: riskSection.key,
          source_task_id: couponTask.task_id || undefined,
          items: coupon.matches.map(mapMatchToSavedItem),
          summary: {
            coupon_count: safeCouponCount,
            stake: safeStake,
            total_odds: Number(totalOddsValue.toFixed(2)),
            coupon_amount: Number(couponAmountValue.toFixed(2)),
            max_win: Number(maxWinValue.toFixed(2)),
          },
        }),
      });
      setCouponInfo(`${riskSection.title} Kuponlarima eklendi.`);
      loadSavedCoupons(savedView);
    } catch (err) {
      setCouponError(normalizeErrorMessage(err, "Kupon kaydedilemedi."));
    }
  };

  const addMathCouponToSlip = (couponItem) => {
    setMathError("");
    setMathInfo("");
    const matches = Array.isArray(couponItem?.matches) ? couponItem.matches : [];
    if (!matches.length) {
      setMathError("Eklenecek kupon bulunamadi.");
      return;
    }
    const added = mergeMatchesIntoSlip(matches, mathTask.task_id || "");
    if (added <= 0) {
      setMathInfo("Kupondaki maclar zaten kuponunda var.");
      return;
    }
    setMathInfo(`${added} mac kuponuna eklendi.`);
  };

  const saveMathCouponToLibrary = async (strategyTitle, couponItem) => {
    setMathError("");
    setMathInfo("");
    const matches = Array.isArray(couponItem?.matches) ? couponItem.matches : [];
    if (!matches.length) {
      setMathError("Kaydedilecek kupon bulunamadi.");
      return;
    }
    try {
      const totalOddsValue = safeNumber(couponItem?.total_odds, couponTotalOdds(matches));
      const perCouponStake = Math.max(1, safeNumber(couponItem?.suggested_stake_tl, stake));
      const couponAmountValue = perCouponStake;
      const maxWinValue = couponAmountValue * totalOddsValue;
      await requestCouponApi("/saved", {
        method: "POST",
        body: JSON.stringify({
          name: `${strategyTitle} ${new Date().toLocaleString("tr-TR")}`,
          risk_level: "manual",
          source_task_id: mathTask.task_id || undefined,
          items: matches.map(mapMatchToSavedItem),
          summary: {
            coupon_count: 1,
            stake: perCouponStake,
            total_odds: Number(totalOddsValue.toFixed(2)),
            coupon_amount: Number(couponAmountValue.toFixed(2)),
            max_win: Number(maxWinValue.toFixed(2)),
          },
        }),
      });
      setMathInfo(`${strategyTitle} Kuponlarima eklendi.`);
      loadSavedCoupons(savedView);
    } catch (err) {
      setMathError(normalizeErrorMessage(err, "Kupon kaydedilemedi."));
    }
  };

  const archiveSavedCouponById = async (couponId) => {
    try {
      await requestCouponApi(`/saved/${Number(couponId)}/archive`, { method: "POST" });
      loadSavedCoupons(savedView);
    } catch (err) {
      setSavedError(normalizeErrorMessage(err, "Kupon arsive tasinamadi."));
    }
  };

  const restoreSavedCouponById = async (couponId) => {
    try {
      await requestCouponApi(`/saved/${Number(couponId)}/restore`, { method: "POST" });
      loadSavedCoupons(savedView);
    } catch (err) {
      setSavedError(normalizeErrorMessage(err, "Kupon arsivden geri alinamadi."));
    }
  };

  const deleteSavedCouponById = async (couponId) => {
    try {
      await requestCouponApi(`/saved/${Number(couponId)}`, { method: "DELETE" });
      loadSavedCoupons(savedView);
    } catch (err) {
      setSavedError(normalizeErrorMessage(err, "Kupon silinemedi."));
    }
  };

  const addSavedCouponToSlip = (savedCoupon) => {
    setSavedError("");
    const matches = Array.isArray(savedCoupon?.items) ? savedCoupon.items : [];
    if (!matches.length) {
      setSavedError("Eklenecek kupon bulunamadi.");
      return;
    }
    const added = mergeMatchesIntoSlip(matches, savedCoupon?.source_task_id || "");
    if (added <= 0) {
      setSavedError("Kayitli kupondaki maclar zaten kuponunda var.");
      return;
    }
    setCouponInfo(`${added} mac kayitli kupondan kuponuna eklendi.`);
  };

  useEffect(() => {
    loadBoard();
    loadSavedCoupons("active");
  }, []);

  useEffect(() => {
    loadModels(filters.league_id || "all");
  }, [filters.league_id]);

  useEffect(() => {
    return () => {
      activeTaskRef.current = "";
      activeMathTaskRef.current = "";
    };
  }, []);

  const featuredItems = useMemo(() => {
    const rows = Array.isArray(pageData?.items) ? pageData.items : [];
    return rows.filter((item) => item?.is_featured).slice(0, 4);
  }, [pageData?.items]);

  const leagueGroups = useMemo(() => groupedByLeague(pageData?.items || []), [pageData?.items]);
  const slipPickKeySet = useMemo(() => {
    const next = new Set();
    (Array.isArray(slipItems) ? slipItems : []).forEach((item) => {
      const key = resolveSlipPickKey(item);
      if (key) next.add(key);
    });
    return next;
  }, [slipItems]);

  const renderModelBadge = (match) => {
    const modelName = String(match?.model_name || "").trim();
    const modelId = String(match?.model_id || "").trim();
    const mode = String(match?.model_selection_mode || "").trim();
    if (!modelName && !modelId && !mode) return "Lig Bazli Otomatik";
    if (modelName) return modelName;
    if (modelId) return modelId.slice(0, 18);
    return mode || "Lig Bazli Otomatik";
  };
  const resolvedBankrollTl = useMemo(() => resolveBankroll(bankrollTl, 1000), [bankrollTl]);
  const mathSingleItems = Array.isArray(mathCoupons?.single_low_mid?.items) ? mathCoupons.single_low_mid.items : [];
  const mathDoubleItems = Array.isArray(mathCoupons?.double_system?.items) ? mathCoupons.double_system.items : [];
  const mixBaskets = mathCoupons?.mix_portfolio?.baskets || {};
  const mixSingleItems = Array.isArray(mixBaskets?.single?.items) ? mixBaskets.single.items : [];
  const mixDoubleItems = Array.isArray(mixBaskets?.double?.items) ? mixBaskets.double.items : [];
  const mixShotItems = Array.isArray(mixBaskets?.shot?.items) ? mixBaskets.shot.items : [];
  const mixMergedItems = useMemo(
    () => [
      ...mixSingleItems.map((item) => ({ ...item, coupon_variant: "mix_single" })),
      ...mixDoubleItems.map((item) => ({ ...item, coupon_variant: "mix_double" })),
      ...mixShotItems.map((item) => ({ ...item, coupon_variant: "mix_shot" })),
    ],
    [mixSingleItems, mixDoubleItems, mixShotItems]
  );
  const mathSingleGrouped = useMemo(
    () =>
      groupCouponsByDecision(mathSingleItems, {
        strategyKey: "single_low_mid",
        targetRange: mathCoupons?.single_low_mid?.target_odds_range || null,
      }),
    [
      mathSingleItems,
      mathCoupons?.single_low_mid?.target_odds_range?.min,
      mathCoupons?.single_low_mid?.target_odds_range?.max,
    ]
  );
  const mathDoubleGrouped = useMemo(
    () =>
      groupCouponsByDecision(mathDoubleItems, {
        strategyKey: "double_system",
        targetRange: mathCoupons?.double_system?.target_odds_range || null,
      }),
    [
      mathDoubleItems,
      mathCoupons?.double_system?.target_odds_range?.min,
      mathCoupons?.double_system?.target_odds_range?.max,
    ]
  );
  const mathMixGrouped = useMemo(
    () =>
      groupCouponsByDecision(mixMergedItems, {
        strategyKey: "mix_portfolio",
        targetRangeByVariant: {
          mix_single: mixBaskets?.single?.target_odds_range || null,
          mix_double: mixBaskets?.double?.target_odds_range || null,
          mix_shot: mixBaskets?.shot?.target_odds_range || null,
        },
      }),
    [
      mixMergedItems,
      mixBaskets?.single?.target_odds_range?.min,
      mixBaskets?.single?.target_odds_range?.max,
      mixBaskets?.double?.target_odds_range?.min,
      mixBaskets?.double?.target_odds_range?.max,
      mixBaskets?.shot?.target_odds_range?.min,
      mixBaskets?.shot?.target_odds_range?.max,
    ]
  );

  const renderOddsPickButton = (fixtureItem, marketKey, outcomeKey) => {
    const pick = buildBoardPick(fixtureItem, marketKey, outcomeKey);
    const valueText = marketValue(fixtureItem?.markets?.[marketKey], outcomeKey);
    const pickKey = pick ? resolveSlipPickKey(pick) : "";
    const isSelected = !!pickKey && slipPickKeySet.has(pickKey);
    return (
      <button
        type="button"
        className={`odds-pick-btn ${isSelected ? "is-selected" : ""}`}
        onClick={() => (pick ? toggleBoardPick(pick) : null)}
        disabled={!pick}
        aria-pressed={isSelected}
      >
        {valueText}
      </button>
    );
  };

  if (!readAuthToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="container">
      <section className="card wide">
        <h2>Oran Tahtasi</h2>
        <p className="help-text">Mac ve oran listesi gunluk DB cache uzerinden servis edilir. Canli istek yapilmaz.</p>

        {error ? <div className="error">{error}</div> : null}

        <div className="odds-board-filters">
          <input
            placeholder="Lig ya da takim adi giriniz"
            value={filters.q}
            onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
          />
          <input
            type="date"
            value={filters.target_date || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, target_date: e.target.value }))}
          />
          <select
            value={filters.game_type}
            onChange={(e) => setFilters((prev) => ({ ...prev, game_type: e.target.value }))}
          >
            {GAME_TYPE_OPTIONS.map((item) => (
              <option key={`game-type-${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            value={filters.league_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, league_id: e.target.value }))}
          >
            {LEAGUE_OPTIONS.map((item) => (
              <option key={`league-filter-${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            value={filters.sort}
            onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value }))}
          >
            <option value="asc">Tarihe Gore Sirala (Artan)</option>
            <option value="desc">Tarihe Gore Sirala (Azalan)</option>
          </select>
          <button type="button" onClick={loadBoard} disabled={loading}>
            {loading ? "Yukleniyor..." : "Listele"}
          </button>
        </div>
      </section>

      <section className="card wide smart-coupon-control-card">
        <div className="row spread wrap">
          <h3>Akilli Kuponlar</h3>
          <span className="small-text">Klasik risk kartlari (Dusuk / Orta / Cok Riskli)</span>
        </div>

        <div className="smart-coupon-control-grid">
          <label>
            Gun Araligi
            <select
              value={couponParams.days_window}
              onChange={(e) => setCouponParams((prev) => ({ ...prev, days_window: e.target.value }))}
            >
              <option value="2">2 Gun</option>
              <option value="3">3 Gun</option>
            </select>
          </label>

          <label>
            Kupon Basina Mac
            <select
              value={couponParams.matches_per_coupon}
              onChange={(e) => setCouponParams((prev) => ({ ...prev, matches_per_coupon: e.target.value }))}
            >
              <option value="3">3 Mac</option>
              <option value="4">4 Mac</option>
            </select>
          </label>

          <label>
            Model Secimi
            <select
              value={couponParams.model_id}
              onChange={(e) => setCouponParams((prev) => ({ ...prev, model_id: e.target.value }))}
            >
              <option value="">Lig Bazli Otomatik</option>
              {modelOptions.map((item) => (
                <option key={`coupon-model-${item.value}`} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={generateSmartCoupons} disabled={couponLoading}>
            {couponLoading ? "Kuponlar Uretiliyor..." : "Akilli Kuponlari Uret"}
          </button>
        </div>

        {modelsLoading ? <p className="small-text">Model listesi yukleniyor...</p> : null}
        {modelsError ? <p className="small-text">{modelsError}</p> : null}

        <div className="coupon-progress-wrap">
          <div className="coupon-progress-track">
            <div
              className="coupon-progress-fill"
              style={{ width: `${Math.max(0, Math.min(100, safeNumber(couponTask.progress, 0)))}%` }}
            />
          </div>
        </div>

        <div className="row spread wrap">
          <span className="small-text">
            Task: {couponTask.task_id || "-"} | Durum: {couponTask.state || "-"} | %{safeNumber(couponTask.progress, 0)}
          </span>
          <span className="small-text">
            {couponTask.stage || ""}
            {couponLoading ? ` | Tahmini kalan: ${formatEta(couponEtaSeconds)}` : ""}
          </span>
        </div>

        {couponError ? <div className="error">{couponError}</div> : null}
        {couponInfo ? <p className="small-text">{couponInfo}</p> : null}
      </section>

      <section className="smart-coupon-layout smart-coupon-layout--single">
        <div className="smart-coupon-cards">
          {RISK_SECTIONS.map((riskSection) => {
            const coupon = coupons?.[riskSection.key];
            const lowSafetyFallback = riskSection.key === "low" && coupon?.selection_policy === "safety_fallback";
            return (
              <article key={`coupon-${riskSection.key}`} className={`card smart-coupon-card ${riskSection.accentClass}`}>
                <div className="smart-coupon-head">
                  <div className="smart-coupon-head-left">
                    <h3>{riskSection.title}</h3>
                    {lowSafetyFallback ? <span className="smart-policy-badge">Guvenli Fallback</span> : null}
                  </div>
                  <span className="small-text">
                    Toplam Oran: {coupon?.total_odds ? Number(coupon.total_odds).toFixed(2) : "-"}
                  </span>
                </div>

                {coupon?.warnings?.length ? (
                  <div className="small-text">
                    {coupon.warnings.map((warning, index) => (
                      <div key={`warn-${riskSection.key}-${index}`}>{warning}</div>
                    ))}
                  </div>
                ) : null}

                {coupon?.unavailable ? <p className="small-text">Bu risk seviyesi icin uygun kupon olusturulamadi.</p> : null}

                {!coupon?.unavailable && Array.isArray(coupon?.matches) && coupon.matches.length ? (
                  <div className="smart-coupon-card-actions">
                    <button type="button" className="smart-mini-btn" onClick={() => addRiskCouponToSlip(coupon)}>
                      Kuponuma Ekle
                    </button>
                    <button type="button" className="smart-mini-btn" onClick={() => saveRiskCouponToLibrary(riskSection, coupon)}>
                      Kuponlarima Kaydet
                    </button>
                  </div>
                ) : null}

                {!coupon?.unavailable && Array.isArray(coupon?.matches) && coupon.matches.length ? (
                  <div className="smart-coupon-match-list">
                    {coupon.matches.map((match) => (
                      <div key={`risk-match-${riskSection.key}-${match.fixture_id}-${match.selection}`} className="smart-coupon-match-row">
                        <div className="smart-coupon-match-top">
                          <strong>
                            {match.home_team_name} - {match.away_team_name}
                          </strong>
                          <span>{formatKickoff(match.starting_at)}</span>
                        </div>

                        <div className="smart-coupon-match-meta">
                          <span>
                            Mac Sonucu: <strong>{match.selection}</strong>
                          </span>
                          <span>Oran: {oddText(match.odd)}</span>
                          <span>Model: {asPercent(match.model_prob)}</span>
                          <span className="smart-model-chip">{renderModelBadge(match)}</span>
                        </div>

                        <div className="smart-coupon-match-actions">
                          <button
                            type="button"
                            className="smart-mini-btn"
                            onClick={() =>
                              openInsightModal({
                                source: "generated",
                                fixture_id: match.fixture_id,
                                selection: match.selection,
                                task_id: couponTask.task_id,
                                model_id: match.model_id || couponParams.model_id,
                                title: `${match.home_team_name} - ${match.away_team_name}`,
                                home_team_name: match.home_team_name,
                                away_team_name: match.away_team_name,
                              })
                            }
                          >
                            i
                          </button>
                          <button type="button" className="smart-mini-btn" onClick={() => addCouponMatchToSlip(match)}>
                            Mac Ekle
                          </button>
                          <button
                            type="button"
                            className="smart-mini-btn"
                            onClick={() =>
                              openInsightModal({
                                source: "generated",
                                fixture_id: match.fixture_id,
                                selection: match.selection,
                                task_id: couponTask.task_id,
                                model_id: match.model_id || couponParams.model_id,
                                title: `${match.home_team_name} - ${match.away_team_name}`,
                                home_team_name: match.home_team_name,
                                away_team_name: match.away_team_name,
                              })
                            }
                          >
                            AI'a Sor
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="small-text">Kupon olusturuldugunda burada gorunecek.</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="card wide math-coupon-section math-reco-zone">
        <div className="math-reco-header">
          <h3>Matematiksel Olarak Mantikli Kuponlar (+EV)</h3>
          <span className="small-text">Banka: {formatTl(mathCoupons?.summary?.bankroll_tl || resolvedBankrollTl)}</span>
        </div>
        <p className="small-text">
          Bu alanda gun araligi, kupon basi mac sayisi, lig ve model otomatik secilir. Yalnizca banka tutari verip uretim
          baslatirsin.
        </p>
        <div className="math-reco-disclaimer">
          Oyna = matematiksel avantaj daha guclu. Oynama = avantaj dusuk veya risk daha yuksek. Garanti kazanc degildir.
        </div>

        <div className="math-coupon-auto-controls">
          <label>
            Banka (TL)
            <input
              type="number"
              min={100}
              step={50}
              value={bankrollTl}
              onChange={(e) => setBankrollTl(e.target.value)}
              onBlur={() => setBankrollTl(String(resolveBankroll(bankrollTl, 1000)))}
            />
          </label>
          <button type="button" onClick={generateMathCouponsAuto} disabled={mathLoading}>
            {mathLoading ? "Matematiksel Kuponlar Uretiliyor..." : "Matematiksel Kuponlari Otomatik Uret"}
          </button>
        </div>

        {mathAutoConfig ? (
          <div className="small-text">
            Otomatik Secim: {mathAutoConfig.daysWindow} gun | Kupon basi {mathAutoConfig.matchesPerCoupon} mac | Lig:{" "}
            {mathAutoConfig.leaguesLabel} | Model: {mathAutoConfig.modelLabel}
          </div>
        ) : null}

        <div className="coupon-progress-wrap">
          <div className="coupon-progress-track">
            <div
              className="coupon-progress-fill"
              style={{ width: `${Math.max(0, Math.min(100, safeNumber(mathTask.progress, 0)))}%` }}
            />
          </div>
        </div>

        <div className="row spread wrap">
          <span className="small-text">
            Task: {mathTask.task_id || "-"} | Durum: {mathTask.state || "-"} | %{safeNumber(mathTask.progress, 0)}
          </span>
          <span className="small-text">
            {mathTask.stage || ""}
            {mathLoading ? ` | Tahmini kalan: ${formatEta(mathEtaSeconds)}` : ""}
          </span>
        </div>

        {mathError ? <div className="error">{mathError}</div> : null}
        {mathInfo ? <p className="small-text">{mathInfo}</p> : null}
        {mathCouponWarnings.length ? (
          <div className="small-text">
            {mathCouponWarnings.map((warning, index) => (
              <div key={`math-warning-${index}`}>{warning}</div>
            ))}
          </div>
        ) : null}

        <div className="math-coupon-grid">
          <section className="math-coupon-strategy-card">
            <div className="math-coupon-meta">
              <strong>Tekli + dusuk-orta oran</strong>
              <span>
                Hedef oran: {oddText(mathCoupons?.single_low_mid?.target_odds_range?.min)} -{" "}
                {oddText(mathCoupons?.single_low_mid?.target_odds_range?.max)}
              </span>
              <span>
                Stake: %{safeNumber(mathCoupons?.single_low_mid?.stake_pct_range?.min, 0) * 100} - %
                {safeNumber(mathCoupons?.single_low_mid?.stake_pct_range?.max, 0) * 100} | Oneri{" "}
                {formatTl(mathCoupons?.single_low_mid?.suggested_stake_tl)}
              </span>
              <span>Uretilen kupon: {mathSingleItems.length}</span>
            </div>
            <div className="math-reco-summary-chips">
              <span className="math-reco-chip-play">Oyna: {mathSingleGrouped.play.length}</span>
              <span className="math-reco-chip-skip">Oynama: {mathSingleGrouped.skip.length}</span>
            </div>

            <div className="math-reco-group-play">
              <div className="math-reco-group-head">
                <strong>Oyna</strong>
                <span className="small-text">{mathSingleGrouped.play.length} kupon</span>
              </div>
              <div className="math-coupon-list">
                {mathSingleGrouped.play.length ? (
                  mathSingleGrouped.play.map((couponItem) => (
                    <div
                      key={`math-single-play-${couponItem.coupon_id}`}
                      className={`math-reco-item ${couponItem.decision === "play" ? "is-play" : "is-skip"}`}
                    >
                      <div className="math-reco-item-head">
                        <div className="math-coupon-meta">
                          <strong>{couponItem.coupon_id}</strong>
                          <span>Toplam oran: {oddText(couponItem.total_odds)}</span>
                          <span>Edge: {safeNumber(couponItem.edge_sum, 0).toFixed(3)}</span>
                          <span>EV skor: {safeNumber(couponItem.expected_value_score, 0).toFixed(2)}</span>
                        </div>
                        <div className="math-reco-item-badges">
                          <span className={couponItem.decision === "play" ? "math-reco-badge-play" : "math-reco-badge-skip"}>
                            {couponItem.decision === "play" ? "Oyna" : "Oynama"}
                          </span>
                          <span className="math-reco-score-badge">Skor: {safeNumber(couponItem.score, 0)}/100</span>
                        </div>
                      </div>
                      <div className="small-text">
                        {(couponItem.matches || [])
                          .map((match) => `${match.home_team_name} - ${match.away_team_name} (${match.selection}/${oddText(match.odd)})`)
                          .join(" | ")}
                      </div>
                      <div className="math-reco-reason">Neden: {(couponItem.reasons || []).join(" ")}</div>
                      <div className="smart-coupon-match-actions">
                        <button type="button" className="smart-mini-btn" onClick={() => addMathCouponToSlip(couponItem)}>
                          Kuponuma Ekle
                        </button>
                        <button
                          type="button"
                          className="smart-mini-btn"
                          onClick={() => saveMathCouponToLibrary("Matematiksel Tekli", couponItem)}
                        >
                          Kuponlarima Kaydet
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="small-text">Bu stratejide su an Oyna onerisi yok.</p>
                )}
              </div>
            </div>

            <details className="math-reco-group-skip">
              <summary>Oynama ({mathSingleGrouped.skip.length})</summary>
              <div className="math-coupon-list">
                {mathSingleGrouped.skip.length ? (
                  mathSingleGrouped.skip.map((couponItem) => (
                    <div key={`math-single-skip-${couponItem.coupon_id}`} className="math-reco-item is-skip">
                      <div className="math-reco-item-head">
                        <div className="math-coupon-meta">
                          <strong>{couponItem.coupon_id}</strong>
                          <span>Toplam oran: {oddText(couponItem.total_odds)}</span>
                          <span>Edge: {safeNumber(couponItem.edge_sum, 0).toFixed(3)}</span>
                          <span>EV skor: {safeNumber(couponItem.expected_value_score, 0).toFixed(2)}</span>
                        </div>
                        <div className="math-reco-item-badges">
                          <span className="math-reco-badge-skip">Oynama</span>
                          <span className="math-reco-score-badge">Skor: {safeNumber(couponItem.score, 0)}/100</span>
                        </div>
                      </div>
                      <div className="small-text">
                        {(couponItem.matches || [])
                          .map((match) => `${match.home_team_name} - ${match.away_team_name} (${match.selection}/${oddText(match.odd)})`)
                          .join(" | ")}
                      </div>
                      <div className="math-reco-reason">Neden: {(couponItem.reasons || []).join(" ")}</div>
                      <div className="smart-coupon-match-actions">
                        <button type="button" className="smart-mini-btn" onClick={() => addMathCouponToSlip(couponItem)}>
                          Kuponuma Ekle
                        </button>
                        <button
                          type="button"
                          className="smart-mini-btn"
                          onClick={() => saveMathCouponToLibrary("Matematiksel Tekli", couponItem)}
                        >
                          Kuponlarima Kaydet
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="small-text">Bu stratejide Oynama listesinde kupon yok.</p>
                )}
              </div>
            </details>
          </section>

          <section className="math-coupon-strategy-card">
            <div className="math-coupon-meta">
              <strong>2'li Sistem</strong>
              <span>
                Hedef oran: {oddText(mathCoupons?.double_system?.target_odds_range?.min)} -{" "}
                {oddText(mathCoupons?.double_system?.target_odds_range?.max)}
              </span>
              <span>
                Stake: %{safeNumber(mathCoupons?.double_system?.stake_pct_range?.min, 0) * 100} - %
                {safeNumber(mathCoupons?.double_system?.stake_pct_range?.max, 0) * 100} | Oneri{" "}
                {formatTl(mathCoupons?.double_system?.suggested_stake_tl)}
              </span>
              <span>Uretilen kupon: {mathDoubleItems.length}</span>
            </div>
            <div className="math-reco-summary-chips">
              <span className="math-reco-chip-play">Oyna: {mathDoubleGrouped.play.length}</span>
              <span className="math-reco-chip-skip">Oynama: {mathDoubleGrouped.skip.length}</span>
            </div>

            <div className="math-reco-group-play">
              <div className="math-reco-group-head">
                <strong>Oyna</strong>
                <span className="small-text">{mathDoubleGrouped.play.length} kupon</span>
              </div>
              <div className="math-coupon-list">
                {mathDoubleGrouped.play.length ? (
                  mathDoubleGrouped.play.map((couponItem) => (
                    <div
                      key={`math-double-play-${couponItem.coupon_id}`}
                      className={`math-reco-item ${couponItem.decision === "play" ? "is-play" : "is-skip"}`}
                    >
                      <div className="math-reco-item-head">
                        <div className="math-coupon-meta">
                          <strong>{couponItem.coupon_id}</strong>
                          <span>Toplam oran: {oddText(couponItem.total_odds)}</span>
                          <span>Edge: {safeNumber(couponItem.edge_sum, 0).toFixed(3)}</span>
                          <span>EV skor: {safeNumber(couponItem.expected_value_score, 0).toFixed(2)}</span>
                        </div>
                        <div className="math-reco-item-badges">
                          <span className={couponItem.decision === "play" ? "math-reco-badge-play" : "math-reco-badge-skip"}>
                            {couponItem.decision === "play" ? "Oyna" : "Oynama"}
                          </span>
                          <span className="math-reco-score-badge">Skor: {safeNumber(couponItem.score, 0)}/100</span>
                        </div>
                      </div>
                      <div className="small-text">
                        {(couponItem.matches || [])
                          .map((match) => `${match.home_team_name} - ${match.away_team_name} (${match.selection}/${oddText(match.odd)})`)
                          .join(" | ")}
                      </div>
                      <div className="math-reco-reason">Neden: {(couponItem.reasons || []).join(" ")}</div>
                      <div className="smart-coupon-match-actions">
                        <button type="button" className="smart-mini-btn" onClick={() => addMathCouponToSlip(couponItem)}>
                          Kuponuma Ekle
                        </button>
                        <button
                          type="button"
                          className="smart-mini-btn"
                          onClick={() => saveMathCouponToLibrary("Matematiksel 2li", couponItem)}
                        >
                          Kuponlarima Kaydet
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="small-text">Bu stratejide su an Oyna onerisi yok.</p>
                )}
              </div>
            </div>

            <details className="math-reco-group-skip">
              <summary>Oynama ({mathDoubleGrouped.skip.length})</summary>
              <div className="math-coupon-list">
                {mathDoubleGrouped.skip.length ? (
                  mathDoubleGrouped.skip.map((couponItem) => (
                    <div key={`math-double-skip-${couponItem.coupon_id}`} className="math-reco-item is-skip">
                      <div className="math-reco-item-head">
                        <div className="math-coupon-meta">
                          <strong>{couponItem.coupon_id}</strong>
                          <span>Toplam oran: {oddText(couponItem.total_odds)}</span>
                          <span>Edge: {safeNumber(couponItem.edge_sum, 0).toFixed(3)}</span>
                          <span>EV skor: {safeNumber(couponItem.expected_value_score, 0).toFixed(2)}</span>
                        </div>
                        <div className="math-reco-item-badges">
                          <span className="math-reco-badge-skip">Oynama</span>
                          <span className="math-reco-score-badge">Skor: {safeNumber(couponItem.score, 0)}/100</span>
                        </div>
                      </div>
                      <div className="small-text">
                        {(couponItem.matches || [])
                          .map((match) => `${match.home_team_name} - ${match.away_team_name} (${match.selection}/${oddText(match.odd)})`)
                          .join(" | ")}
                      </div>
                      <div className="math-reco-reason">Neden: {(couponItem.reasons || []).join(" ")}</div>
                      <div className="smart-coupon-match-actions">
                        <button type="button" className="smart-mini-btn" onClick={() => addMathCouponToSlip(couponItem)}>
                          Kuponuma Ekle
                        </button>
                        <button
                          type="button"
                          className="smart-mini-btn"
                          onClick={() => saveMathCouponToLibrary("Matematiksel 2li", couponItem)}
                        >
                          Kuponlarima Kaydet
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="small-text">Bu stratejide Oynama listesinde kupon yok.</p>
                )}
              </div>
            </details>
          </section>

          <section className="math-coupon-strategy-card">
            <div className="math-coupon-meta">
              <strong>Mix Portfoy</strong>
              <span>%70 Tekli / %25 2'li / %5 Shot</span>
              <span>
                Tekli {mixSingleItems.length} | 2'li {mixDoubleItems.length} | Shot {mixShotItems.length}
              </span>
            </div>
            <div className="math-reco-summary-chips">
              <span className="math-reco-chip-play">Oyna: {mathMixGrouped.play.length}</span>
              <span className="math-reco-chip-skip">Oynama: {mathMixGrouped.skip.length}</span>
            </div>

            <div className="math-reco-group-play">
              <div className="math-reco-group-head">
                <strong>Oyna</strong>
                <span className="small-text">{mathMixGrouped.play.length} kupon</span>
              </div>
              <div className="math-coupon-list">
                {mathMixGrouped.play.length ? (
                  mathMixGrouped.play.map((couponItem) => (
                    <div
                      key={`math-mix-play-${couponItem.coupon_id}`}
                      className={`math-reco-item ${couponItem.decision === "play" ? "is-play" : "is-skip"}`}
                    >
                      <div className="math-reco-item-head">
                        <div className="math-coupon-meta">
                          <strong>{couponItem.coupon_id}</strong>
                          <span>Toplam oran: {oddText(couponItem.total_odds)}</span>
                          <span>Edge: {safeNumber(couponItem.edge_sum, 0).toFixed(3)}</span>
                          <span>EV skor: {safeNumber(couponItem.expected_value_score, 0).toFixed(2)}</span>
                        </div>
                        <div className="math-reco-item-badges">
                          <span className={couponItem.decision === "play" ? "math-reco-badge-play" : "math-reco-badge-skip"}>
                            {couponItem.decision === "play" ? "Oyna" : "Oynama"}
                          </span>
                          <span className="math-reco-score-badge">Skor: {safeNumber(couponItem.score, 0)}/100</span>
                          {mathVariantLabel(couponItem.variant) ? (
                            <span className="math-reco-basket-badge">{mathVariantLabel(couponItem.variant)}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="small-text">
                        {(couponItem.matches || [])
                          .map((match) => `${match.home_team_name} - ${match.away_team_name} (${match.selection}/${oddText(match.odd)})`)
                          .join(" | ")}
                      </div>
                      <div className="math-reco-reason">Neden: {(couponItem.reasons || []).join(" ")}</div>
                      <div className="smart-coupon-match-actions">
                        <button type="button" className="smart-mini-btn" onClick={() => addMathCouponToSlip(couponItem)}>
                          Kuponuma Ekle
                        </button>
                        <button
                          type="button"
                          className="smart-mini-btn"
                          onClick={() => saveMathCouponToLibrary("Matematiksel Mix", couponItem)}
                        >
                          Kuponlarima Kaydet
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="small-text">Bu stratejide su an Oyna onerisi yok.</p>
                )}
              </div>
            </div>

            <details className="math-reco-group-skip">
              <summary>Oynama ({mathMixGrouped.skip.length})</summary>
              <div className="math-coupon-list">
                {mathMixGrouped.skip.length ? (
                  mathMixGrouped.skip.map((couponItem) => (
                    <div key={`math-mix-skip-${couponItem.coupon_id}`} className="math-reco-item is-skip">
                      <div className="math-reco-item-head">
                        <div className="math-coupon-meta">
                          <strong>{couponItem.coupon_id}</strong>
                          <span>Toplam oran: {oddText(couponItem.total_odds)}</span>
                          <span>Edge: {safeNumber(couponItem.edge_sum, 0).toFixed(3)}</span>
                          <span>EV skor: {safeNumber(couponItem.expected_value_score, 0).toFixed(2)}</span>
                        </div>
                        <div className="math-reco-item-badges">
                          <span className="math-reco-badge-skip">Oynama</span>
                          <span className="math-reco-score-badge">Skor: {safeNumber(couponItem.score, 0)}/100</span>
                          {mathVariantLabel(couponItem.variant) ? (
                            <span className="math-reco-basket-badge">{mathVariantLabel(couponItem.variant)}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="small-text">
                        {(couponItem.matches || [])
                          .map((match) => `${match.home_team_name} - ${match.away_team_name} (${match.selection}/${oddText(match.odd)})`)
                          .join(" | ")}
                      </div>
                      <div className="math-reco-reason">Neden: {(couponItem.reasons || []).join(" ")}</div>
                      <div className="smart-coupon-match-actions">
                        <button type="button" className="smart-mini-btn" onClick={() => addMathCouponToSlip(couponItem)}>
                          Kuponuma Ekle
                        </button>
                        <button
                          type="button"
                          className="smart-mini-btn"
                          onClick={() => saveMathCouponToLibrary("Matematiksel Mix", couponItem)}
                        >
                          Kuponlarima Kaydet
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="small-text">Bu stratejide Oynama listesinde kupon yok.</p>
                )}
              </div>
            </details>
          </section>
        </div>
      </section>

      <section className="card wide saved-coupons-card">
        <div className="row spread wrap">
          <h3>Kuponlarim</h3>
          <div className="saved-coupon-tabs">
            <button
              type="button"
              className={`smart-mini-btn ${savedView === "active" ? "active-tab" : ""}`}
              onClick={() => {
                setSavedView("active");
                loadSavedCoupons("active");
              }}
            >
              Aktif
            </button>
            <button
              type="button"
              className={`smart-mini-btn ${savedView === "archived" ? "active-tab" : ""}`}
              onClick={() => {
                setSavedView("archived");
                loadSavedCoupons("archived");
              }}
            >
              Arsiv
            </button>
          </div>
        </div>

        {savedError ? <div className="error">{savedError}</div> : null}
        {savedLoading ? <p className="small-text">Kuponlar yukleniyor...</p> : null}

        {!savedLoading && !savedError && !savedCoupons.length ? (
          <p className="small-text">{savedView === "active" ? "Kayitli kupon yok." : "Arsivde kupon yok."}</p>
        ) : null}

        {!savedLoading && Array.isArray(savedCoupons) && savedCoupons.length ? (
          <div className="saved-coupons-grid">
            {savedCoupons.map((saved) => {
              const matches = Array.isArray(saved?.items) ? saved.items : [];
              const summary = saved?.summary || {};
              return (
                <article key={`saved-coupon-${saved.id}`} className="saved-coupon-item">
                  <div className="row spread wrap">
                    <strong>{saved.name || "Kupon"}</strong>
                    <span className="small-text">{formatKickoff(saved.created_at)}</span>
                  </div>
                  <div className="saved-coupon-meta">
                    <span>Mac: {matches.length}</span>
                    <span>Toplam Oran: {safeNumber(summary.total_odds, 0) > 0 ? safeNumber(summary.total_odds, 0).toFixed(2) : "-"}</span>
                    <span>Maks. Kazanc: {safeNumber(summary.max_win, 0) > 0 ? `${safeNumber(summary.max_win, 0).toFixed(2)} TL` : "-"}</span>
                  </div>
                  <div className="saved-coupon-actions">
                    <button type="button" className="smart-mini-btn" onClick={() => addSavedCouponToSlip(saved)}>
                      Kuponuma Ekle
                    </button>
                    {savedView === "active" ? (
                      <button type="button" className="smart-mini-btn" onClick={() => archiveSavedCouponById(saved.id)}>
                        Arsive At
                      </button>
                    ) : (
                      <button type="button" className="smart-mini-btn" onClick={() => restoreSavedCouponById(saved.id)}>
                        Geri Al
                      </button>
                    )}
                    <button type="button" className="smart-mini-btn danger" onClick={() => deleteSavedCouponById(saved.id)}>
                      Sil
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="card wide">
        <div className="row spread wrap">
          <h3>One Cikanlar ({featuredItems.length})</h3>
          <span className="small-text">
            Toplam {Number(pageData?.total || 0)} mac | Sayfa {Number(pageData?.page || 1)}/{Number(pageData?.total_pages || 1)}
          </span>
        </div>
        {featuredItems.length ? (
          <div className="featured-odds-grid">
            {featuredItems.map((item) => {
              const pick1 = buildBoardPick(item, "match_result", "1");
              const pick0 = buildBoardPick(item, "match_result", "0");
              const pick2 = buildBoardPick(item, "match_result", "2");
              const pick1Selected = !!pick1 && slipPickKeySet.has(resolveSlipPickKey(pick1));
              const pick0Selected = !!pick0 && slipPickKeySet.has(resolveSlipPickKey(pick0));
              const pick2Selected = !!pick2 && slipPickKeySet.has(resolveSlipPickKey(pick2));
              return (
                <article key={`featured-${item.fixture_id}`} className="featured-odds-card">
                  <strong>
                    {item.home_team_name} - {item.away_team_name}
                  </strong>
                  <span>{formatKickoff(item.starting_at)}</span>
                  <div className="featured-odds-row">
                    <button
                      type="button"
                      className={`featured-odds-btn ${pick1Selected ? "is-selected" : ""}`}
                      onClick={() => (pick1 ? toggleBoardPick(pick1) : null)}
                      disabled={!pick1}
                      aria-pressed={pick1Selected}
                    >
                      1: {marketValue(item.markets?.match_result, "1")}
                    </button>
                    <button
                      type="button"
                      className={`featured-odds-btn ${pick0Selected ? "is-selected" : ""}`}
                      onClick={() => (pick0 ? toggleBoardPick(pick0) : null)}
                      disabled={!pick0}
                      aria-pressed={pick0Selected}
                    >
                      0: {marketValue(item.markets?.match_result, "0")}
                    </button>
                    <button
                      type="button"
                      className={`featured-odds-btn ${pick2Selected ? "is-selected" : ""}`}
                      onClick={() => (pick2 ? toggleBoardPick(pick2) : null)}
                      disabled={!pick2}
                      aria-pressed={pick2Selected}
                    >
                      2: {marketValue(item.markets?.match_result, "2")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="small-text">Filtreye uygun one cikan mac bulunamadi.</p>
        )}
      </section>

      <section className="card wide">
        <div className="odds-board-table-wrap">
          <table className="odds-board-table">
            <thead>
              <tr>
                <th>Mac</th>
                <th colSpan={3}>Mac Sonucu</th>
                <th colSpan={3}>Ilk Yari Sonucu</th>
                <th colSpan={4}>Handikapli Mac Sonucu</th>
                <th colSpan={3}>Alt/Ust 2.5</th>
                <th colSpan={3}>Karsilikli Gol</th>
                <th colSpan={1}>Canli</th>
                <th colSpan={1} className="odds-ai-col">
                  AI
                </th>
              </tr>
              <tr>
                <th>Detay</th>
                <th>1</th>
                <th>0</th>
                <th>2</th>
                <th>1</th>
                <th>0</th>
                <th>2</th>
                <th>Line</th>
                <th>1</th>
                <th>0</th>
                <th>2</th>
                <th>Line</th>
                <th>Alt</th>
                <th>Ust</th>
                <th>Ek</th>
                <th>Var</th>
                <th>Yok</th>
                <th>Canli</th>
                <th className="odds-ai-col">AI</th>
              </tr>
            </thead>
            <tbody>
              {leagueGroups.map(([leagueName, rows]) => (
                <React.Fragment key={`league-row-${leagueName}`}>
                  <tr className="league-divider-row">
                    <td colSpan={19}>{leagueName}</td>
                  </tr>
                  {rows.map((item) => (
                    <tr key={`fixture-row-${item.fixture_id}`}>
                      <td>
                        <div className="odds-board-match">
                          <strong>
                            {item.home_team_name} - {item.away_team_name}
                          </strong>
                          <span>{formatKickoff(item.starting_at)}</span>
                        </div>
                      </td>
                      <td>{renderOddsPickButton(item, "match_result", "1")}</td>
                      <td>{renderOddsPickButton(item, "match_result", "0")}</td>
                      <td>{renderOddsPickButton(item, "match_result", "2")}</td>
                      <td>{renderOddsPickButton(item, "first_half", "1")}</td>
                      <td>{renderOddsPickButton(item, "first_half", "0")}</td>
                      <td>{renderOddsPickButton(item, "first_half", "2")}</td>
                      <td>{item.markets?.handicap?.line || "-"}</td>
                      <td>{renderOddsPickButton(item, "handicap", "1")}</td>
                      <td>{renderOddsPickButton(item, "handicap", "0")}</td>
                      <td>{renderOddsPickButton(item, "handicap", "2")}</td>
                      <td>{item.markets?.over_under_25?.line || "-"}</td>
                      <td>{renderOddsPickButton(item, "over_under_25", "under")}</td>
                      <td>{renderOddsPickButton(item, "over_under_25", "over")}</td>
                      <td>{Number(item.extra_market_count || 0) > 0 ? `+${Number(item.extra_market_count || 0)}` : "-"}</td>
                      <td>{renderOddsPickButton(item, "btts", "yes")}</td>
                      <td>{renderOddsPickButton(item, "btts", "no")}</td>
                      <td>{item.is_live ? "CANLI" : "-"}</td>
                      <td className="odds-ai-col">
                        <button
                          type="button"
                          className="odds-ai-btn"
                          onClick={() =>
                            openInsightModal({
                              source: "manual",
                              fixture_id: item.fixture_id,
                              selection: undefined,
                              model_id: undefined,
                              title: `${item.home_team_name} - ${item.away_team_name}`,
                              home_team_name: item.home_team_name,
                              away_team_name: item.away_team_name,
                            })
                          }
                        >
                          AI'a Sor
                        </button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
