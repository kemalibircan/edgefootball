import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import DashboardLoadingPage from "./dashboard/DashboardLoadingPage";
import { apiRequest, isAuthTerminalError } from "../lib/api";
import { clearAuthToken, readAuthToken } from "../lib/auth";

const LAST_SIMULATION_STORAGE_KEY = "football_ai_last_simulation_snapshot";
const MAX_IMAGE_INPUT_BYTES = 12 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1920;
const IMAGE_EXPORT_TYPE = "image/webp";
const IMAGE_EXPORT_QUALITY = 0.82;
const PREVIEW_LEFT_FALLBACK =
  "https://img.a.transfermarkt.technology/portrait/big/627228-1723922216.jpg?lm=1";
const PREVIEW_RIGHT_FALLBACK =
  "https://img.a.transfermarkt.technology/portrait/big/861410-1699472585.jpg?lm=1";
const DEFAULT_FORM = {
  banner_label: "Gunun Yapay Zeka Tahminleri",
  left_image_url: "",
  right_image_url: "",
  left_title: "",
  left_subtitle: "",
  right_title: "",
  right_subtitle: "",
  ai_home_team_name: "Antalyaspor",
  ai_away_team_name: "Samsunspor",
  ai_kickoff_at: "",
  ai_odd_home: "2.08",
  ai_odd_draw: "3.12",
  ai_odd_away: "2.86",
  ai_score_home: "2",
  ai_score_away: "1",
  ai_insight: "",
};
const DEFAULT_ODDS_ROW = Object.freeze({
  fixture_id: null,
  home_team_name: "",
  away_team_name: "",
  home_team_logo: null,
  away_team_logo: null,
  kickoff_at: null,
  odd_home: "2.10",
  odd_draw: "3.20",
  odd_away: "2.80",
  model_score_home: "",
  model_score_away: "",
});
const DEFAULT_ODDS_ROWS = Object.freeze([
  {
    fixture_id: null,
    home_team_name: "Antalyaspor",
    away_team_name: "Samsunspor",
    home_team_logo: null,
    away_team_logo: null,
    kickoff_at: null,
    odd_home: "2.14",
    odd_draw: "3.19",
    odd_away: "2.17",
    model_score_home: "1",
    model_score_away: "1",
  },
  {
    fixture_id: null,
    home_team_name: "Galatasaray",
    away_team_name: "Eyupspor",
    home_team_logo: null,
    away_team_logo: null,
    kickoff_at: null,
    odd_home: "2.28",
    odd_draw: "2.95",
    odd_away: "2.47",
    model_score_home: "2",
    model_score_away: "1",
  },
  {
    fixture_id: null,
    home_team_name: "Genclerbirligi",
    away_team_name: "Rizespor",
    home_team_logo: null,
    away_team_logo: null,
    kickoff_at: null,
    odd_home: "1.72",
    odd_draw: "2.95",
    odd_away: "2.02",
    model_score_home: "1",
    model_score_away: "0",
  },
]);

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 16);
  }
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function normalizeOddInput(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 1.01) {
    return parsed.toFixed(2);
  }
  return fallback;
}

function normalizeScoreInput(value, fallback = "") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return String(Math.trunc(parsed));
  }
  return fallback;
}

function readLastSimulationSnapshot() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_SIMULATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const fixtureId = Number(parsed?.fixture_id);
    const homeTeamName = String(parsed?.home_team_name || "").trim();
    const awayTeamName = String(parsed?.away_team_name || "").trim();
    if (!homeTeamName || !awayTeamName) {
      return null;
    }

    return {
      fixture_id: Number.isFinite(fixtureId) && fixtureId > 0 ? Math.trunc(fixtureId) : null,
      home_team_name: homeTeamName,
      away_team_name: awayTeamName,
      home_team_logo: String(parsed?.home_team_logo || "").trim() || null,
      away_team_logo: String(parsed?.away_team_logo || "").trim() || null,
      kickoff_at: String(parsed?.kickoff_at || "").trim() || null,
      odd_home: normalizeOddInput(parsed?.odd_home, "2.08"),
      odd_draw: normalizeOddInput(parsed?.odd_draw, "3.12"),
      odd_away: normalizeOddInput(parsed?.odd_away, "2.86"),
      model_score_home: normalizeScoreInput(parsed?.model_score_home, ""),
      model_score_away: normalizeScoreInput(parsed?.model_score_away, ""),
      created_at: String(parsed?.created_at || "").trim() || null,
    };
  } catch (_err) {
    return null;
  }
}

