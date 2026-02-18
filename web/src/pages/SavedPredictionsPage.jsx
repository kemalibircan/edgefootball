import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import { apiRequest } from "../lib/api";
import { readAuthToken } from "../lib/auth";
import { uiText } from "../i18n/terms.tr";

const SUPER_LIG_ID = 600;

function todayLocalISODate() {
  const now = new Date();
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

function outcomeLabel(value) {
  if (value === "home_win") return "Ev";
  if (value === "away_win") return "Deplasman";
  if (value === "draw") return "Beraberlik";
  return "-";
}

export default function SavedPredictionsPage() {
  const [savedPredictionsDay, setSavedPredictionsDay] = useState(todayLocalISODate());
  const [savedPredictions, setSavedPredictions] = useState({
    day: "",
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1,
    items: [],
  });
  const [loadingKey, setLoadingKey] = useState("");
  const [error, setError] = useState("");

  const isLoading = (key) => loadingKey === key;

  const loadDailyPredictions = async ({
    day = savedPredictionsDay,
    page = 1,
    autoRefreshResults = false,
    key = "list",
  } = {}) => {
    setLoadingKey(key);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("day", day);
      params.set("page", String(page));
      params.set("page_size", "10");
      params.set("league_id", String(SUPER_LIG_ID));
      params.set("mine_only", "true");
      if (autoRefreshResults) {
        params.set("auto_refresh_results", "true");
      }
      const payload = await apiRequest(`/admin/predictions/daily?${params.toString()}`);
      setSavedPredictions(payload || {});
      setSavedPredictionsDay(day);
    } catch (err) {
      setError(err.message || uiText.savedPredictions.loadError);
    } finally {
      setLoadingKey("");
    }
  };

  const refreshSavedPredictionResult = async (predictionId) => {
    setLoadingKey(`refresh-${predictionId}`);
    setError("");
    try {
      await apiRequest(`/admin/predictions/${predictionId}/refresh-result`, {
        method: "POST",
      });
      await loadDailyPredictions({
        day: savedPredictionsDay,
        page: savedPredictions.page || 1,
        autoRefreshResults: false,
        key: "list-after-refresh",
      });
    } catch (err) {
      setError(err.message || "Kayit guncellenemedi.");
      setLoadingKey("");
    }
  };

  useEffect(() => {
    loadDailyPredictions({
      day: savedPredictionsDay,
      page: 1,
      autoRefreshResults: false,
      key: "initial",
    });
  }, []);

  const pageInfoText = useMemo(
    () =>
      uiText.savedPredictions.pagination.pageInfo(
        savedPredictions.total || 0,
        savedPredictions.page || 1,
        savedPredictions.total_pages || 1
      ),
    [savedPredictions.page, savedPredictions.total, savedPredictions.total_pages]
  );

  if (!readAuthToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="container">
      <section className="card wide">
        <h2>{uiText.savedPredictions.title}</h2>
        <p className="help-text">{uiText.savedPredictions.helpText}</p>

        {error ? <div className="error">{error}</div> : null}

        <div className="row wrap">
          <input
            type="date"
            value={savedPredictionsDay}
            onChange={(e) => setSavedPredictionsDay(e.target.value)}
          />
          <ActionButton
            loading={isLoading("list") || isLoading("initial")}
            loadingText={uiText.savedPredictions.loading.default}
            onClick={() =>
              loadDailyPredictions({
                day: savedPredictionsDay,
                page: 1,
                autoRefreshResults: false,
                key: "list",
              })
            }
          >
            {uiText.savedPredictions.filters.listForDay}
          </ActionButton>
          <ActionButton
            className="secondary"
            loading={isLoading("check")}
            loadingText={uiText.savedPredictions.loading.checking}
            onClick={() =>
              loadDailyPredictions({
                day: savedPredictionsDay,
                page: savedPredictions.page || 1,
                autoRefreshResults: true,
                key: "check",
              })
            }
          >
            {uiText.savedPredictions.filters.checkResults}
          </ActionButton>
        </div>

        <p className="small-text">{pageInfoText}</p>

        {savedPredictions.items?.length ? (
          <table>
            <thead>
              <tr>
                <th>{uiText.savedPredictions.table.date}</th>
                <th>{uiText.savedPredictions.table.match}</th>
                <th>{uiText.savedPredictions.table.prediction1x2}</th>
                <th>{uiText.savedPredictions.table.actualResult}</th>
                <th>{uiText.savedPredictions.table.status}</th>
                <th>{uiText.savedPredictions.table.action}</th>
              </tr>
            </thead>
            <tbody>
              {savedPredictions.items.map((item) => (
                <tr key={`saved-pred-${item.id}`}>
                  <td>{formatDate(item.prediction_created_at)}</td>
                  <td>
                    {item.match_label || "-"}
                    <div className="small-text">{item.model_name || item.model_id || "-"}</div>
                    {item.note ? (
                      <div className="small-text">
                        {uiText.savedPredictions.table.notePrefix} {item.note}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    Ev {asPercent(item.predicted_home_win)} / Ber. {asPercent(item.predicted_draw)} / Dep.{" "}
                    {asPercent(item.predicted_away_win)}
                    <div className="small-text">
                      {uiText.savedPredictions.table.predictionLabel}: {outcomeLabel(item.prediction_outcome)}
                    </div>
                  </td>
                  <td>
                    {item.actual_home_goals ?? "-"} - {item.actual_away_goals ?? "-"}
                    <div className="small-text">
                      {uiText.savedPredictions.table.resultLabel}: {outcomeLabel(item.actual_outcome)}
                    </div>
                  </td>
                  <td>
                    {item.status === "settled"
                      ? item.is_correct
                        ? uiText.savedPredictions.table.statusSettledCorrect
                        : uiText.savedPredictions.table.statusSettledWrong
                      : uiText.savedPredictions.table.statusPending}
                  </td>
                  <td>
                    <ActionButton
                      loading={isLoading(`refresh-${item.id}`)}
                      loadingText={uiText.savedPredictions.loading.checking}
                      onClick={() => refreshSavedPredictionResult(item.id)}
                    >
                      {uiText.savedPredictions.actions.refresh}
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{uiText.savedPredictions.noRecordsToday}</p>
        )}

        <div className="row wrap">
          <ActionButton
            loading={isLoading("page-prev")}
            loadingText={uiText.savedPredictions.loading.default}
            disabled={(savedPredictions.page || 1) <= 1}
            onClick={() =>
              loadDailyPredictions({
                day: savedPredictionsDay,
                page: Math.max(1, (savedPredictions.page || 1) - 1),
                autoRefreshResults: false,
                key: "page-prev",
              })
            }
          >
            {uiText.savedPredictions.pagination.prevPage}
          </ActionButton>
          <ActionButton
            loading={isLoading("page-next")}
            loadingText={uiText.savedPredictions.loading.default}
            disabled={(savedPredictions.page || 1) >= (savedPredictions.total_pages || 1)}
            onClick={() =>
              loadDailyPredictions({
                day: savedPredictionsDay,
                page: (savedPredictions.page || 1) + 1,
                autoRefreshResults: false,
                key: "page-next",
              })
            }
          >
            {uiText.savedPredictions.pagination.nextPage}
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
