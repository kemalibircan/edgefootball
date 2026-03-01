import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import { 
  getPredictionsList, 
  getPredictionStats, 
  refreshPrediction, 
  deletePrediction,
  bulkRefreshPredictions 
} from "../lib/api";
import { readAuthToken } from "../lib/auth";
import { useLanguage } from "../contexts/LanguageContext";
import "./SavedPredictionsPage.css";

function todayLocalISODate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function yesterdayLocalISODate() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function lastWeekLocalISODate() {
  const now = new Date();
  now.setDate(now.getDate() - 7);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("tr-TR");
}

function asPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `%${(num * 100).toFixed(1)}`;
}

function outcomeLabel(value, t) {
  if (value === "home_win") return t.savedPredictions.stats.homeWin;
  if (value === "away_win") return t.savedPredictions.stats.awayWin;
  if (value === "draw") return t.savedPredictions.stats.draw;
  return "-";
}

export default function SavedPredictionsPage() {
  const { t, locale } = useLanguage();
  const navigate = useNavigate();
  
  // Filter state
  const [quickFilter, setQuickFilter] = useState("lastWeek");
  const [dateFrom, setDateFrom] = useState(lastWeekLocalISODate());
  const [dateTo, setDateTo] = useState(todayLocalISODate());
  const [archive, setArchive] = useState(false);
  const [page, setPage] = useState(1);
  
  // Data state
  const [predictions, setPredictions] = useState({
    items: [],
    total: 0,
    page: 1,
    total_pages: 1,
  });
  const [stats, setStats] = useState(null);
  
  // Loading state
  const [loadingKey, setLoadingKey] = useState("");
  const [error, setError] = useState("");

  const isLoading = (key) => loadingKey === key;

  // Load predictions
  const loadPredictions = async (resetPage = false) => {
    setLoadingKey("list");
    setError("");
    
    try {
      const targetPage = resetPage ? 1 : page;
      const filters = {
        dateFrom,
        dateTo,
        mineOnly: true,
        archive,
        page: targetPage,
        pageSize: 10,
      };
      
      console.log("[SavedPredictions] Loading with filters:", filters);
      const result = await getPredictionsList(filters);
      console.log("[SavedPredictions] API Response:", result);
      
      setPredictions(result || { items: [], total: 0, page: 1, total_pages: 1 });
      if (resetPage) setPage(1);
    } catch (err) {
      console.error("[SavedPredictions] Load error:", err);
      setError(err.message || t.savedPredictions.loadError);
    } finally {
      setLoadingKey("");
    }
  };

  // Load statistics
  const loadStats = async () => {
    try {
      const result = await getPredictionStats({
        dateFrom,
        dateTo,
      });
      setStats(result);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  // Quick filter handlers
  const applyQuickFilter = (filter) => {
    setQuickFilter(filter);
    const today = todayLocalISODate();
    
    switch (filter) {
      case "today":
        setDateFrom(today);
        setDateTo(today);
        break;
      case "yesterday":
        const yesterday = yesterdayLocalISODate();
        setDateFrom(yesterday);
        setDateTo(yesterday);
        break;
      case "lastWeek":
        setDateFrom(lastWeekLocalISODate());
        setDateTo(today);
        break;
      case "custom":
        // Keep current dates
        break;
    }
  };

  // Refresh single prediction
  const handleRefresh = async (predictionId) => {
    setLoadingKey(`refresh-${predictionId}`);
    setError("");
    
    try {
      await refreshPrediction(predictionId);
      await loadPredictions();
      await loadStats();
    } catch (err) {
      setError(err.message || t.savedPredictions.loadError);
    } finally {
      setLoadingKey("");
    }
  };

  // Delete prediction
  const handleDelete = async (predictionId) => {
    if (!confirm(t.savedPredictions.actions.delete + "?")) return;
    
    setLoadingKey(`delete-${predictionId}`);
    setError("");
    
    try {
      await deletePrediction(predictionId);
      await loadPredictions();
      await loadStats();
    } catch (err) {
      setError(err.message || t.savedPredictions.loadError);
    } finally {
      setLoadingKey("");
    }
  };

  // Bulk refresh
  const handleBulkRefresh = async () => {
    setLoadingKey("bulk-refresh");
    setError("");
    
    try {
      await bulkRefreshPredictions({ dateFrom, dateTo });
      await loadPredictions();
      await loadStats();
    } catch (err) {
      setError(err.message || t.savedPredictions.loadError);
    } finally {
      setLoadingKey("");
    }
  };

  // Initial load
  useEffect(() => {
    loadPredictions(true);
    loadStats();
  }, [dateFrom, dateTo, archive]);

  if (!readAuthToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="container">
      <section className="card wide">
        <h2>{t.savedPredictions.title}</h2>
        <p className="help-text">{t.savedPredictions.helpText}</p>

        {error && <div className="error">{error}</div>}

        {/* Statistics Dashboard */}
        {stats && (
          <div className="stats-dashboard">
            <div className="stat-card">
              <div className="stat-value">{stats.total_predictions}</div>
              <div className="stat-label">{t.savedPredictions.stats.totalPredictions}</div>
            </div>
            <div className="stat-card accent">
              <div className="stat-value">{asPercent(stats.accuracy_rate)}</div>
              <div className="stat-label">{t.savedPredictions.stats.accuracy}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.correct_predictions}</div>
              <div className="stat-label">{t.savedPredictions.stats.correct}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.pending_predictions}</div>
              <div className="stat-label">{t.savedPredictions.stats.pending}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="filters-section">
          <div className="quick-filters">
            <button
              className={`filter-btn ${quickFilter === "today" ? "active" : ""}`}
              onClick={() => applyQuickFilter("today")}
            >
              {t.savedPredictions.filters.today}
            </button>
            <button
              className={`filter-btn ${quickFilter === "yesterday" ? "active" : ""}`}
              onClick={() => applyQuickFilter("yesterday")}
            >
              {t.savedPredictions.filters.yesterday}
            </button>
            <button
              className={`filter-btn ${quickFilter === "lastWeek" ? "active" : ""}`}
              onClick={() => applyQuickFilter("lastWeek")}
            >
              {t.savedPredictions.filters.lastWeek}
            </button>
            <button
              className={`filter-btn ${quickFilter === "custom" ? "active" : ""}`}
              onClick={() => applyQuickFilter("custom")}
            >
              {t.savedPredictions.filters.customRange}
            </button>
          </div>

          <div className="date-range-filters">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setQuickFilter("custom");
              }}
            />
            <span>-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setQuickFilter("custom");
              }}
            />
          </div>

          <div className="action-filters">
            <label className="archive-toggle">
              <input
                type="checkbox"
                checked={archive}
                onChange={(e) => setArchive(e.target.checked)}
              />
              <span>{t.savedPredictions.filters.archive}</span>
            </label>
            <ActionButton
              className="secondary"
              loading={isLoading("bulk-refresh")}
              loadingText={t.savedPredictions.loading.checking}
              onClick={handleBulkRefresh}
            >
              {t.savedPredictions.filters.checkResults}
            </ActionButton>
          </div>
        </div>

        {/* Predictions List */}
        <p className="small-text">
          {t.savedPredictions.pagination.pageInfo(
            predictions.total || 0,
            predictions.page || 1,
            predictions.total_pages || 1
          )}
        </p>

        {predictions.items?.length ? (
          <div className="predictions-grid">
            {predictions.items.map((item) => (
              <div key={`pred-${item.id}`} className="prediction-card">
                <div className="prediction-header">
                  <div className="match-label">{item.match_label || "-"}</div>
                  {item.status === "settled" && (
                    <div className={`status-badge ${item.is_correct ? "correct" : "wrong"}`}>
                      {item.is_correct ? "✓" : "✗"}
                    </div>
                  )}
                </div>

                <div className="prediction-body">
                  <div className="prediction-row">
                    <span className="label">{t.savedPredictions.table.prediction1x2}:</span>
                    <span className="value">
                      {asPercent(item.predicted_home_win)} / {asPercent(item.predicted_draw)} / {asPercent(item.predicted_away_win)}
                    </span>
                  </div>
                  <div className="prediction-row">
                    <span className="label">{t.savedPredictions.table.predictionLabel}:</span>
                    <span className="value">{outcomeLabel(item.prediction_outcome, t)}</span>
                  </div>
                  {item.status === "settled" && (
                    <>
                      <div className="prediction-row">
                        <span className="label">{t.savedPredictions.table.actualResult}:</span>
                        <span className="value">
                          {item.actual_home_goals ?? "-"} - {item.actual_away_goals ?? "-"}
                        </span>
                      </div>
                      <div className="prediction-row">
                        <span className="label">{t.savedPredictions.table.resultLabel}:</span>
                        <span className="value">{outcomeLabel(item.actual_outcome, t)}</span>
                      </div>
                    </>
                  )}
                  {item.note && (
                    <div className="prediction-note">
                      <strong>{t.savedPredictions.table.notePrefix}</strong> {item.note}
                    </div>
                  )}
                  <div className="prediction-meta">
                    <small>{item.model_name || item.model_id || "-"}</small>
                    <small>{formatDate(item.prediction_created_at)}</small>
                  </div>
                </div>

                <div className="prediction-actions">
                  <ActionButton
                    className="small"
                    loading={isLoading(`refresh-${item.id}`)}
                    loadingText="..."
                    onClick={() => handleRefresh(item.id)}
                  >
                    {t.savedPredictions.actions.refresh}
                  </ActionButton>
                  <ActionButton
                    className="small secondary"
                    loading={isLoading(`delete-${item.id}`)}
                    loadingText="..."
                    onClick={() => handleDelete(item.id)}
                  >
                    {t.savedPredictions.actions.delete}
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            <h3>{locale === "tr" ? "Henüz Kayıtlı Tahmin Yok" : "No Saved Predictions Yet"}</h3>
            <p>
              {locale === "tr"
                ? "Tahmin kaydetmek için bir maç seçin, AI simülasyonu çalıştırın ve 'Tahmini Kaydet' butonuna tıklayın."
                : "To save a prediction, select a match, run AI simulation, and click 'Save Prediction' button."}
            </p>
            <ActionButton onClick={() => navigate("/")}>
              {locale === "tr" ? "Maçlara Git" : "Go to Matches"}
            </ActionButton>
          </div>
        )}

        {/* Pagination */}
        <div className="pagination-controls">
          <ActionButton
            loading={isLoading("page-prev")}
            loadingText={t.savedPredictions.loading.default}
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1);
              loadPredictions();
            }}
          >
            {t.savedPredictions.pagination.prevPage}
          </ActionButton>
          <ActionButton
            loading={isLoading("page-next")}
            loadingText={t.savedPredictions.loading.default}
            disabled={page >= (predictions.total_pages || 1)}
            onClick={() => {
              setPage(page + 1);
              loadPredictions();
            }}
          >
            {t.savedPredictions.pagination.nextPage}
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
