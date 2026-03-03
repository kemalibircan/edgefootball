import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionButton from "../../components/dashboard/ActionButton";
import GoalScorerList from "../../components/dashboard/GoalScorerList";
import MarkdownContent from "../../components/dashboard/MarkdownContent";
import OperationStatus from "../../components/dashboard/OperationStatus";
import StatCard from "../../components/dashboard/StatCard";
import TaskRow from "../../components/dashboard/TaskRow";
import TeamBadge from "../../components/dashboard/TeamBadge";
import AiTokenPackagesSection from "../../components/token/AiTokenPackagesSection";
import LiveScoresWidget from "../../components/home/LiveScoresWidget";

const MAX_SLIDER_IMAGES = 10;
const SLIDER_MAX_INPUT_BYTES = 12 * 1024 * 1024;
const SLIDER_MAX_DIMENSION = 1920;
const SLIDER_EXPORT_TYPE = "image/webp";
const SLIDER_EXPORT_QUALITY = 0.82;

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error("Gecersiz dosya."));
      return;
    }
    if (file.size > SLIDER_MAX_INPUT_BYTES) {
      reject(new Error("Dosya boyutu cok buyuk. Lutfen 12MB altinda bir gorsel sec."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const maxEdge = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
        const scale = maxEdge > SLIDER_MAX_DIMENSION ? SLIDER_MAX_DIMENSION / maxEdge : 1;
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
        let dataUrl = canvas.toDataURL(SLIDER_EXPORT_TYPE, SLIDER_EXPORT_QUALITY);
        if (!dataUrl || dataUrl.length < 20) {
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
    homeWin: odd1.toFixed(2),
    draw: oddX.toFixed(2),
    awayWin: odd2.toFixed(2),
    homeOrDraw: asOdd(n1 + nx),
    homeOrAway: asOdd(n1 + n2),
    drawOrAway: asOdd(nx + n2),
    homeProb: `${(n1 * 100).toFixed(1)}%`,
    drawProb: `${(nx * 100).toFixed(1)}%`,
    awayProb: `${(n2 * 100).toFixed(1)}%`,
  };
}

export default function DashboardAuthenticatedPage({ dashboard }) {
  const {
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
    FIXTURE_DATE_RANGE_LIMITS,
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
    modelCatalog,
    setModelCatalog,
    modelCatalogPage,
    setModelCatalogPage,
    modelCatalogFilter,
    setModelCatalogFilter,
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
    selectedLeague,
    selectedLeagueLabel,
    isManager,
    adminView,
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
    loadTrainingMatches,
    loadDailyPredictions,
    saveCurrentPrediction,
    refreshSavedPredictionResult,
  } = dashboard;

  const customFixtureMinDate = FIXTURE_DATE_RANGE_LIMITS?.minDate || "";
  const customFixtureMaxDate = FIXTURE_DATE_RANGE_LIMITS?.maxDate || "";
  const isCustomFixtureRange = fixtureFilters.day_window === "custom";
  const isSuperAdmin = currentUser?.role === "superadmin";
  const showAdminTools = Boolean(isManager && adminView);
  const showSuperAdminTools = Boolean(isSuperAdmin && adminView);
  const navigate = useNavigate();
  const [aiCommentFixtureId, setAiCommentFixtureId] = useState("");
  const [showInlineAiComment, setShowInlineAiComment] = useState(false);
  const [sliderDraftImages, setSliderDraftImages] = useState(sliderImagesAdmin || []);
  const [sliderUploadMessage, setSliderUploadMessage] = useState("");
  const [sliderUploadError, setSliderUploadError] = useState("");
  const [topSlideIndex, setTopSlideIndex] = useState(0);
  const [expandedOddsRowId, setExpandedOddsRowId] = useState("");
  const showCompactPredictionsCard = !showAdminTools;

  const clampFixtureDate = (value, minDate, maxDate) => {
    const text = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
    if (minDate && text < minDate) return minDate;
    if (maxDate && text > maxDate) return maxDate;
    return text;
  };

  const handleFixtureDayWindowChange = (nextWindow) => {
    setFixtureFilters((prev) => {
      if (nextWindow !== "custom") {
        return { ...prev, day_window: nextWindow };
      }
      const nextFrom = clampFixtureDate(prev.date_from || customFixtureMinDate, customFixtureMinDate, customFixtureMaxDate) || customFixtureMinDate;
      let nextTo =
        clampFixtureDate(prev.date_to || nextFrom, customFixtureMinDate, customFixtureMaxDate) || nextFrom;
      if (nextTo < nextFrom) {
        nextTo = nextFrom;
      }
      return {
        ...prev,
        day_window: nextWindow,
        date_from: nextFrom,
        date_to: nextTo,
      };
    });
  };

  const handleFixtureCustomDateFromChange = (nextDate) => {
    setFixtureFilters((prev) => {
      const nextFrom =
        clampFixtureDate(nextDate || customFixtureMinDate, customFixtureMinDate, customFixtureMaxDate) || customFixtureMinDate;
      let nextTo =
        clampFixtureDate(prev.date_to || nextFrom, customFixtureMinDate, customFixtureMaxDate) || nextFrom;
      if (nextTo < nextFrom) {
        nextTo = nextFrom;
      }
      return {
        ...prev,
        day_window: "custom",
        date_from: nextFrom,
        date_to: nextTo,
      };
    });
  };

  const handleFixtureCustomDateToChange = (nextDate) => {
    setFixtureFilters((prev) => {
      const nextFrom =
        clampFixtureDate(prev.date_from || customFixtureMinDate, customFixtureMinDate, customFixtureMaxDate) || customFixtureMinDate;
      let nextTo =
        clampFixtureDate(nextDate || nextFrom, customFixtureMinDate, customFixtureMaxDate) || nextFrom;
      if (nextTo < nextFrom) {
        nextTo = nextFrom;
      }
      return {
        ...prev,
        day_window: "custom",
        date_from: nextFrom,
        date_to: nextTo,
      };
    });
  };

  const selectedFixtureKey = String(fixtureId || "");
  const hasAiCommentForSelectedFixture =
    !!String(aiCommentary || "").trim() && !!selectedFixtureKey && aiCommentFixtureId === selectedFixtureKey;
  const homeGoalScorers = Array.isArray(simulation?.goal_scorer_predictions?.home_team)
    ? simulation.goal_scorer_predictions.home_team
    : [];
  const awayGoalScorers = Array.isArray(simulation?.goal_scorer_predictions?.away_team)
    ? simulation.goal_scorer_predictions.away_team
    : [];
  const modelComments = Array.isArray(simulation?.key_drivers) ? simulation.key_drivers : [];
  const hasScorelineInsights = topScorelines.length > 0;
  const featuredTopScorelines = hasScorelineInsights ? topScorelines.slice(0, 3) : [];
  const hasFirstGoalInsights = firstGoalDist.length > 0;
  const hasGoalScorerInsights = homeGoalScorers.length > 0 || awayGoalScorers.length > 0;
  const hasModelCommentInsights = modelComments.length > 0;
  const hasAiCommentaryInsights =
    !!String(aiCommentary || "").trim() || aiAnalysisTable.length > 0 || !!aiOddsSummary || !!aiProviderError;
  const selectedModelLabel = simulation?.model?.model_name || "";
  const isFixtureListLoading =
    isLoading("fixtures-load") || isLoading("fixtures-filter") || isLoading("fixtures-filter-reset");
  const topSliderImages = Array.isArray(publicSliderImages) ? publicSliderImages.filter(Boolean) : [];
  const hasTopSlides = topSliderImages.length > 0;
  const topSlideImage = hasTopSlides ? topSliderImages[topSlideIndex] || topSliderImages[0] : "";

  const resolveTodayLocalISO = () => {
    const base = new Date();
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().slice(0, 10);
  };

  const handleRefreshTodayFixturesCache = () => {
    const todayIso = resolveTodayLocalISO();
    queueTask(
      "/admin/tasks/fixtures-cache-refresh",
      {
        date_from: todayIso,
        date_to: todayIso,
        league_ids: null,
      },
      "fixtures-cache-refresh-today",
      "Bugunun mac cache'i yenileniyor"
    );
  };

  const aiCommentActionLabel = hasAiCommentForSelectedFixture
    ? showInlineAiComment
      ? "Yorumu Gizle"
      : "Olusturuldu - Yorumu Goster"
    : `AI Yorumu Olustur (${AI_COMMENTARY_CREDIT_COST} Kredi)`;

  const aiCommentActionTip = hasAiCommentForSelectedFixture
    ? showInlineAiComment
      ? "Olusturulan AI yorum kutusunu gizler."
      : "Olusturulan AI yorumunu kutu icinde gosterir."
    : "Secili mac icin AI destekli oran yorumunu olusturur. Bu islem kredi tuketir.";

  const handleAiCommentAction = async () => {
    if (!selectedFixtureKey) return;
    if (hasAiCommentForSelectedFixture) {
      setShowInlineAiComment((prev) => !prev);
      return;
    }

    const result = await runAiCommentary();
    if (result?.ok && String(result?.data?.commentary || "").trim()) {
      setAiCommentFixtureId(selectedFixtureKey);
      setShowInlineAiComment(false);
    }
  };

  useEffect(() => {
    if (!String(aiCommentary || "").trim()) {
      setAiCommentFixtureId("");
      setShowInlineAiComment(false);
    }
  }, [aiCommentary]);

  useEffect(() => {
    setShowInlineAiComment(false);
  }, [selectedFixtureKey]);

  useEffect(() => {
    setSliderDraftImages(Array.isArray(sliderImagesAdmin) ? sliderImagesAdmin.slice(0, MAX_SLIDER_IMAGES) : []);
  }, [sliderImagesAdmin]);

  useEffect(() => {
    if (!hasTopSlides) return;
    const timer = window.setInterval(() => {
      setTopSlideIndex((prev) => (prev + 1) % topSliderImages.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, [hasTopSlides, topSliderImages.length]);

  useEffect(() => {
    if (!topSliderImages.length) {
      setTopSlideIndex(0);
      return;
    }
    if (topSlideIndex >= topSliderImages.length) {
      setTopSlideIndex(0);
    }
  }, [topSlideIndex, topSliderImages.length]);

  const handleSliderUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      setSliderUploadError("Sadece gorsel dosyalari yuklenebilir.");
      setSliderUploadMessage("");
      return;
    }

    const remaining = Math.max(0, MAX_SLIDER_IMAGES - sliderDraftImages.length);
    if (remaining <= 0) {
      setSliderUploadError(`En fazla ${MAX_SLIDER_IMAGES} gorsel ekleyebilirsin.`);
      setSliderUploadMessage("");
      return;
    }

    const selectedFiles = imageFiles.slice(0, remaining);
    try {
      const encoded = await Promise.all(selectedFiles.map((file) => fileToDataURL(file)));
      const nextDraftImages = [...sliderDraftImages, ...encoded].slice(0, MAX_SLIDER_IMAGES);
      setSliderDraftImages(nextDraftImages);
      setSliderUploadError("");
      setSliderUploadMessage(`${encoded.length} gorsel eklendi, yayinlaniyor...`);

      const ok = await saveSliderImages(nextDraftImages);
      if (!ok) {
        setSliderUploadError("Gorseller yayina alinamadi. Lutfen dosya boyutlarini kontrol edip tekrar dene.");
        setSliderUploadMessage("");
        return;
      }

      await loadSliderImages(true);
      setSliderUploadError("");
      setSliderUploadMessage(`${encoded.length} gorsel eklendi ve yayinlandi.`);
    } catch (err) {
      setSliderUploadError(err.message || "Yukleme sirasinda hata olustu.");
      setSliderUploadMessage("");
    }
  };

  const removeSliderDraftImage = (index) => {
    setSliderDraftImages((prev) => prev.filter((_, idx) => idx !== index));
    setSliderUploadMessage("Gorsel taslaktan kaldirildi.");
    setSliderUploadError("");
  };

  const saveSliderDraftImages = async () => {
    const ok = await saveSliderImages(sliderDraftImages);
    if (!ok) return;
    await loadSliderImages(true);
    setSliderUploadError("");
    setSliderUploadMessage("Slider gorselleri yayinlandi.");
  };

  const resetSliderToDefaults = async () => {
    const ok = await saveSliderImages([]);
    if (!ok) return;
    await loadSliderImages(true);
    setSliderUploadError("");
    setSliderUploadMessage("Varsayilan slider gorsellerine donuldu.");
  };

  return (
    <div className="container">
      <LiveScoresWidget apiBase={API_BASE} />
   
      <section className="card guest-betting-hero">
        <div className="guest-hero-grid guest-hero-grid-featured">
          <div className="guest-slider-showcase">
            <div className="guest-slider-stage" style={{ backgroundImage: `url(${topSlideImage})` }}>
              <div className="guest-slider-overlay" />
              <div className="guest-slider-content">
                <div className="guest-slider-controls">
                  <button
                    type="button"
                    className="guest-slider-btn"
                    onClick={() => setTopSlideIndex((prev) => (prev - 1 + topSliderImages.length) % topSliderImages.length)}
                    disabled={!hasTopSlides}
                  >
                    Geri
                  </button>
                  <button
                    type="button"
                    className="guest-slider-btn"
                    onClick={() => setTopSlideIndex((prev) => (prev + 1) % topSliderImages.length)}
                    disabled={!hasTopSlides}
                  >
                    Ileri
                  </button>
                </div>
              </div>
            </div>
            <div className="guest-slider-dots">
              {topSliderImages.map((_, index) => (
                <button
                  key={`auth-top-slide-dot-${index}`}
                  type="button"
                  className={`guest-slider-dot ${index === topSlideIndex ? "active" : ""}`}
                  onClick={() => setTopSlideIndex(index)}
                />
              ))}
            </div>
          </div>

          <div className="guest-odds-wall guest-odds-wall-featured">
            <div className="odds-board-title">Bugunun One Cikan Yapay Zeka Kazanma Oranlari</div>
            <div className="odds-board-head">
              <span>Mac</span>
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
                <React.Fragment key={`auth-top-odds-${row.id}`}>
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
            {featuredTopScorelines.length ? (
              <div className="odds-scoreline-summary">
                <div className="odds-scoreline-title">Yapay Zekanin En Yuksek Oranli Skor Tahminleri</div>
                {featuredTopScorelines.map((item) => (
                  <div key={`auth-top-scoreline-${item.score}`} className="odds-scoreline-row">
                    <span>{item.score}</span>
                    <strong>{asPercent(item.probability)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card pro-odds-banner">
        <article className="pro-player left">
          <img src={PLAYER_SHOWCASE.left.image} alt={PLAYER_SHOWCASE.left.name} />
          <div className="player-caption">
            <strong>{PLAYER_SHOWCASE.left.name}</strong>
            <span>{PLAYER_SHOWCASE.left.subtitle}</span>
          </div>
        </article>

        <div className="pro-odds-center ai-prediction-center">
          <div className="odds-tag">{oddsBannerSettings?.banner_label || "Gunun Yapay Zeka Tahminleri"}</div>
          <h3>{`${aiPredictionCenter.home_team_name} vs ${aiPredictionCenter.away_team_name}`}</h3>
          <p className="small-text">
            {aiPredictionCenter.kickoff_at ? formatDate(aiPredictionCenter.kickoff_at) : "Mac saati bekleniyor"}
          </p>
          <div className="main-odds-grid ai-main-odds-grid">
            <div className="odd-box ai-odd-box">
              <span>Ev Sahibi Kazanir</span>
              <strong>{aiPredictionCenter.odd_home}</strong>
            </div>
            <div className="odd-box ai-odd-box">
              <span>Beraberlik</span>
              <strong>{aiPredictionCenter.odd_draw}</strong>
            </div>
            <div className="odd-box ai-odd-box">
              <span>Deplasman Kazanir</span>
              <strong>{aiPredictionCenter.odd_away}</strong>
            </div>
          </div>
          <div className="ai-scoreline-box">
            <span>Tahmini Skor</span>
            <strong>{aiPredictionCenter.score_text}</strong>
          </div>
          <div className={`ai-insight-box ${aiPredictionCenter.insight ? "" : "muted"}`}>
            {aiPredictionCenter.insight || "AI aciklamasi superadmin panelinden guncellenebilir."}
          </div>
        </div>

        <article className="pro-player right">
          <img src={PLAYER_SHOWCASE.right.image} alt={PLAYER_SHOWCASE.right.name} />
          <div className="player-caption">
            <strong>{PLAYER_SHOWCASE.right.name}</strong>
            <span>{PLAYER_SHOWCASE.right.subtitle}</span>
          </div>
        </article>
      </section>

      {error ? <div className="error">{error}</div> : null}

      {showPackages || Number(currentUser?.credits || 0) <= 0 ? (
        <section className="grid">
          <div className="card wide package-zone in-app">
            <AiTokenPackagesSection
              title="AI Token Satin Alma"
              description={
                <>
                  Mevcut kredi: <strong>{currentUser.credits}</strong>. AI yorumu icin her sorguda 10 kredi duser.
                </>
              }
              packages={CREDIT_PACKAGES}
              wallets={PAYMENT_WALLETS}
              copiedWallet={copiedWallet}
              onCopyWallet={copyWalletAddress}
              headerAction={
                <ActionButton className="accent-gradient" onClick={() => setShowPackages((prev) => !prev)}>
                  {showPackages ? "Paneli Gizle" : "Paneli Ac"}
                </ActionButton>
              }
            />
            <h3>Odeme Bildirimi (Gonderdim)</h3>
            <p className="help-text">
              Odemeyi tamamladiktan sonra transaction id bilgisini buradan gonder. Ayrica Telegram uzerinden admin
              ekibine iletmen sureci hizlandirir.
            </p>
            <OperationStatus op={operationFor("payments-notify")} />
            <div className="row wrap">
              <select
                value={paymentForm.package_key}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, package_key: e.target.value }))}
              >
                {CREDIT_PACKAGES.map((pack) => (
                  <option key={`payment-package-${pack.key}`} value={pack.key}>
                    {pack.title} - {pack.price_tl} TL
                  </option>
                ))}
              </select>
              <select value={paymentForm.chain} onChange={(e) => setPaymentForm((prev) => ({ ...prev, chain: e.target.value }))}>
                <option value="solana">Solana</option>
                <option value="ethereum">Ethereum</option>
              </select>
            </div>
            <div className="row wrap">
              <input
                placeholder="Transaction ID (zorunlu)"
                value={paymentForm.transaction_id}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, transaction_id: e.target.value }))}
              />
              <input
                placeholder="Telegram kullanici adin (or: @username)"
                value={paymentForm.telegram_contact}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, telegram_contact: e.target.value }))}
              />
            </div>
            <div className="row wrap">
              <input
                placeholder="Not (opsiyonel)"
                value={paymentForm.note}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))}
              />
              <ActionButton loading={isLoading("payments-notify")} loadingText="Gonderiliyor..." onClick={submitPaymentNotice}>
                Gonderdim
              </ActionButton>
            </div>
          </div>
      </section>
      ) : null}

      {showAdminTools ? (
      <section className="grid stats">
        <StatCard label="Raw Fixture" value={overview?.raw_fixture_count ?? "-"} />
        <StatCard label="Feature Satiri" value={overview?.feature_count ?? "-"} />
        <StatCard label="Etiketli Satir" value={overview?.labeled_feature_count ?? "-"} />
        <StatCard label="Model Sayisi" value={overview?.model_count ?? "-"} />
        <StatCard label="Aktif Model" value={overview?.active_model_name ?? "-"} />
        <StatCard label="Aktif Model Egitim Satiri" value={overview?.model_meta?.rows_used ?? "-"} />
      </section>
      ) : null}

    

      {!showAdminTools ? (
        <section className="grid">
          <div className="card wide">
            <h2>Hizli Kullanim Rehberi</h2>
            <p className="help-text">Sistemi kullanmak icin teknik bilgi gerekmez. Asagidaki adimlari takip etmen yeterli:</p>
            <ol className="list">
              <li>Soldan mac sec.</li>
              <li>\"Simulasyonu Calistir\" ile olasiliklari gor.</li>
              <li>\"AI Oran Yorumu\" ile detayli yorum al ve kredini takip et.</li>
            </ol>
          </div>
        </section>
      ) : null}

      <section className="grid actions">
        {showAdminTools ? (
        <>
        <div className="card">
          <h2>Bugunun Mac Cache'i</h2>
          <p className="help-text">
            SportMonks'tan bugunun maclarini cekip fixture cache tablosuna kaydeder. Public sayfalarda bugun icin bu
            cache kullanilir.
          </p>
          <OperationStatus op={operationFor("fixtures-cache-refresh-today")} />
          <ActionButton
            loading={isLoading("fixtures-cache-refresh-today")}
            loadingText="Cache yenileniyor..."
            onClick={handleRefreshTodayFixturesCache}
            disabled={isLoading("fixtures-cache-refresh-today")}
          >
            Bugunun Maclarini Yenile (SportMonks)
          </ActionButton>
        </div>

        <div className="card">
          <h2>{selectedLeagueLabel} Veri Havuzu (2000 hedef)</h2>
          <p className="help-text">
            Bu task secili ligin gecmis maclarini toplar. 2000+ mac cekerek modeli daha genis veride egitmek icin tasarlandi.
          </p>
          <OperationStatus op={operationFor("task-ingest-history")} />
          <div className="row">
            <input
              type="number"
              value={historyTarget}
              onChange={(e) => setHistoryTarget(e.target.value)}
              placeholder="hedef mac sayisi"
            />
            <ActionButton
              loading={isLoading("task-ingest-history")}
              loadingText="Task olusturuluyor..."
              onClick={() =>
                queueTask(
                  "/admin/tasks/ingest-league-history",
                  {
                    target_count: historyTarget ? Number(historyTarget) : 2000,
                    league_id: Number(selectedLeagueId),
                  },
                  "task-ingest-history",
                  `${selectedLeagueLabel} gecmis ingest taski kuyruga aliniyor`
                )
              }
            >
              Lig Gecmis Ingest Task
            </ActionButton>
          </div>
        </div>

        <div className="card">
          <h2>Tarih Bazli Ingest (opsiyonel)</h2>
          <p className="help-text">Belirli tarih araligi icin manuel ingest task baslatir.</p>
          <OperationStatus op={operationFor("task-ingest-date")} />
          <div className="row">
            <input
              type="date"
              value={ingestForm.start_date}
              onChange={(e) => setIngestForm((p) => ({ ...p, start_date: e.target.value }))}
            />
            <input
              type="date"
              value={ingestForm.end_date}
              onChange={(e) => setIngestForm((p) => ({ ...p, end_date: e.target.value }))}
            />
            <input
              type="number"
              value={ingestForm.league_id}
              onChange={(e) => setIngestForm((p) => ({ ...p, league_id: e.target.value }))}
              placeholder="Lig ID"
            />
          </div>
          <ActionButton
            loading={isLoading("task-ingest-date")}
            loadingText="Task olusturuluyor..."
            onClick={() =>
              queueTask(
                "/admin/tasks/ingest",
                {
                  start_date: ingestForm.start_date,
                  end_date: ingestForm.end_date,
                  league_id: ingestForm.league_id ? Number(ingestForm.league_id) : null,
                },
                "task-ingest-date",
                "Tarih bazli ingest taski kuyruga aliniyor"
              )
            }
          >
            Tarih Ingest Task
          </ActionButton>
        </div>

        <div className="card">
          <h2>Feature Build</h2>
          <p className="help-text">
            Ham fixture JSON verisini model feature tablosuna cevirir. Model eklemeden once bunu calistir.
          </p>
          <OperationStatus op={operationFor("task-features", "overview-refresh-metrics")} />
          <div className="row">
            <ActionButton
              loading={isLoading("task-features")}
              loadingText="Task olusturuluyor..."
              onClick={() => queueTask("/admin/tasks/features", {}, "task-features", "Feature build taski kuyruga aliniyor")}
            >
              Feature Build Task
            </ActionButton>
            <ActionButton
              className="secondary"
              loading={isLoading("overview-refresh-metrics")}
              loadingText="Yenileniyor..."
              onClick={() => loadOverview("overview-refresh-metrics")}
            >
              Metrikleri Yenile
            </ActionButton>
          </div>
        </div>
        </>
        ) : null}

        <div className="card wide">
          <h2>Mac Tahmin Merkezi</h2>
          <p className="help-text">
            Hazir filtrelerle (Bugun, Yarin, Bu Hafta) hizli secim yapabilir veya bugunden itibaren en fazla 2 haftalik
            ozel tarih araligi belirleyebilirsin. Her sorguda en fazla 25 mac gosterilir.
          </p>
          <div className="grid two-col fixture-center">
            <div>
              <OperationStatus
                op={operationFor(
                  "fixtures-load",
                  "fixtures-filter",
                  "fixtures-filter-reset"
                )}
              />
              <div className="row">
                <input
                  placeholder="Takim veya mac ara (or: Besiktas)"
                  value={fixtureFilters.q}
                  onChange={(e) => setFixtureFilters((prev) => ({ ...prev, q: e.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyFixtureFilters();
                    }
                  }}
                />
              </div>
              <div className="row">
                <select
                  value={fixtureFilters.day_window || "this_week"}
                  onChange={(e) => handleFixtureDayWindowChange(e.target.value)}
                >
                  {FIXTURE_DAY_WINDOW_OPTIONS.map((opt) => (
                    <option key={`fixture-window-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={fixtureFilters.league_id || "all"}
                  onChange={(e) => setFixtureFilters((prev) => ({ ...prev, league_id: e.target.value }))}
                >
                  <option value="all">Tum Ligler</option>
                  {LEAGUE_OPTIONS.map((league) => (
                    <option key={`fixture-league-${league.id}`} value={String(league.id)}>
                      {league.label} ({league.id})
                    </option>
                  ))}
                </select>
              </div>
              {isCustomFixtureRange ? (
                <div className="row">
                  <input
                    type="date"
                    min={customFixtureMinDate}
                    max={customFixtureMaxDate}
                    value={fixtureFilters.date_from || customFixtureMinDate}
                    onChange={(e) => handleFixtureCustomDateFromChange(e.target.value)}
                  />
                  <input
                    type="date"
                    min={customFixtureMinDate}
                    max={customFixtureMaxDate}
                    value={fixtureFilters.date_to || fixtureFilters.date_from || customFixtureMinDate}
                    onChange={(e) => handleFixtureCustomDateToChange(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="row">
                <select
                  value={fixtureFilters.sort}
                  onChange={(e) => setFixtureFilters((prev) => ({ ...prev, sort: e.target.value }))}
                >
                  <option value="asc">Saati Yakin Olanlar</option>
                  <option value="desc">Saati Uzak Olanlar</option>
                </select>
              </div>
              <p className="small-text">
                Not: Ozel tarih seciminde sadece {customFixtureMinDate} - {customFixtureMaxDate} araligi kullanilir.
              </p>
              <div className="row">
                <ActionButton loading={isLoading("fixtures-filter")} loadingText="Filtreleniyor..." onClick={applyFixtureFilters}>
                  Filtrele
                </ActionButton>
                <ActionButton
                  className="secondary"
                  loading={isLoading("fixtures-filter-reset")}
                  loadingText="Sifirlaniyor..."
                  onClick={resetFixtureFilters}
                >
                  Sifirla
                </ActionButton>
              </div>

              <div className="fixture-list">
                {(fixtureCatalog.items || []).map((item) => (
                  <div
                    key={`fixture-${item.fixture_id}`}
                    className={`fixture-row ${String(item.fixture_id) === String(fixtureId) ? "selected" : ""}`}
                  >
                    <div>
                      <div className="fixture-teams">
                        <TeamBadge logo={item.home_team_logo} name={item.home_team_name} small />
                        <span className="vs-chip">vs</span>
                        <TeamBadge logo={item.away_team_logo} name={item.away_team_name} small />
                      </div>
                      <div className="small-text">{formatDate(item.starting_at)}</div>
                    </div>
                    <ActionButton onClick={() => setFixtureId(String(item.fixture_id))}>Maci Sec</ActionButton>
                  </div>
                ))}
                {!fixtureCatalog.items?.length ? (
                  <p className="small-text">{isFixtureListLoading ? "Mac listesi yukleniyor..." : "Bu filtrede mac bulunamadi."}</p>
                ) : null}
              </div>

              <div className="row spread wrap">
                <span className="small-text">
                  Toplam {fixtureCatalog.total || 0} mac bulundu. Listede sadece ilk 25 mac gosterilir.
                </span>
              </div>
            </div>

            <div className="ai-analysis-panel">
              <div>
                <h3>AI Mac Analizi</h3>
                <p className="help-text">
                  Bu panelden secili mac icin once simulasyon, sonra yapay zeka yorumu uretebilirsin. Sonucta tahmini
                  kaydederek gunluk performans takibi yapabilirsin.
                </p>
              </div>

              <div className="ai-info-grid">
                <article className="ai-info-card">
                  <h4>1. Mac Sec</h4>
                  <p>Soldaki listeden bir mac secmeden simulasyon ve AI yorumu calismaz.</p>
                </article>
                <article className="ai-info-card">
                  <h4>2. Simulasyonu Calistir</h4>
                  <p>1X2 olasiliklari ve beklenen gol degerlerini olasiliksal olarak hesaplar.</p>
                </article>
                <article className="ai-info-card">
                  <h4>3. AI Yorumu Al</h4>
                  <p>Model ciktilarini oran perspektifiyle yorumlar. Detayli metin asagidaki rapora yazilir.</p>
                </article>
              </div>

              <OperationStatus op={operationFor("simulate", "ai-commentary", "prediction-save")} />

              {selectedFixture ? (
                <div className="fixture-selected-box">
                  <div className="small-text">Fixture ID: {selectedFixture.fixture_id}</div>
                  <div className="fixture-teams selected">
                    <TeamBadge logo={selectedFixture.home_team_logo} name={selectedFixture.home_team_name} />
                    <span className="vs-chip">vs</span>
                    <TeamBadge logo={selectedFixture.away_team_logo} name={selectedFixture.away_team_name} />
                  </div>
                  <div className="small-text">Tarih: {formatDate(selectedFixture.starting_at)}</div>
                </div>
              ) : (
                <div className="ai-empty-state">Devam etmek icin soldaki listeden bir mac sec.</div>
              )}

              <p className="small-text">Model secimi otomatik yapiliyor (Lig bazli profesyonel model).</p>
              {selectedModelLabel ? (
                <p className="small-text">
                  Kullanilan model: <strong>{selectedModelLabel}</strong>
                </p>
              ) : null}

              <div className="ai-action-row">
                <span className="tooltip-wrap" data-tip="Secili mac icin Monte Carlo simulasyonu calistirir ve olasiliklari hesaplar.">
                  <ActionButton
                    loading={isLoading("simulate")}
                    loadingText="Simule ediliyor..."
                    disabled={!fixtureId}
                    onClick={() => runSimulation()}
                  >
                    Simulasyonu Calistir ({SIMULATION_CREDIT_COST} Kredi)
                  </ActionButton>
                </span>
                <span className="tooltip-wrap" data-tip={aiCommentActionTip}>
                  <ActionButton
                    loading={isLoading("ai-commentary")}
                    loadingText="AI yorum hazirlaniyor..."
                    disabled={!fixtureId || isLoading("simulate")}
                    className={hasAiCommentForSelectedFixture ? "accent-gradient" : ""}
                    onClick={handleAiCommentAction}
                  >
                    {aiCommentActionLabel}
                  </ActionButton>
                </span>
              </div>

              {hasAiCommentForSelectedFixture && !showInlineAiComment ? (
                <div className="ai-inline-note">
                  AI yorumu olusturuldu. Butona tekrar basarak yorumu kutu icinde gorebilirsin.
                </div>
              ) : null}

              {showInlineAiComment && hasAiCommentForSelectedFixture ? (
                <div className="ai-comment-preview">
                  <div className="row spread wrap">
                    <strong>AI Yorumu</strong>
                    {aiProvider ? <span className="small-text">Kaynak: {aiProvider}</span> : null}
                  </div>
                  <MarkdownContent content={aiCommentary} className="ai-box" />
                  {aiProviderError ? <p className="small-text">AI notu: {aiProviderError}</p> : null}
                </div>
              ) : null}

              <div className="row">
                <input
                  placeholder="Tahmin notu (opsiyonel, or: derbi oncesi tahmin)"
                  value={predictionNote}
                  onChange={(e) => setPredictionNote(e.target.value)}
                />
              </div>

              <div className="ai-action-row">
                <span className="tooltip-wrap" data-tip="Mevcut simulasyon ve AI sonucunu gunluk kayit listesine ekler.">
                  <ActionButton
                    loading={isLoading("prediction-save")}
                    loadingText="Kaydediliyor..."
                    disabled={!fixtureId}
                    onClick={saveCurrentPrediction}
                  >
                    Maci Tahmin Olarak Kaydet
                  </ActionButton>
                </span>
              </div>

              {simulation ? (
                <div className="simulate-output">
                  <strong>Simulasyon Ozeti</strong>
                  <div>
                    1X2: Ev {asPercent(simulation.outcomes.home_win)} / Beraberlik {asPercent(simulation.outcomes.draw)} /
                    Deplasman {asPercent(simulation.outcomes.away_win)}
                  </div>
                  <div>Beklenen gol (lambda): {simulation.lambda_home.toFixed(2)} - {simulation.lambda_away.toFixed(2)}</div>
                  <p className="small-text">Ornek: 0.122 = bu sonucun simulasyonlarin %12.2'sinde olustugu anlamina gelir.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid details">
        {showAdminTools ? (
        <div className="card">
          <h2>Task Durumu</h2>
          {tasks.length === 0 ? <p>Henuz task yok.</p> : null}
          {tasks.map((task) => (
            <TaskRow
              key={task.task_id}
              task={task}
              refreshTask={refreshTask}
              refreshing={isLoading(`task-refresh-${task.task_id}`)}
              progress={taskProgress(task)}
              stage={taskStage(task)}
            />
          ))}
        </div>
        ) : null}

        <div className="card wide">
          <h2>{selectedLeagueLabel} - Gunluk Kaydedilen AI Tahminleri</h2>
          <p className="help-text">
            Mac baslamadan once kaydettigin tahminleri gun gun saklar. Mac bittiginde sonucu cekip dogru/yanlis kontrolu
            yapabilirsin.
          </p>
          <OperationStatus
            op={operationFor(
              "predictions-load",
              "predictions-load-after-save",
              "predictions-load-refresh",
              "predictions-page-prev",
              "predictions-page-next"
            )}
          />
          <div className="row">
            <input
              type="date"
              value={savedPredictionsDay}
              onChange={(e) => setSavedPredictionsDay(e.target.value)}
            />
            <ActionButton
              loading={isLoading("predictions-load")}
              loadingText="Yukleniyor..."
              onClick={() =>
                loadDailyPredictions({
                  day: savedPredictionsDay,
                  page: 1,
                  autoRefreshResults: false,
                  opKey: "predictions-load",
                })
              }
            >
              Gunluk Listele
            </ActionButton>
            <ActionButton
              className="secondary"
              loading={isLoading("predictions-load-refresh")}
              loadingText="Kontrol ediliyor..."
              onClick={() =>
                loadDailyPredictions({
                  day: savedPredictionsDay,
                  page: savedPredictions.page || 1,
                  autoRefreshResults: true,
                  opKey: "predictions-load-refresh",
                })
              }
            >
              Sonuclari Kontrol Et
            </ActionButton>
          </div>
          <p className="small-text">
            Toplam {savedPredictions.total || 0} kayit | Sayfa {savedPredictions.page || 1}/
            {savedPredictions.total_pages || 1}
          </p>
          {showCompactPredictionsCard ? (
            <>
              {savedPredictions.items?.length ? (
                <div className="list">
                  {savedPredictions.items.slice(0, 3).map((item) => (
                    <div key={`pred-compact-${item.id}`} className="row spread wrap">
                      <span>{item.match_label || "-"}</span>
                      <span className="small-text">
                        Tahmin: {outcomeLabel(item.prediction_outcome)} | Durum:{" "}
                        {item.status === "settled" ? (item.is_correct ? "Doğru" : "Yanlış") : "Bekleniyor"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Bu güne ait kayıtlı tahmin bulunamadı.</p>
              )}
              <div className="row">
                <ActionButton className="secondary" onClick={() => navigate("/ai-tahminlerim")}>
                  Tümünü Tahminlerim sayfasında gör
                </ActionButton>
              </div>
            </>
          ) : (
            <>
              {savedPredictions.items?.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Mac</th>
                      <th>Tahmin 1X2</th>
                      <th>Gercek Sonuc</th>
                      <th>Durum</th>
                      <th>Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedPredictions.items.map((item) => (
                      <tr key={`pred-${item.id}`}>
                        <td>{formatDate(item.prediction_created_at)}</td>
                        <td>
                          {fixtureLookup.get(String(item.fixture_id)) ? (
                            <div className="fixture-teams inline">
                              <TeamBadge
                                logo={fixtureLookup.get(String(item.fixture_id))?.home_team_logo}
                                name={fixtureLookup.get(String(item.fixture_id))?.home_team_name}
                                small
                              />
                              <span className="vs-chip">vs</span>
                              <TeamBadge
                                logo={fixtureLookup.get(String(item.fixture_id))?.away_team_logo}
                                name={fixtureLookup.get(String(item.fixture_id))?.away_team_name}
                                small
                              />
                            </div>
                          ) : (
                            item.match_label
                          )}
                          <div className="small-text">{item.model_name || item.model_id || "-"}</div>
                          {item.note ? <div className="small-text">Not: {item.note}</div> : null}
                        </td>
                        <td>
                          Ev {asPercent(item.predicted_home_win)} / Ber. {asPercent(item.predicted_draw)} / Dep.{" "}
                          {asPercent(item.predicted_away_win)}
                          <div className="small-text">Tahmin: {outcomeLabel(item.prediction_outcome)}</div>
                        </td>
                        <td>
                          {item.actual_home_goals ?? "-"} - {item.actual_away_goals ?? "-"}
                          <div className="small-text">Sonuc: {outcomeLabel(item.actual_outcome)}</div>
                        </td>
                        <td>
                          {item.status === "settled" ? (item.is_correct ? "Dogru" : "Yanlis") : "Bekleniyor"}
                        </td>
                        <td>
                          <ActionButton
                            loading={isLoading(`prediction-refresh-${item.id}`)}
                            loadingText="Kontrol..."
                            onClick={() => refreshSavedPredictionResult(item.id)}
                          >
                            Guncelle
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>Bu gune ait kayitli tahmin bulunamadi.</p>
              )}
              <div className="row">
                <ActionButton
                  loading={isLoading("predictions-page-prev")}
                  loadingText="Yukleniyor..."
                  disabled={(savedPredictions.page || 1) <= 1}
                  onClick={() =>
                    loadDailyPredictions({
                      day: savedPredictionsDay,
                      page: Math.max(1, (savedPredictions.page || 1) - 1),
                      autoRefreshResults: false,
                      opKey: "predictions-page-prev",
                    })
                  }
                >
                  Onceki Sayfa
                </ActionButton>
                <ActionButton
                  loading={isLoading("predictions-page-next")}
                  loadingText="Yukleniyor..."
                  disabled={(savedPredictions.page || 1) >= (savedPredictions.total_pages || 1)}
                  onClick={() =>
                    loadDailyPredictions({
                      day: savedPredictionsDay,
                      page: (savedPredictions.page || 1) + 1,
                      autoRefreshResults: false,
                      opKey: "predictions-page-next",
                    })
                  }
                >
                  Sonraki Sayfa
                </ActionButton>
              </div>
            </>
          )}
        </div>

        {hasScorelineInsights ? (
          <div className="card insight-reveal" style={{ "--reveal-delay": "30ms" }}>
            <h2>Top 10 Skor Olasiligi</h2>
            <p className="help-text">Yuzdeler 10.000 kosuluk simulasyon frekansidir.</p>
            {topScorelines.map((item) => (
              <div key={item.score} className="row spread">
                <span>{item.score}</span>
                <span>{asPercent(item.probability)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {hasFirstGoalInsights ? (
          <div className="card insight-reveal" style={{ "--reveal-delay": "90ms" }}>
            <h2>Ilk Gol Dakikasi (Top 10)</h2>
            {firstGoalDist.map((item) => (
              <div key={item.minute} className="row spread">
                <span>{item.minute}. dk</span>
                <span>{asPercent(item.probability)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {hasGoalScorerInsights ? (
          <div className="card wide insight-reveal" style={{ "--reveal-delay": "140ms" }}>
            <h2>Muhtemel Golculer</h2>
            <p className="help-text">
              Oyuncu olasiliklari lineup, formasyon pozisyonu ve takim beklenen golu (lambda) uzerinden olasiliksal hesaplanir.
            </p>
            <div className="grid two-col">
              <GoalScorerList title="Ev Takim" items={homeGoalScorers} />
              <GoalScorerList title="Deplasman" items={awayGoalScorers} />
            </div>
          </div>
        ) : null}

        {hasModelCommentInsights ? (
          <div className="card insight-reveal" style={{ "--reveal-delay": "180ms" }}>
            <h2>Model Yorumlari</h2>
            <ul className="list">
              {modelComments.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {hasAiCommentaryInsights ? (
          <div className="card wide insight-reveal" style={{ "--reveal-delay": "230ms" }}>
            <h2>AI Mac ve Oran Yorumu</h2>
            <p className="help-text">
              Bu alan secilen modelin olasiliklarini, oranlari ve guncel sakatlik/lineup/hava/hakem verilerini birlikte yorumlar.
            </p>
            {aiCommentary ? <MarkdownContent content={aiCommentary} className="ai-box" /> : null}
            {aiProvider ? <p className="small-text">Yorum kaynagi: {aiProvider}</p> : null}
            {aiProviderError ? <p className="small-text">AI notu: {aiProviderError}</p> : null}
            {aiAnalysisTable.length ? (
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>Metrik</th>
                    <th>Ev</th>
                    <th>Ber.</th>
                    <th>Dep.</th>
                    <th>Not</th>
                  </tr>
                </thead>
                <tbody>
                  {aiAnalysisTable.map((row, idx) => (
                    <tr key={`${row.metric}-${idx}`}>
                      <td>{row.metric}</td>
                      <td>{row.home}</td>
                      <td>{row.draw}</td>
                      <td>{row.away}</td>
                      <td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {aiOddsSummary ? (
              <div className="row spread wrap">
                <span>
                  Piyasa Ev: {asPercent(aiOddsSummary.home?.implied_probability)} ({(aiOddsSummary.home?.avg_decimal_odds || 0).toFixed(2)})
                </span>
                <span>
                  Beraberlik: {asPercent(aiOddsSummary.draw?.implied_probability)} ({(aiOddsSummary.draw?.avg_decimal_odds || 0).toFixed(2)})
                </span>
                <span>
                  Deplasman: {asPercent(aiOddsSummary.away?.implied_probability)} ({(aiOddsSummary.away?.avg_decimal_odds || 0).toFixed(2)})
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {showAdminTools ? (
        <div className="card wide">
          <h2>Recent Features</h2>
          <table>
            <thead>
              <tr>
                <th>Mac</th>
                <th>Tarih</th>
                <th>HG</th>
                <th>AG</th>
                <th>Shots H/A</th>
              </tr>
            </thead>
            <tbody>
              {recentFeatures.map((item) => {
                const fallbackMatch = fixtureLookup.get(String(item.fixture_id));
                const homeTeamName = item.home_team_name || fallbackMatch?.home_team_name || "Ev Takim";
                const awayTeamName = item.away_team_name || fallbackMatch?.away_team_name || "Deplasman";
                const homeTeamLogo = item.home_team_logo || fallbackMatch?.home_team_logo || null;
                const awayTeamLogo = item.away_team_logo || fallbackMatch?.away_team_logo || null;
                return (
                  <tr key={item.fixture_id}>
                    <td>
                      <div className="fixture-teams inline">
                        <TeamBadge logo={homeTeamLogo} name={homeTeamName} small />
                        <span className="vs-chip">vs</span>
                        <TeamBadge logo={awayTeamLogo} name={awayTeamName} small />
                      </div>
                    </td>
                    <td>{item.event_date ? formatDate(item.event_date) : "-"}</td>
                    <td>{item.label_home_goals ?? "-"}</td>
                    <td>{item.label_away_goals ?? "-"}</td>
                    <td>
                      {(item.feature_vector?.shots_home ?? 0).toFixed(1)} / {(item.feature_vector?.shots_away ?? 0).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        ) : null}
      </section>
    </div>
  );
}