function normalizeForm(payload) {
  const raw = payload?.item || payload || {};
  return {
    banner_label: String(raw.banner_label || DEFAULT_FORM.banner_label).trim() || "Gunun Yapay Zeka Tahminleri",
    left_image_url: String(raw.left_image_url || "").trim(),
    right_image_url: String(raw.right_image_url || "").trim(),
    left_title: String(raw.left_title || "").trim(),
    left_subtitle: String(raw.left_subtitle || "").trim(),
    right_title: String(raw.right_title || "").trim(),
    right_subtitle: String(raw.right_subtitle || "").trim(),
    ai_home_team_name: String(raw.ai_home_team_name || DEFAULT_FORM.ai_home_team_name).trim() || "Antalyaspor",
    ai_away_team_name: String(raw.ai_away_team_name || DEFAULT_FORM.ai_away_team_name).trim() || "Samsunspor",
    ai_kickoff_at: toDateTimeLocalValue(raw.ai_kickoff_at),
    ai_odd_home: normalizeOddInput(raw.ai_odd_home, "2.08"),
    ai_odd_draw: normalizeOddInput(raw.ai_odd_draw, "3.12"),
    ai_odd_away: normalizeOddInput(raw.ai_odd_away, "2.86"),
    ai_score_home: normalizeScoreInput(raw.ai_score_home, "2"),
    ai_score_away: normalizeScoreInput(raw.ai_score_away, "1"),
    ai_insight: String(raw.ai_insight || "").trim(),
  };
}

function normalizeShowcaseOddsRows(payload) {
  const rows = payload?.sections?.popular_odds?.items;
  if (!Array.isArray(rows) || !rows.length) {
    return DEFAULT_ODDS_ROWS.map((row) => ({ ...row }));
  }
  const safeOdd = (value, fallback) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed.toFixed(2);
    }
    return fallback;
  };
  const normalized = rows
    .filter((row) => row && row.is_active !== false)
    .slice(0, 8)
    .map((row) => ({
      fixture_id: row?.fixture_id != null ? Number(row.fixture_id) : null,
      home_team_name: String(row?.home_team_name || "").trim(),
      away_team_name: String(row?.away_team_name || "").trim(),
      home_team_logo: String(row?.home_team_logo || "").trim() || null,
      away_team_logo: String(row?.away_team_logo || "").trim() || null,
      kickoff_at: String(row?.kickoff_at || "").trim() || null,
      odd_home: safeOdd(row?.odd_home, "2.08"),
      odd_draw: safeOdd(row?.odd_draw, "3.12"),
      odd_away: safeOdd(row?.odd_away, "2.86"),
      model_score_home: normalizeScoreInput(row?.model_score_home, ""),
      model_score_away: normalizeScoreInput(row?.model_score_away, ""),
    }));
  if (!normalized.length) {
    return DEFAULT_ODDS_ROWS.map((row) => ({ ...row }));
  }
  return normalized;
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error("Gecersiz dosya."));
      return;
    }
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      reject(new Error("Dosya boyutu cok buyuk. Lutfen 12MB altinda bir gorsel sec."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const maxEdge = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
        const scale = maxEdge > IMAGE_MAX_DIMENSION ? IMAGE_MAX_DIMENSION / maxEdge : 1;
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Tarayici canvas destegi bulunamadi.");
        }
        ctx.drawImage(image, 0, 0, width, height);
        let dataUrl = canvas.toDataURL(IMAGE_EXPORT_TYPE, IMAGE_EXPORT_QUALITY);
        if (!dataUrl || dataUrl.length < 24) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.86);
        }
        resolve(String(dataUrl || ""));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Gorsel islenemedi."));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Gorsel okunamadi."));
    };
    image.src = objectUrl;
  });
}

