import React, { useEffect, useMemo, useState } from "react";
import ActionButton from "../../components/dashboard/ActionButton";
import OperationStatus from "../../components/dashboard/OperationStatus";
import ProgressBar from "../../components/dashboard/ProgressBar";
import { uiText } from "../../i18n/terms.tr";
import { fetchAllModels, parseModelLeagueId, resolveModelScope } from "../../lib/modelCatalog";

const TRAINING_DETAIL_SKIP_KEYS = new Set([
  "fixture_id",
  "event_date",
  "league_id",
  "home_team_id",
  "away_team_id",
  "home_team_name",
  "away_team_name",
  "label_home_goals",
  "label_away_goals",
]);
const PRO_PRESET_SOURCES = new Set([
  "team_form",
  "elo",
  "injuries",
  "lineup_strength",
  "weather",
  "referee",
  "market_odds",
]);
const RESET_RESEED_TARGET_LEAGUES = [600, 564, 8, 384, 2, 5];

function toDetailLabel(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDetailValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    if (!text) return "-";
    return text;
  }
  return String(value);
}

function parseLeagueId(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

export default function DashboardModelsPage({ dashboard }) {
  const {
    formatDate,
    sourceStatusLabel,
    modelForm,
    setModelForm,
    MODEL_TRAINING_CREDIT_COST,
    LEAGUE_OPTIONS,
    operationFor,
    isLoading,
    taskProgress,
    taskStage,
    tasks,
    queueModelTraining,
    loadOverview,
    modelSources,
    modelCatalogFilter,
    setModelCatalogFilter,
    setModelCatalogPage,
    loadModelsCatalog,
    modelCatalogPage,
    modelCatalog,
    MODEL_CATALOG_FILTERS,
    MODEL_LIST_PAGE_SIZE,
    modelCatalogLeagueFilter,
    setModelCatalogLeagueFilter,
    models,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    activateModel,
    deleteModel,
    loadTrainingMatches,
    trainingMatchesError,
    trainingMatches,
    queueTask,
    selectedLeagueId,
    currentUser,
    apiRequest,
    runOperation,
  } = dashboard;

  const selectedModelScope = selectedModel ? resolveModelScope(selectedModel) : "ready";
  const trainingItems = Array.isArray(trainingMatches?.items) ? trainingMatches.items : [];
  const isDateRangeTrainingMode = String(modelForm.training_mode || "latest") === "date_range";
  const [selectedTrainingFixtureId, setSelectedTrainingFixtureId] = useState("");
  const currentRole = String(currentUser?.role || "").toLowerCase();
  const isSuperadmin = currentRole === "superadmin";
  const isAdvancedEnabled = !!currentUser?.advanced_mode_enabled;
  const canRunResetReseed = isSuperadmin && isAdvancedEnabled;
  const canDeleteSelectedModel = useMemo(() => {
    if (!selectedModel) return false;
    const modelId = String(selectedModel.model_id || "").trim().toLowerCase();
    if (!modelId) return false;
    if (modelId === "legacy-default") return false;
    return true;
  }, [selectedModel]);

  const trainingLeagueId = useMemo(() => {
    const fromPayload = parseLeagueId(trainingMatches?.league_id);
    if (fromPayload !== null) return fromPayload;

    const fromModelMeta = parseLeagueId(selectedModel?.meta?.league_id);
    if (fromModelMeta !== null) return fromModelMeta;

    const fromSelectedLeague = parseLeagueId(selectedLeagueId);
    if (fromSelectedLeague !== null) return fromSelectedLeague;

    return null;
  }, [trainingMatches?.league_id, selectedModel?.meta?.league_id, selectedLeagueId]);

  const ingestStatus = trainingMatches?.ingest_status || null;
  const [resetBaselineCount, setResetBaselineCount] = useState(null);
  const [resetValidation, setResetValidation] = useState(null);
  const [resetValidationError, setResetValidationError] = useState("");
  const [lastValidatedResetTaskId, setLastValidatedResetTaskId] = useState("");

  useEffect(() => {
    setSelectedTrainingFixtureId("");
  }, [selectedModel?.model_id]);

  const selectedTrainingMatch = useMemo(() => {
    if (!selectedTrainingFixtureId) return null;
    return (
      trainingItems.find((item) => String(item?.fixture_id || "") === String(selectedTrainingFixtureId)) || null
    );
  }, [trainingItems, selectedTrainingFixtureId]);

  const trainingDetailEntries = useMemo(() => {
    if (!selectedTrainingMatch) return [];
    return Object.entries(selectedTrainingMatch).filter(([key, value]) => {
      if (TRAINING_DETAIL_SKIP_KEYS.has(key)) return false;
      if (value === null || value === undefined || value === "") return false;
      return true;
    });
  }, [selectedTrainingMatch]);

  const incrementalStatusText = useMemo(() => {
    if (!ingestStatus) return "Veri havuzu ozeti henuz hazir degil.";
    if (ingestStatus.has_missing_range) {
      return `Eksik aralik: ${ingestStatus.missing_from_date || "-"} - ${ingestStatus.missing_to_date || "-"} (${ingestStatus.missing_days || 0} gun)`;
    }
    return "Veri havuzu guncel gorunuyor.";
  }, [ingestStatus]);

  const activeTrainingTask = useMemo(() => {
    if (!Array.isArray(tasks) || !tasks.length) return null;
    return (
      tasks.find((task) => String(task?.client_task_kind || "").toLowerCase() === "model_training" && !task?.ready) ||
      null
    );
  }, [tasks]);
  const reseedTasks = useMemo(() => {
    if (!Array.isArray(tasks) || !tasks.length) return [];
    return tasks.filter((task) => String(task?.client_task_kind || "").toLowerCase() === "models_reset_reseed");
  }, [tasks]);
  const activeReseedTask = useMemo(() => {
    return reseedTasks.find((task) => !task?.ready) || null;
  }, [reseedTasks]);
  const latestReseedTask = reseedTasks[0] || null;

  const activeTrainingProgress = activeTrainingTask ? taskProgress(activeTrainingTask) : 0;
  const activeTrainingStage = activeTrainingTask ? taskStage(activeTrainingTask) : "";
  const activeReseedProgress = activeReseedTask ? taskProgress(activeReseedTask) : 0;
  const activeReseedStage = activeReseedTask ? taskStage(activeReseedTask) : "";
  const leagueLabelMap = useMemo(() => {
    const next = new Map();
    (LEAGUE_OPTIONS || []).forEach((league) => {
      const parsedLeagueId = Number(league?.id);
      if (!Number.isFinite(parsedLeagueId)) return;
      next.set(Math.trunc(parsedLeagueId), String(league?.label || `Lig ${parsedLeagueId}`));
    });
    return next;
  }, [LEAGUE_OPTIONS]);
  const activeCatalogLeagueLabel = useMemo(() => {
    const raw = String(modelCatalogLeagueFilter || "all").trim().toLowerCase();
    if (!raw || raw === "all") return "Tum Ligler";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return `Lig ${modelCatalogLeagueFilter}`;
    const leagueId = Math.trunc(parsed);
    const label = leagueLabelMap.get(leagueId);
    return label ? `${label} (${leagueId})` : `Lig ${leagueId}`;
  }, [modelCatalogLeagueFilter, leagueLabelMap]);

  const handleTrainingIncrementalIngest = async () => {
    if (!selectedModel) return;
    if (trainingLeagueId === null) return;

    await queueTask(
      "/admin/tasks/ingest-incremental",
      {
        league_id: Number(trainingLeagueId),
        include_feature_rebuild: true,
      },
      "task-ingest-incremental",
      "Eksik gunler icin guncel veri taski kuyruga aliniyor"
    );

    await loadTrainingMatches(selectedModel.model_id, 1, {
      silent: true,
      opKey: "training-matches-refresh-after-ingest",
    });
  };

  const validateResetAndReseed = async (taskId, beforeCount = null) => {
    if (!taskId) return;
    try {
      const validationPayload = await runOperation(
        "task-reset-verify",
        {
          start: 12,
          stage: "Reset sonrasi kalite dogrulamasi yapiliyor",
          successStage: "Reset sonrasi kalite dogrulamasi tamamlandi",
          clearMs: 1800,
        },
        async ({ setProgress }) => {
          setProgress(24, "Guncel model sayisi okunuyor");
          const allModels = await fetchAllModels(apiRequest);
          setProgress(42, "Lig model durumu okunuyor");
          const leagueStatus = await apiRequest("/admin/league-models/status");

          const leagueStatusItems = Array.isArray(leagueStatus?.items) ? leagueStatus.items : [];
          const leagueRows = RESET_RESEED_TARGET_LEAGUES.map((leagueId) => {
            const row = leagueStatusItems.find((item) => Number(item?.league_id) === Number(leagueId)) || null;
            return {
              league_id: Number(leagueId),
              status: String(row?.status || "missing"),
              default_model_id: row?.default_model_id || null,
              is_degraded: !!row?.is_degraded,
              rows_used: row?.rows_used ?? null,
            };
          });

          const backtests = [];
          for (let idx = 0; idx < RESET_RESEED_TARGET_LEAGUES.length; idx += 1) {
            const leagueId = RESET_RESEED_TARGET_LEAGUES[idx];
            setProgress(55 + idx * 10, `Lig ${leagueId} backtest sonucu okunuyor`);
            try {
              const row = await apiRequest(`/admin/models/backtest/latest?league_id=${leagueId}`);
              backtests.push({
                league_id: Number(leagueId),
                ok: true,
                log_loss: row?.log_loss ?? null,
                brier: row?.brier ?? null,
                accuracy: row?.accuracy ?? null,
                samples: row?.samples ?? null,
              });
            } catch (err) {
              backtests.push({
                league_id: Number(leagueId),
                ok: false,
                error: err?.message || "Backtest sonucu okunamadi.",
              });
            }
          }

          const mappingComplete = leagueRows.every(
            (row) => String(row.status || "").toLowerCase() === "ready" && !!row.default_model_id
          );
          const backtestComplete = backtests.every((row) => !!row.ok);
          return {
            task_id: String(taskId),
            model_count_before: Number.isFinite(Number(beforeCount)) ? Number(beforeCount) : null,
            model_count_after: Number(allModels?.total || 0),
            mapping_complete: mappingComplete,
            backtest_complete: backtestComplete,
            league_rows: leagueRows,
            backtests,
          };
        }
      );

      setResetValidation(validationPayload);
      setResetValidationError("");
      setLastValidatedResetTaskId(String(taskId));
      await loadModelsCatalog({
        page: 1,
        modelFilter: modelCatalogFilter,
        leagueFilter: modelCatalogLeagueFilter,
        opKey: "models-load",
        silent: true,
      });
      await loadOverview("overview-refresh");
    } catch (err) {
      setResetValidation(null);
      setResetValidationError(err?.message || "Reset sonrasi dogrulama calistirilamadi.");
      setLastValidatedResetTaskId(String(taskId));
    }
  };

  const handleResetAndReseed = async () => {
    if (!canRunResetReseed) {
      setResetValidationError("Bu operasyon icin superadmin ve aktif Advanced Mode gerekir.");
      return;
    }
    const confirmed = window.confirm(
      "Tum modeller silinecek ve configured ligler icin sifirdan yeniden egitim baslatilacak. Bakim penceresinde devam etmek istiyor musun?"
    );
    if (!confirmed) return;

    setResetValidation(null);
    setResetValidationError("");
    try {
      const beforeSnapshot = await fetchAllModels(apiRequest);
      setResetBaselineCount(Number(beforeSnapshot?.total || 0));
    } catch (_err) {
      setResetBaselineCount(null);
    }

    await queueTask(
      "/admin/tasks/models-reset-and-reseed-pro",
      {},
      "task-reset-reseed",
      "Model reset + configured leagues reseed taski kuyruga aliniyor"
    );
  };

  useEffect(() => {
    if (!latestReseedTask?.ready || !latestReseedTask?.successful) return;
    const taskId = String(latestReseedTask?.task_id || "");
    if (!taskId) return;
    if (taskId === String(lastValidatedResetTaskId || "")) return;
    validateResetAndReseed(taskId, resetBaselineCount);
  }, [
    latestReseedTask?.task_id,
    latestReseedTask?.ready,
    latestReseedTask?.successful,
    lastValidatedResetTaskId,
    resetBaselineCount,
  ]);

  const showAdvancedPanel = isAdvancedEnabled || isSuperadmin;

  const trainingModelLabel =
    trainingMatches?.model_name ||
    trainingMatches?.model_id ||
    selectedModel?.model_name ||
    selectedModel?.model_id ||
    null;

  return (
    <div className="container">
      <section className="grid">
        <div className="card wide">
          <h2>Yapay Zeka Eğitim Merkezi (Gelişmiş)</h2>
          <p className="help-text">
            Bu ekran, ileri seviye kullanıcıların kendi yapay zekasını eğitmesi için tasarlanmıştır. Varsayılan AI
            tahminleri için bu sayfayı kullanmana gerek yoktur.
          </p>
          {!showAdvancedPanel ? (
            <div className="row wrap" style={{ marginTop: 12 }}>
              <div className="small-text" style={{ maxWidth: 520 }}>
                Bu panel sadece backend tarafından doğrulanmış Advanced Mode kullanıcılarına açılır. Model eğitimi
                başlatmak için önce <strong>Advanced Mode (500 TL)</strong> paketinin ödeme onayı gerekir.
              </div>
              <ActionButton
                className="accent-gradient"
                onClick={() => {
                  window.location.href = "/token-purchase";
                }}
              >
                Advanced Mode Satın Al
              </ActionButton>
            </div>
          ) : null}
        </div>
      </section>

      {showAdvancedPanel ? (
        <>
      <section className="grid">
        <div className="card wide">
          <h2>Model Reset + Configured Leagues Reseed (Bakim Penceresi)</h2>
          <p className="help-text">
            Bu operasyon mevcut model kayitlarini temizler ve configured ligler icin pro-hybrid teknik setle yeni modeller olusturur.
            Islem sirasinda kisa sureli model boslugu olusabilir.
          </p>
          <p className="small-text">
            Hedef ligler: 600 (Super Lig), 564 (La Liga), 8 (Premier League), 384 (Serie A), 2 (Champions League), 5 (Europa League).
          </p>
          {!canRunResetReseed ? (
            <p className="small-text">
              Not: Bu islem sadece <strong>superadmin + Advanced Mode</strong> aktif hesapta calistirilabilir.
            </p>
          ) : null}
          <OperationStatus op={operationFor("task-reset-reseed", "task-reset-verify")} />

          {activeReseedTask ? (
            <div className="model-training-live">
              <div className="row spread">
                <strong>Devam eden reset + reseed gorevi</strong>
                <span className="small-text">{activeReseedProgress}%</span>
              </div>
              <p className="small-text">{activeReseedStage || "Calisiyor"}</p>
              <ProgressBar progress={activeReseedProgress} />
              <p className="small-text">
                Task ID: <code>{activeReseedTask.task_id}</code>
              </p>
            </div>
          ) : null}

          {latestReseedTask?.ready && !latestReseedTask?.successful ? (
            <div className="error">
              Son reset/reseed taski basarisiz oldu. Playbook: 1) Modelleri Yenile ile katalogu kontrol et. 2) Task
              log/stage mesajini incele. 3) Ayni endpoint ile reset/reseed taskini tekrar baslat.
            </div>
          ) : null}

          {resetValidation ? (
            <div className="success-box">
              <div className="small-text">
                Oncesi model sayisi: {resetValidation.model_count_before ?? "-"} | Sonrasi model sayisi:{" "}
                {resetValidation.model_count_after ?? "-"} | Mapping:{" "}
                {resetValidation.mapping_complete ? "Tamam" : "Eksik"}
              </div>
              <div className="small-text">Backtest: {resetValidation.backtest_complete ? "Tamam" : "Eksik"}</div>
              <div className="small-text" style={{ marginTop: 6 }}>
                Lig durumlari:
                {(resetValidation.league_rows || []).map((row) => (
                  <span key={`reset-league-status-${row.league_id}`}>
                    {" "}
                    [{row.league_id}: {row.status}, default={row.default_model_id ? "var" : "yok"}]
                  </span>
                ))}
              </div>
              <div className="small-text" style={{ marginTop: 4 }}>
                Backtestler:
                {(resetValidation.backtests || []).map((row) => (
                  <span key={`reset-backtest-${row.league_id}`}>
                    {" "}
                    [{row.league_id}: {row.ok ? `ok logloss=${row.log_loss ?? "-"}` : row.error || "hata"}]
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {resetValidationError ? <div className="error">{resetValidationError}</div> : null}

          <div className="row wrap">
            <ActionButton
              className="accent-gradient"
              loading={isLoading("task-reset-reseed")}
              loadingText="Task olusturuluyor..."
              disabled={!canRunResetReseed || !!activeReseedTask}
              onClick={handleResetAndReseed}
            >
              Tum Modelleri Sifirla + Configured Leagues Yeniden Egit
            </ActionButton>
            <ActionButton
              className="secondary"
              loading={isLoading("task-reset-verify")}
              loadingText="Dogrulaniyor..."
              disabled={!latestReseedTask?.ready || !latestReseedTask?.successful}
              onClick={() => validateResetAndReseed(latestReseedTask?.task_id, resetBaselineCount)}
            >
              Son Reseti Dogrula
            </ActionButton>
            <ActionButton
              className="secondary"
              disabled={!isSuperadmin}
              onClick={() => loadOverview("overview-refresh")}
            >
              Durum Panosunu Yenile
            </ActionButton>
          </div>
        </div>
      </section>

      <section className="grid model-zone">
        <div className="card model-builder-card">
          <h2>Yapay Zekanı Eğit</h2>
          <p className="help-text">
            Farklı veri kaynağı kombinasyonlarıyla kendi yapay zekanı eğitebilirsin. Seçilen kaynaklar ve eğitim
            ayarları model metadata bilgisine kaydedilir.
          </p>
          <p className="small-text">
            Lig seçimine göre sistem önce o ligin güncel verisini çeker, ardından modeli bu verilerle eğitir.
          </p>
          <p className="small-text">Yapay zeka eğitim maliyeti: Advanced Mode + {MODEL_TRAINING_CREDIT_COST} kredi.</p>
          <OperationStatus op={operationFor("task-train-model")} />

          <div className="row">
            <input
              placeholder="Yapay zeka modeli adı (ör: laliga-v1 / superlig-v2)"
              value={modelForm.model_name}
              onChange={(e) => setModelForm((prev) => ({ ...prev, model_name: e.target.value }))}
            />
          </div>
          <div className="row">
            <input
              placeholder="Kısa açıklama (opsiyonel)"
              value={modelForm.description}
              onChange={(e) => setModelForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="row">
            <select
              value={modelForm.training_mode || "latest"}
              onChange={(e) => {
                const nextTrainingMode = e.target.value;
                setModelForm((prev) => ({
                  ...prev,
                  training_mode: nextTrainingMode,
                  limit: nextTrainingMode === "date_range" ? "" : prev.limit,
                }));
              }}
              >
                <option value="latest">En güncel veriyi çek + yapay zekayı eğit</option>
                <option value="date_range">Belirli tarih aralığındaki maçlarla eğit</option>
                <option value="standard">Sadece mevcut veriyle eğit (veri çekme yok)</option>
            </select>
          </div>
          {isDateRangeTrainingMode ? (
            <div className="row">
              <input
                type="date"
                value={modelForm.date_from || ""}
                onChange={(e) => setModelForm((prev) => ({ ...prev, date_from: e.target.value }))}
              />
              <input
                type="date"
                value={modelForm.date_to || ""}
                onChange={(e) => setModelForm((prev) => ({ ...prev, date_to: e.target.value }))}
              />
            </div>
          ) : null}
          <div className="row">
            <select
              value={modelForm.league_id}
              onChange={(e) => setModelForm((prev) => ({ ...prev, league_id: e.target.value }))}
            >
              {LEAGUE_OPTIONS.map((league) => (
                <option key={`train-league-${league.id}`} value={String(league.id)}>
                  {league.label}
                </option>
              ))}
            </select>
            {!isDateRangeTrainingMode ? (
              <input
                type="number"
                placeholder="Eğitim maç sayısı (ör: 3000)"
                value={modelForm.limit}
                min="10"
                step="10"
                onChange={(e) => setModelForm((prev) => ({ ...prev, limit: e.target.value }))}
              />
            ) : null}
          </div>
          {!isDateRangeTrainingMode ? (
            <>
              <div className="row wrap chip-row">
                {[1000, 2000, 3000, 4000].map((size) => (
                  <button
                    key={`train-size-${size}`}
                    type="button"
                    className={`chip ${String(modelForm.limit) === String(size) ? "active" : ""}`}
                    onClick={() => setModelForm((prev) => ({ ...prev, limit: String(size) }))}
                  >
                    {size} maç
                  </button>
                ))}
              </div>
              <p className="small-text">
                Eğitim maç sayısı en güncel, tamamlanmış maçlardan geriye doğru seçilir. Boş bırakırsan tüm uygun
                maçlar kullanılır.
              </p>
            </>
          ) : (
            <p className="small-text">
              Tarih aralığı modunda seçtiğin aralıktaki tüm uygun maçlar eğitimde kullanılır.
            </p>
          )}
          <p className="small-text model-source-caption">Veri kaynaklari:</p>
          <p className="small-text">
            Egitim veri kaynaklari Pro Preset olarak sabitlenmistir ve backend tarafinda zorunlu uygulanir.
          </p>
          <div className="source-grid">
            {modelSources.map((source) => (
              <label
                key={source.key}
                className={`source-option ${PRO_PRESET_SOURCES.has(source.key) ? "active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={PRO_PRESET_SOURCES.has(source.key)}
                  disabled
                  readOnly
                />
                <div className="source-content">
                  <strong>{source.label}</strong>
                  <span>{source.description || "Bu veri kaynağı seçili olduğunda yapay zeka eğitiminde kullanılır."}</span>
                </div>
              </label>
            ))}
          </div>
          <label className="source-toggle highlight">
            <input
              type="checkbox"
              checked={modelForm.set_active}
              onChange={(e) => setModelForm((prev) => ({ ...prev, set_active: e.target.checked }))}
            />
            <span>Eğitim bittiğinde bu yapay zekayı varsayılan model yap</span>
          </label>
          <div className="row">
            <ActionButton loading={isLoading("task-train-model")} loadingText="Task olusturuluyor..." onClick={queueModelTraining}>
              Yapay Zeka Eğit ({MODEL_TRAINING_CREDIT_COST} Kredi)
            </ActionButton>
            <ActionButton
              className="secondary"
              loading={isLoading("overview-refresh")}
              loadingText="Yenileniyor..."
              onClick={() => loadOverview("overview-refresh")}
            >
              Modelleri Yenile
            </ActionButton>
          </div>
        </div>

        <div className="card">
          <h2>Yapay Zeka Modelleri Kataloğu</h2>
          <p className="help-text">
            Hazır modeller admin tarafından sunulur. Kendi eğittiğin yapay zekalarla birlikte aynı listede görünür ve
            simülasyon ekranında seçilebilir.
          </p>
          {activeTrainingTask ? (
          <div className="model-training-live">
              <div className="row spread">
                <strong>Devam eden yapay zeka eğitimi</strong>
                <span className="small-text">{activeTrainingProgress}%</span>
              </div>
              <p className="small-text">{activeTrainingStage || "Çalışıyor"}</p>
              <ProgressBar progress={activeTrainingProgress} />
              <p className="small-text">
                Task ID: <code>{activeTrainingTask.task_id}</code>
              </p>
            </div>
          ) : null}
          <OperationStatus op={operationFor("models-load", "models-filter", "models-page")} />
          <div className="row wrap model-catalog-tools">
            <select
              value={modelCatalogFilter}
              onChange={(e) => {
                const nextFilter = e.target.value;
                setModelCatalogFilter(nextFilter);
                setModelCatalogPage(1);
                loadModelsCatalog({
                  page: 1,
                  modelFilter: nextFilter,
                  leagueFilter: modelCatalogLeagueFilter,
                  opKey: "models-filter",
                });
              }}
            >
              {(MODEL_CATALOG_FILTERS || []).map((item) => (
                <option key={`model-filter-${item.value}`} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={modelCatalogLeagueFilter}
              onChange={(e) => {
                const nextLeagueFilter = e.target.value;
                setModelCatalogLeagueFilter(nextLeagueFilter);
                setModelCatalogPage(1);
                loadModelsCatalog({
                  page: 1,
                  modelFilter: modelCatalogFilter,
                  leagueFilter: nextLeagueFilter,
                  opKey: "models-filter",
                });
              }}
            >
              <option value="all">Tum Ligler</option>
              {(LEAGUE_OPTIONS || []).map((league) => (
                <option key={`catalog-league-${league.id}`} value={String(league.id)}>
                  {league.label} ({league.id})
                </option>
              ))}
            </select>
            <ActionButton
              className="secondary"
              loading={isLoading("models-load")}
              loadingText="Yukleniyor..."
              onClick={() =>
                loadModelsCatalog({
                  page: modelCatalogPage || 1,
                  modelFilter: modelCatalogFilter,
                  leagueFilter: modelCatalogLeagueFilter,
                  opKey: "models-load",
                })
              }
            >
              Listeyi Yenile
            </ActionButton>
            <ActionButton
              className="secondary"
              disabled={String(modelCatalogLeagueFilter || "all").trim().toLowerCase() === "all"}
              onClick={() => {
                setModelCatalogLeagueFilter("all");
                setModelCatalogPage(1);
                loadModelsCatalog({
                  page: 1,
                  modelFilter: modelCatalogFilter,
                  leagueFilter: "all",
                  opKey: "models-filter",
                });
              }}
            >
              Tum Ligler
            </ActionButton>
          </div>
          <p className="small-text">Aktif lig filtresi: {activeCatalogLeagueLabel}</p>
          <p className="small-text">
            Toplam {modelCatalog?.total || 0} model | Sayfa {modelCatalog?.page || 1}/{modelCatalog?.total_pages || 1} |
            Sayfa basi {modelCatalog?.page_size || MODEL_LIST_PAGE_SIZE}
          </p>
          {!models.length ? (
            <p className="small-text">
              Bu filtrede model bulunamadi ({activeCatalogLeagueLabel}). Lig filtresini Tum Ligler yapip tekrar deneyin.
            </p>
          ) : null}
          <div className="model-list">
            {models.map((item) => {
              const modelScope = resolveModelScope(item);
              const modelLeagueId = parseModelLeagueId(item);
              const modelLeagueLabel =
                modelLeagueId !== null ? `${leagueLabelMap.get(modelLeagueId) || `Lig ${modelLeagueId}`} (${modelLeagueId})` : "";
              return (
                <button
                  key={item.model_id}
                  className={`model-item model-item-${modelScope === "ready" ? "ready" : "user"} ${
                    String(item.model_id) === String(selectedModelId) ? "active" : ""
                  }`}
                  onClick={() => setSelectedModelId(String(item.model_id))}
                >
                  <span className="model-item-title">{item.model_name || item.model_id}</span>
              <span className="model-item-chips">
                    <span className={`model-chip ${modelScope === "ready" ? "ready" : "mine"}`}>
                      {modelScope === "ready"
                        ? "Hazır Yapay Zeka"
                        : item.is_owned_by_me
                        ? "Senin Yapay Zekân"
                        : "Kullanıcı Modeli"}
                    </span>
                    {modelLeagueLabel ? <span className="model-chip">{modelLeagueLabel}</span> : null}
                    {item.is_active ? <span className="model-chip active">Aktif</span> : null}
                  </span>
                  <small>
                    {item.created_by_username ? `Olusturan: ${item.created_by_username} | ` : ""}
                    {formatDate(item.trained_at)}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="row wrap">
            <ActionButton
              loading={isLoading("models-page")}
              loadingText="Yukleniyor..."
              disabled={(modelCatalog?.page || 1) <= 1}
              onClick={() =>
                loadModelsCatalog({
                  page: Math.max(1, (modelCatalog?.page || 1) - 1),
                  modelFilter: modelCatalogFilter,
                  leagueFilter: modelCatalogLeagueFilter,
                  opKey: "models-page",
                })
              }
            >
              Onceki
            </ActionButton>
            <ActionButton
              loading={isLoading("models-page")}
              loadingText="Yukleniyor..."
              disabled={(modelCatalog?.page || 1) >= (modelCatalog?.total_pages || 1)}
              onClick={() =>
                loadModelsCatalog({
                  page: (modelCatalog?.page || 1) + 1,
                  modelFilter: modelCatalogFilter,
                  leagueFilter: modelCatalogLeagueFilter,
                  opKey: "models-page",
                })
              }
            >
              Sonraki
            </ActionButton>
          </div>

          {selectedModel ? (
            <div className="model-detail">
              <h3>{selectedModel.model_name || selectedModel.model_id}</h3>
              <p className="small-text">Model ID: {selectedModel.model_id}</p>
              <p className="small-text">
                Tür: {selectedModelScope === "ready" ? "Hazır Yapay Zeka (Admin)" : "Kullanıcı Modeli"}
              </p>
              {selectedModel.created_by_username ? (
                <p className="small-text">Oluşturan: {selectedModel.created_by_username}</p>
              ) : null}
              <p className="small-text">Version: {selectedModel.version}</p>
              <p className="small-text">Kullanılan satır sayısı: {selectedModel.meta?.rows_used ?? "-"}</p>
              <p className="small-text">Feature veri seti yolu: {selectedModel.meta?.feature_dataset_path || "-"}</p>
              <p className="small-text">Eğitim snapshot yolu: {selectedModel.meta?.training_snapshot_path || "-"}</p>
              <p className="small-text">Eğitim manifest yolu: {selectedModel.meta?.training_manifest_path || "-"}</p>
              <p className="small-text">
                MAE Home/Away: {Number(selectedModel.meta?.home_metrics?.mae || 0).toFixed(3)} /{" "}
                {Number(selectedModel.meta?.away_metrics?.mae || 0).toFixed(3)}
              </p>
              <OperationStatus op={operationFor("activate-model", "delete-model")} />
              <ActionButton
                loading={isLoading("activate-model")}
                loadingText="Aktifleniyor..."
                disabled={selectedModel.is_active}
                onClick={() => activateModel(selectedModel.model_id)}
              >
                Bu modeli aktif yap
              </ActionButton>
              <ActionButton
                className="secondary"
                loading={isLoading("delete-model")}
                loadingText="Siliniyor..."
                disabled={!canDeleteSelectedModel}
                onClick={() => deleteModel(selectedModel.model_id)}
              >
                Modeli Sil
              </ActionButton>

              <h3>Egitim Veri Kaynaklari</h3>
              {(selectedModel.meta?.data_source_report || []).map((source) => (
                <div key={`${selectedModel.model_id}-${source.key}`} className="source-report-row">
                  <span>{source.label}</span>
                  <small>{sourceStatusLabel(source.status)}</small>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid">
        <div className="card wide training-matches-card">
          <div className="row spread wrap training-header-row">
            <div>
              <h2>
                {trainingModelLabel
                  ? `"${trainingModelLabel}" modeli için eğitimde kullanılan maçlar`
                  : "Eğitimde Kullanılan Maçlar"}
              </h2>
              <p className="help-text">
                Seçili yapay zekanın eğitimi sırasında kullanılan maçları listeliyoruz. Her maçı seçerek eğitimde
                kullanılan özellikleri ve veri alanlarını inceleyebilirsin.
              </p>
            </div>
            <div className="training-meta-grid">
              <span className="small-text">
                Son çekilen maç tarihi: {ingestStatus?.last_raw_fixture_date || "-"}
              </span>
              <span className="small-text">
                Son veri çekim zamanı: {formatDate(ingestStatus?.last_ingested_at)}
              </span>
              <span className="small-text">
                Son feature tarihi: {formatDate(ingestStatus?.last_feature_event_date)}
              </span>
            </div>
          </div>

          <OperationStatus
            op={
              operationFor(
                "task-ingest-incremental",
                "training-matches-load",
                "training-matches-page",
                "training-matches-refresh-after-ingest"
              )
            }
          />

          <div className="row wrap">
            <ActionButton
              loading={isLoading("training-matches-load")}
              loadingText="Yukleniyor..."
              disabled={!selectedModel}
              onClick={() => selectedModel && loadTrainingMatches(selectedModel.model_id, 1, { opKey: "training-matches-load" })}
            >
              Eğitim Maçlarını Göster
            </ActionButton>
            <ActionButton
              className="secondary"
              loading={isLoading("task-ingest-incremental")}
              loadingText="Guncelleniyor..."
              disabled={!selectedModel || trainingLeagueId === null}
              onClick={handleTrainingIncrementalIngest}
            >
              Eksik Günleri Tamamla
            </ActionButton>
          </div>

          <p className="small-text">{incrementalStatusText}</p>
          {trainingMatchesError ? <p className="small-text">{trainingMatchesError}</p> : null}

          {!selectedModel ? <p className="small-text">Önce bir yapay zeka modeli seçmelisin.</p> : null}
          {selectedModel && trainingMatches.model_id !== selectedModel.model_id ? (
            <p className="small-text">
              Seçilen modelin eğitim maçlarını görüntülemek için{" "}
              <strong>"Eğitim Maçlarını Göster"</strong> butonuna bas.
            </p>
          ) : null}

          {selectedModel && trainingMatches.model_id === selectedModel.model_id ? (
            <div className="training-table-wrap">
              <p className="small-text">
                {trainingModelLabel ? `"${trainingModelLabel}" modeli için ` : ""}
                Toplam {trainingMatches.total || 0} maç | Sayfa {trainingMatches.page || 1}/
                {trainingMatches.total_pages || 1} | Kullanılan satır sayısı:{" "}
                {trainingMatches.rows_used ?? "-"} | Son eğitim maç tarihi:{" "}
                {formatDate(trainingMatches.last_training_event_date)}
              </p>
              {trainingMatches.is_legacy_derived ? (
                <p className="small-text">
                  Not: Bu model eski olduğu için liste, snapshot yerine feature tablosundan türetilmiş olabilir.
                </p>
              ) : null}
              {trainingItems.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Fixture</th>
                      <th>Mac</th>
                      <th>Tarih</th>
                      <th>Skor</th>
                      <th>Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingItems.map((match) => (
                      <tr key={`tm-${selectedModel.model_id}-${match.fixture_id}`}>
                        <td>{match.fixture_id ?? "-"}</td>
                        <td>
                          {(match.home_team_name || `Team ${match.home_team_id ?? "-"}`) +
                            " vs " +
                            (match.away_team_name || `Team ${match.away_team_id ?? "-"}`)}
                        </td>
                        <td>{formatDate(match.event_date)}</td>
                        <td>
                          {match.label_home_goals ?? "-"} - {match.label_away_goals ?? "-"}
                        </td>
                        <td>
                          <ActionButton
                            className="secondary"
                            onClick={() => setSelectedTrainingFixtureId(String(match.fixture_id || ""))}
                          >
                            Veri Detayi
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="small-text">Bu modelde kayitli egitim maci bulunamadi.</p>
              )}
              <div className="row">
                <ActionButton
                  loading={isLoading("training-matches-page")}
                  loadingText="Yukleniyor..."
                  disabled={(trainingMatches.page || 1) <= 1}
                  onClick={() =>
                    loadTrainingMatches(selectedModel.model_id, Math.max(1, (trainingMatches.page || 1) - 1), {
                      opKey: "training-matches-page",
                    })
                  }
                >
                  Onceki
                </ActionButton>
                <ActionButton
                  loading={isLoading("training-matches-page")}
                  loadingText="Yukleniyor..."
                  disabled={(trainingMatches.page || 1) >= (trainingMatches.total_pages || 1)}
                  onClick={() =>
                    loadTrainingMatches(selectedModel.model_id, (trainingMatches.page || 1) + 1, {
                      opKey: "training-matches-page",
                    })
                  }
                >
                  Sonraki
                </ActionButton>
              </div>
            </div>
          ) : null}

          {selectedTrainingMatch ? (
            <div className="training-match-detail">
              <h3>Maç Eğitim Verisi Detayı</h3>
              <p className="small-text">
                Fixture: {selectedTrainingMatch.fixture_id ?? "-"} | Maç:{" "}
                {selectedTrainingMatch.home_team_name || "Home"} vs{" "}
                {selectedTrainingMatch.away_team_name || "Away"} | Tarih:{" "}
                {formatDate(selectedTrainingMatch.event_date)}
              </p>
              {trainingDetailEntries.length ? (
                <div className="training-detail-grid">
                  {trainingDetailEntries.map(([key, value]) => (
                    <div key={`training-detail-${key}`} className="training-detail-row">
                      <strong>{toDetailLabel(key)}</strong>
                      <span>{formatDetailValue(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small-text">Bu maç için ekstra eğitim alan detayı bulunamadı.</p>
              )}
            </div>
          ) : null}
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}