export default function SuperAdminOddsBannerPage() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [oddsRows, setOddsRows] = useState(DEFAULT_ODDS_ROWS.map((row) => ({ ...row })));
  const [latestSimulationRow, setLatestSimulationRow] = useState(() => readLastSimulationSnapshot());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [generatingSlider, setGeneratingSlider] = useState(false);
  const [generatingHighlights, setGeneratingHighlights] = useState(false);
  const [sliderGenResult, setSliderGenResult] = useState(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bannerPayload, showcasePayload] = await Promise.all([
        apiRequest("/admin/odds-banner-settings"),
        apiRequest("/admin/showcase"),
      ]);
      setForm(normalizeForm(bannerPayload));
      setOddsRows(normalizeShowcaseOddsRows(showcasePayload));
    } catch (err) {
      setError(err.message || "Iddia oranlar ayarlari okunamadi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const token = readAuthToken();
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }
      try {
        const profile = await apiRequest("/auth/me");
        if (profile?.role !== "superadmin") {
          navigate("/admin", { replace: true });
          return;
        }
        setCurrentUser(profile);
        await loadSettings();
      } catch (err) {
        const authTerminal = isAuthTerminalError(err) || !readAuthToken();
        if (authTerminal) {
          clearAuthToken("superadmin_bootstrap_auth_terminal");
          navigate("/login", { replace: true });
        } else {
          setError(err.message || "Yetki bilgisi okunamadi. Lutfen tekrar deneyin.");
          navigate("/admin", { replace: true });
        }
      } finally {
        setAuthReady(true);
      }
    };
    bootstrap();
  }, [loadSettings, navigate]);

  useEffect(() => {
    const syncLatestSimulation = () => {
      setLatestSimulationRow(readLastSimulationSnapshot());
    };
    syncLatestSimulation();
    if (typeof window === "undefined") return undefined;
    const handleStorage = (event) => {
      if (!event?.key || event.key === LAST_SIMULATION_STORAGE_KEY) {
        syncLatestSimulation();
      }
    };
    window.addEventListener("football-ai-last-simulation-updated", syncLatestSimulation);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("football-ai-last-simulation-updated", syncLatestSimulation);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleImageUpload = async (side, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imageData = await fileToDataURL(file);
      setForm((prev) => ({ ...prev, [`${side}_image_url`]: imageData }));
      setMessage(
        side === "left"
          ? "Sol gorsel secildi. Backend'e kaydetmek icin Kaydet'e bas."
          : "Sag gorsel secildi. Backend'e kaydetmek icin Kaydet'e bas."
      );
      setError("");
    } catch (err) {
      setError(err.message || "Gorsel yuklenemedi.");
      setMessage("");
    }
  };

  const clearImage = (side) => {
    setForm((prev) => ({ ...prev, [`${side}_image_url`]: "" }));
    setMessage(
      side === "left"
        ? "Sol gorsel temizlendi. Backend'e kaydetmek icin Kaydet'e bas."
        : "Sag gorsel temizlendi. Backend'e kaydetmek icin Kaydet'e bas."
    );
    setError("");
  };

  const updateOddsRow = (index, key, value) => {
    setOddsRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        return { ...row, [key]: value };
      })
    );
  };

  const addOddsRow = () => {
    setOddsRows((prev) => [...prev, { ...DEFAULT_ODDS_ROW }].slice(0, 8));
  };

  const addLatestSimulationRow = () => {
    if (!latestSimulationRow) {
      setError("Son simulasyon bulunamadi. Once Mac Tahmin Merkezi'nden bir mac simule et.");
      setMessage("");
      return;
    }
    setOddsRows((prev) => {
      const baseRows = Array.isArray(prev) ? prev : [];
      const nextRows = baseRows.filter((row) => {
        if (latestSimulationRow.fixture_id && row.fixture_id) {
          return Number(row.fixture_id) !== Number(latestSimulationRow.fixture_id);
        }
        const sameHome = String(row.home_team_name || "").trim() === latestSimulationRow.home_team_name;
        const sameAway = String(row.away_team_name || "").trim() === latestSimulationRow.away_team_name;
        return !(sameHome && sameAway);
      });
      return [{ ...latestSimulationRow }, ...nextRows].slice(0, 8);
    });
    setMessage("Son simulasyon satiri one cikan oranlar listesine eklendi. Yayina almak icin Kaydet'e bas.");
    setError("");
  };

  const removeOddsRow = (index) => {
    setOddsRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const aiHomeTeamName = String(form.ai_home_team_name || "").trim();
      const aiAwayTeamName = String(form.ai_away_team_name || "").trim();
      if (!aiHomeTeamName || !aiAwayTeamName) {
        throw new Error("AI tahmin merkezi icin ev/deplasman takim adlari zorunlu.");
      }

      const oddHome = Number(form.ai_odd_home);
      const oddDraw = Number(form.ai_odd_draw);
      const oddAway = Number(form.ai_odd_away);
      if (
        !Number.isFinite(oddHome) ||
        !Number.isFinite(oddDraw) ||
        !Number.isFinite(oddAway) ||
        oddHome < 1.01 ||
        oddDraw < 1.01 ||
        oddAway < 1.01
      ) {
        throw new Error("AI 1/X/2 oranlari 1.01 veya daha buyuk olmali.");
      }

      const scoreHomeText = String(form.ai_score_home || "").trim();
      const scoreAwayText = String(form.ai_score_away || "").trim();
      const hasAnyScore = scoreHomeText !== "" || scoreAwayText !== "";
      if (hasAnyScore && (scoreHomeText === "" || scoreAwayText === "")) {
        throw new Error("Skor tahmini girilecekse hem ev hem deplasman skoru dolu olmali.");
      }
      let aiScoreHome = null;
      let aiScoreAway = null;
      if (hasAnyScore) {
        const parsedHome = Number(scoreHomeText);
        const parsedAway = Number(scoreAwayText);
        if (
          !Number.isFinite(parsedHome) ||
          !Number.isFinite(parsedAway) ||
          parsedHome < 0 ||
          parsedAway < 0 ||
          parsedHome > 20 ||
          parsedAway > 20
        ) {
          throw new Error("Skor tahmini 0 ile 20 arasinda olmali.");
        }
        aiScoreHome = Math.trunc(parsedHome);
        aiScoreAway = Math.trunc(parsedAway);
      }

      const kickoffText = String(form.ai_kickoff_at || "").trim();
      let aiKickoffAt = null;
      if (kickoffText) {
        const parsedKickoff = new Date(kickoffText);
        if (Number.isNaN(parsedKickoff.getTime())) {
          throw new Error("AI mac baslangic zamani gecersiz.");
        }
        aiKickoffAt = parsedKickoff.toISOString();
      }

      const bannerPayload = {
        banner_label: String(form.banner_label || "").trim() || "Gunun Yapay Zeka Tahminleri",
        left_image_url: String(form.left_image_url || "").trim() || null,
        right_image_url: String(form.right_image_url || "").trim() || null,
        left_title: String(form.left_title || "").trim() || null,
        left_subtitle: String(form.left_subtitle || "").trim() || null,
        right_title: String(form.right_title || "").trim() || null,
        right_subtitle: String(form.right_subtitle || "").trim() || null,
        ai_home_team_name: aiHomeTeamName,
        ai_away_team_name: aiAwayTeamName,
        ai_kickoff_at: aiKickoffAt,
        ai_odd_home: Number(oddHome.toFixed(2)),
        ai_odd_draw: Number(oddDraw.toFixed(2)),
        ai_odd_away: Number(oddAway.toFixed(2)),
        ai_score_home: aiScoreHome,
        ai_score_away: aiScoreAway,
        ai_insight: String(form.ai_insight || "").trim() || null,
        is_active: true,
      };

      const rowsToSave = (oddsRows || [])
        .map((row) => ({
          fixture_id: row?.fixture_id,
          home_team_name: String(row?.home_team_name || "").trim(),
          away_team_name: String(row?.away_team_name || "").trim(),
          home_team_logo: String(row?.home_team_logo || "").trim(),
          away_team_logo: String(row?.away_team_logo || "").trim(),
          kickoff_at: String(row?.kickoff_at || "").trim(),
          odd_home: String(row?.odd_home || "").trim(),
          odd_draw: String(row?.odd_draw || "").trim(),
          odd_away: String(row?.odd_away || "").trim(),
          model_score_home: String(row?.model_score_home || "").trim(),
          model_score_away: String(row?.model_score_away || "").trim(),
        }))
        .filter(
          (row) =>
            row.home_team_name ||
            row.away_team_name ||
            row.home_team_logo ||
            row.away_team_logo ||
            row.kickoff_at ||
            row.odd_home ||
            row.odd_draw ||
            row.odd_away ||
            row.model_score_home ||
            row.model_score_away
        );

      if (!rowsToSave.length) {
        throw new Error("En az 1 adet one cikan oran satiri girmen gerekiyor.");
      }

      const showcaseRowsPayload = rowsToSave.map((row, index) => {
        if (!row.home_team_name || !row.away_team_name) {
          throw new Error(`Satir ${index + 1}: Ev/deplasman takim adlari zorunlu.`);
        }

        const fixtureId = row.fixture_id == null || row.fixture_id === "" ? null : Number(row.fixture_id);
        if (fixtureId !== null && (!Number.isFinite(fixtureId) || fixtureId <= 0)) {
          throw new Error(`Satir ${index + 1}: Fixture ID gecersiz.`);
        }

        let kickoffAt = null;
        if (row.kickoff_at) {
          const parsedKickoff = new Date(row.kickoff_at);
          if (Number.isNaN(parsedKickoff.getTime())) {
            throw new Error(`Satir ${index + 1}: Mac baslangic zamani gecersiz.`);
          }
          kickoffAt = parsedKickoff.toISOString();
        }

        const oddHome = Number(row.odd_home);
        const oddDraw = Number(row.odd_draw);
        const oddAway = Number(row.odd_away);
        if (
          !Number.isFinite(oddHome) ||
          !Number.isFinite(oddDraw) ||
          !Number.isFinite(oddAway) ||
          oddHome < 1.01 ||
          oddDraw < 1.01 ||
          oddAway < 1.01
        ) {
          throw new Error(`Satir ${index + 1}: Oranlar 1.01 veya daha buyuk olmali.`);
        }

        const scoreHomeText = String(row.model_score_home || "").trim();
        const scoreAwayText = String(row.model_score_away || "").trim();
        const hasAnyScore = scoreHomeText !== "" || scoreAwayText !== "";
        if (hasAnyScore && (scoreHomeText === "" || scoreAwayText === "")) {
          throw new Error(`Satir ${index + 1}: Skor tahmini icin hem ev hem deplasman skoru dolu olmali.`);
        }
        let modelScoreHome = null;
        let modelScoreAway = null;
        if (hasAnyScore) {
          const parsedHome = Number(scoreHomeText);
          const parsedAway = Number(scoreAwayText);
          if (
            !Number.isFinite(parsedHome) ||
            !Number.isFinite(parsedAway) ||
            parsedHome < 0 ||
            parsedAway < 0 ||
            parsedHome > 20 ||
            parsedAway > 20
          ) {
            throw new Error(`Satir ${index + 1}: Skor tahmini 0 ile 20 arasinda olmali.`);
          }
          modelScoreHome = Math.trunc(parsedHome);
          modelScoreAway = Math.trunc(parsedAway);
        }

        return {
          fixture_id: fixtureId !== null ? Math.trunc(fixtureId) : null,
          home_team_name: row.home_team_name,
          away_team_name: row.away_team_name,
          home_team_logo: row.home_team_logo || null,
          away_team_logo: row.away_team_logo || null,
          kickoff_at: kickoffAt,
          odd_home: Number(oddHome.toFixed(2)),
          odd_draw: Number(oddDraw.toFixed(2)),
          odd_away: Number(oddAway.toFixed(2)),
          model_score_home: modelScoreHome,
          model_score_away: modelScoreAway,
          display_order: index,
          is_active: true,
        };
      });

      const [bannerResponse, showcaseResponse] = await Promise.all([
        apiRequest("/admin/odds-banner-settings", {
          method: "PUT",
          body: JSON.stringify(bannerPayload),
        }),
        apiRequest("/admin/showcase/popular_odds", {
          method: "PUT",
          body: JSON.stringify({ rows: showcaseRowsPayload }),
        }),
      ]);

      setForm(normalizeForm(bannerResponse));
      setOddsRows(normalizeShowcaseOddsRows(showcaseResponse));
      setMessage("Gunun Yapay Zeka Tahminleri alani ve one cikan oranlar kaydedildi.");
    } catch (err) {
      setError(err.message || "Kayit sirasinda hata olustu.");
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => {
    const kickoffText = String(form.ai_kickoff_at || "").trim();
    let kickoffLabel = "Mac saati panelden ayarlanabilir";
    if (kickoffText) {
      const parsed = new Date(kickoffText);
      if (!Number.isNaN(parsed.getTime())) {
        kickoffLabel = parsed.toLocaleString("tr-TR");
      }
    }
    const scoreHome = String(form.ai_score_home || "").trim();
    const scoreAway = String(form.ai_score_away || "").trim();
    const scoreText = scoreHome !== "" && scoreAway !== "" ? `${scoreHome} - ${scoreAway}` : "Skor bekleniyor";

    return {
      label: String(form.banner_label || "Gunun Yapay Zeka Tahminleri").trim() || "Gunun Yapay Zeka Tahminleri",
      leftImage: String(form.left_image_url || "").trim() || PREVIEW_LEFT_FALLBACK,
      rightImage: String(form.right_image_url || "").trim() || PREVIEW_RIGHT_FALLBACK,
      leftName: String(form.left_title || "").trim() || "Sol Oyuncu",
      leftSubtitle: String(form.left_subtitle || "").trim() || "Ev sahibi tarafi",
      rightName: String(form.right_title || "").trim() || "Sag Oyuncu",
      rightSubtitle: String(form.right_subtitle || "").trim() || "Deplasman tarafi",
      homeTeamName: String(form.ai_home_team_name || "").trim() || "Ev Sahibi",
      awayTeamName: String(form.ai_away_team_name || "").trim() || "Deplasman",
      kickoffLabel,
      oddHome: normalizeOddInput(form.ai_odd_home, "2.08"),
      oddDraw: normalizeOddInput(form.ai_odd_draw, "3.12"),
      oddAway: normalizeOddInput(form.ai_odd_away, "2.86"),
      scoreText,
      insight: String(form.ai_insight || "").trim(),
    };
  }, [form]);

  if (!authReady) {
    return <DashboardLoadingPage />;
  }

  if (!currentUser) {
    return null;
  }

  const handleGenerateSliderImages = async () => {
    setGeneratingSlider(true);
    setSliderGenResult(null);
    setError("");
    setMessage("");

    try {
      const result = await apiRequest("/admin/slider/generate", {
        method: "POST",
        body: JSON.stringify({ count: 3 }),
      });
      
      setSliderGenResult(result);
      setMessage(`${result.generated} slider görsel başarıyla oluşturuldu!`);
    } catch (err) {
      setError(err.message || "Slider görselleri oluşturulamadı");
    } finally {
      setGeneratingSlider(false);
    }
  };

  const handleGenerateMatchSliderImages = async () => {
    setGeneratingSlider(true);
    setSliderGenResult(null);
    setError("");
    setMessage("");

    try {
      const result = await apiRequest("/admin/slider/generate-with-matches", {
        method: "POST",
      });
      
      setSliderGenResult(result);
      setMessage(`${result.generated} maç bazlı slider görsel başarıyla oluşturuldu!`);
    } catch (err) {
      setError(err.message || "Maç bazlı slider görselleri oluşturulamadı");
    } finally {
      setGeneratingSlider(false);
    }
  };

  const handleGenerateDailyHighlights = async () => {
    setGeneratingHighlights(true);
    setMessage("");
    setError("");

    try {
      const result = await apiRequest("/admin/daily-highlights/generate", {
        method: "POST",
      });

      setMessage(`${result.highlights_count} adet öne çıkan maç başarıyla oluşturuldu!`);
      await loadSettings();
    } catch (err) {
      setError(err.message || "Öne çıkan maçlar oluşturulamadı");
    } finally {
      setGeneratingHighlights(false);
    }
  };

  return (
    <div className="container">
      <section className="card wide">
        <div className="row spread wrap">
          <div>
            <h2>AI İçerik Yönetimi (Superadmin)</h2>
            <p className="help-text">
              Giris yapan kullanicilarin gordugu AI tahmin kartini ve one cikan oranlari buradan yonetebilirsin.
            </p>
          </div>
          <div className="row wrap">
            <ActionButton className="secondary" onClick={() => navigate("/")}>
              Yönetim Ana Sayfasına Dön
            </ActionButton>
            <ActionButton className="secondary" loading={loading} loadingText="Yenileniyor..." onClick={loadSettings}>
              Sunucudan Yenile
            </ActionButton>
            <ActionButton className="accent-gradient" loading={saving} loadingText="Kaydediliyor..." onClick={saveSettings}>
              Kaydet
            </ActionButton>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success-box">{message}</div> : null}

        <div className="card wide" style={{ marginBottom: "24px" }}>
          <h3>🎨 Anasayfa Slider Görselleri (DALL-E 3)</h3>
          <p className="help-text">
            Slider görselleri iki şekilde oluşturulabilir: Genel tasarım veya bugünün maçlarına özel.
          </p>
          <div className="row wrap" style={{ gap: "12px", marginTop: "16px" }}>
            <ActionButton
              className="accent-gradient"
              loading={generatingSlider}
              loadingText="Görseller Oluşturuluyor..."
              onClick={handleGenerateMatchSliderImages}
            >
              🏆 Maç Bazlı Slider Oluştur (Önerilen)
            </ActionButton>
            <ActionButton
              className="secondary"
              loading={generatingSlider}
              loadingText="Görseller Oluşturuluyor..."
              onClick={handleGenerateSliderImages}
            >
              🎨 Genel Tasarım Slider Oluştur
            </ActionButton>
          </div>
          {sliderGenResult && (
            <div className="success-box" style={{ marginTop: "16px" }}>
              <strong>✅ {sliderGenResult.generated} görsel başarıyla oluşturuldu!</strong>
              <div style={{ marginTop: "8px", fontSize: "12px" }}>
                {sliderGenResult.images?.map((img, idx) => (
                  <div key={idx} style={{ marginTop: "4px" }}>
                    Görsel {idx + 1}: {img.url}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="help-text" style={{ marginTop: "16px", fontSize: "12px" }}>
            💡 Maç bazlı görseller: Bugünün en önemli 3 maçını seçer ve her biri için özel tasarım oluşturur (takım isimleri, oranlar, lig bilgisi dahil).<br />
            💡 Genel tasarım: Futbol temalı soyut ve modern görseller oluşturur.<br />
            ⏰ Otomatik: Her gün sabah 06:00'da maç bazlı görseller otomatik oluşturulur.
          </p>
        </div>

        <div className="card wide" style={{ marginBottom: "24px" }}>
          <h3>✨ Günlük Öne Çıkan Maçlar (AI)</h3>
          <p className="help-text">
            Bugünün öne çıkan AI tahminlerini otomatik olarak oluşturur.
          </p>
          <div className="row wrap" style={{ gap: "12px", marginTop: "16px" }}>
            <ActionButton
              className="accent-gradient"
              loading={generatingHighlights}
              loadingText="Öne çıkan maçlar oluşturuluyor..."
              onClick={handleGenerateDailyHighlights}
            >
              ⚡ Öne Çıkanları Oluştur
            </ActionButton>
          </div>
        </div>

        <div className="odds-banner-admin-grid">
          <div className="card">
            <h3>Genel Baslik</h3>
            <input
              placeholder="Baslik (or: Gunun Yapay Zeka Tahminleri)"
              value={form.banner_label}
              onChange={(event) => setForm((prev) => ({ ...prev, banner_label: event.target.value }))}
            />
          </div>

          <div className="card">
            <h3>Sol Gorsel</h3>
            <div className="odds-image-upload-preview">
              <img src={form.left_image_url || PREVIEW_LEFT_FALLBACK} alt="Sol gorsel onizleme" />
            </div>
            <div className="row wrap">
              <label className="guest-upload-input">
                <span>Dosya Sec ve Sol Gorseli Yukle</span>
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("left", event)} />
              </label>
              <ActionButton className="secondary" onClick={() => clearImage("left")}>
                Gorseli Temizle
              </ActionButton>
            </div>
            <p className="help-text">Sol oyuncu gorseli backend'e kaydedilir. URL girmene gerek yok.</p>
            <input
              placeholder="Sol isim"
              value={form.left_title}
              onChange={(event) => setForm((prev) => ({ ...prev, left_title: event.target.value }))}
            />
            <input
              placeholder="Sol alt baslik"
              value={form.left_subtitle}
              onChange={(event) => setForm((prev) => ({ ...prev, left_subtitle: event.target.value }))}
            />
          </div>

          <div className="card">
            <h3>Sag Gorsel</h3>
            <div className="odds-image-upload-preview">
              <img src={form.right_image_url || PREVIEW_RIGHT_FALLBACK} alt="Sag gorsel onizleme" />
            </div>
            <div className="row wrap">
              <label className="guest-upload-input">
                <span>Dosya Sec ve Sag Gorseli Yukle</span>
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("right", event)} />
              </label>
              <ActionButton className="secondary" onClick={() => clearImage("right")}>
                Gorseli Temizle
              </ActionButton>
            </div>
            <p className="help-text">Sag oyuncu gorseli backend'e kaydedilir. URL girmene gerek yok.</p>
            <input
              placeholder="Sag isim"
              value={form.right_title}
              onChange={(event) => setForm((prev) => ({ ...prev, right_title: event.target.value }))}
            />
            <input
              placeholder="Sag alt baslik"
              value={form.right_subtitle}
              onChange={(event) => setForm((prev) => ({ ...prev, right_subtitle: event.target.value }))}
            />
          </div>

          <div className="card wide">
            <h3>AI Mac Tahmini (Orta Alan)</h3>
            <p className="help-text">Bu alan giris yapan kullanicinin ustte gordugu "Gunun Yapay Zeka Tahminleri" kartidir.</p>
            <div className="ai-admin-grid">
              <input
                placeholder="Ev sahibi takim adi"
                value={form.ai_home_team_name}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_home_team_name: event.target.value }))}
              />
              <input
                placeholder="Deplasman takim adi"
                value={form.ai_away_team_name}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_away_team_name: event.target.value }))}
              />
              <input
                type="datetime-local"
                value={form.ai_kickoff_at}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_kickoff_at: event.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                min="1.01"
                placeholder="Ev sahibi oran"
                value={form.ai_odd_home}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_odd_home: event.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                min="1.01"
                placeholder="Beraberlik oran"
                value={form.ai_odd_draw}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_odd_draw: event.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                min="1.01"
                placeholder="Deplasman oran"
                value={form.ai_odd_away}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_odd_away: event.target.value }))}
              />
              <input
                type="number"
                min="0"
                max="20"
                placeholder="Tahmini ev skoru"
                value={form.ai_score_home}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_score_home: event.target.value }))}
              />
              <input
                type="number"
                min="0"
                max="20"
                placeholder="Tahmini deplasman skoru"
                value={form.ai_score_away}
                onChange={(event) => setForm((prev) => ({ ...prev, ai_score_away: event.target.value }))}
              />
            </div>
            <textarea
              placeholder="AI yorumu / notu (or: Ev sahibi baskili baslar, ikinci yari skor bulur)"
              value={form.ai_insight}
              onChange={(event) => setForm((prev) => ({ ...prev, ai_insight: event.target.value }))}
              rows={3}
            />
          </div>

          <div className="card wide">
            <div className="row spread wrap">
              <h3>Bugunun One Cikan Oranlari</h3>
              <div className="row wrap">
                <ActionButton className="secondary" onClick={addLatestSimulationRow} disabled={!latestSimulationRow}>
                  Son Simulasyonu Ekle
                </ActionButton>
                <ActionButton className="secondary" onClick={addOddsRow} disabled={oddsRows.length >= 8}>
                  Manuel Satir Ekle
                </ActionButton>
              </div>
            </div>
            <p className="help-text">Bu oranlar hem anasayfada hem de giris yapmis kullanicinin ust bolumunde gosterilir.</p>
            {latestSimulationRow ? (
              <p className="small-text">
                Son simulasyon: {latestSimulationRow.home_team_name} vs {latestSimulationRow.away_team_name}
              </p>
            ) : (
              <p className="small-text">Once Mac Tahmin Merkezi ekranindan bir mac simule et, sonra buradan tek tikla ekle.</p>
            )}
            <div className="odds-admin-rows">
              {oddsRows.map((row, index) => (
                <div key={`odds-admin-row-${index}`} className="odds-admin-row-wrap">
                  {(row.home_team_logo || row.away_team_logo || row.fixture_id) && (
                    <div className="odds-admin-row-meta">
                      <div className="odds-admin-row-logos">
                        {row.home_team_logo ? (
                          <img src={row.home_team_logo} alt={`${row.home_team_name || "Ev sahibi"} amblem`} />
                        ) : null}
                        {row.away_team_logo ? (
                          <img src={row.away_team_logo} alt={`${row.away_team_name || "Deplasman"} amblem`} />
                        ) : null}
                      </div>
                      {row.fixture_id ? <span className="small-text">Fixture #{row.fixture_id}</span> : null}
                    </div>
                  )}
                  <div className="odds-admin-row">
                    <input
                      placeholder="Ev sahibi"
                      value={row.home_team_name}
                      onChange={(event) => updateOddsRow(index, "home_team_name", event.target.value)}
                    />
                    <input
                      placeholder="Deplasman"
                      value={row.away_team_name}
                      onChange={(event) => updateOddsRow(index, "away_team_name", event.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="1"
                      value={row.odd_home}
                      onChange={(event) => updateOddsRow(index, "odd_home", event.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="X"
                      value={row.odd_draw}
                      onChange={(event) => updateOddsRow(index, "odd_draw", event.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="2"
                      value={row.odd_away}
                      onChange={(event) => updateOddsRow(index, "odd_away", event.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      max="20"
                      placeholder="Skor Ev"
                      value={row.model_score_home}
                      onChange={(event) => updateOddsRow(index, "model_score_home", event.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      max="20"
                      placeholder="Skor Dep"
                      value={row.model_score_away}
                      onChange={(event) => updateOddsRow(index, "model_score_away", event.target.value)}
                    />
                    <ActionButton className="secondary" onClick={() => removeOddsRow(index)} disabled={oddsRows.length <= 1}>
                      Kaldir
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card wide">
        <div className="card pro-odds-banner">
          <article className="pro-player left">
            <img src={preview.leftImage} alt={preview.leftName} />
            <div className="player-caption">
              <strong>{preview.leftName}</strong>
              <span>{preview.leftSubtitle}</span>
            </div>
          </article>

          <div className="pro-odds-center ai-prediction-center">
            <div className="odds-tag">{preview.label}</div>
            <h3>{`${preview.homeTeamName} vs ${preview.awayTeamName}`}</h3>
            <p className="small-text">{preview.kickoffLabel}</p>
            <div className="main-odds-grid ai-main-odds-grid">
              <div className="odd-box ai-odd-box">
                <span>Ev Sahibi Kazanir</span>
                <strong>{preview.oddHome}</strong>
              </div>
              <div className="odd-box ai-odd-box">
                <span>Beraberlik</span>
                <strong>{preview.oddDraw}</strong>
              </div>
              <div className="odd-box ai-odd-box">
                <span>Deplasman Kazanir</span>
                <strong>{preview.oddAway}</strong>
              </div>
            </div>
            <div className="ai-scoreline-box">
              <span>Tahmini Skor</span>
              <strong>{preview.scoreText}</strong>
            </div>
            <div className={`ai-insight-box ${preview.insight ? "" : "muted"}`}>
              {preview.insight || "AI aciklamasi burada gosterilir."}
            </div>
          </div>

          <article className="pro-player right">
            <img src={preview.rightImage} alt={preview.rightName} />
            <div className="player-caption">
              <strong>{preview.rightName}</strong>
              <span>{preview.rightSubtitle}</span>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
