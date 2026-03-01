import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { readAuthToken } from "../lib/auth";
import { useLanguage } from "../contexts/LanguageContext";

function formatDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString("tr-TR");
}

function outcomeLabel(value) {
  if (value === "home_win") return "Ev";
  if (value === "away_win") return "Deplasman";
  if (value === "draw") return "Beraberlik";
  return "-";
}

function asPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `%${(num * 100).toFixed(1)}`;
}

function groupByDate(items) {
  const groups = {};
  for (const item of items || []) {
    const d = item.fixture_date || item.prediction_date;
    const key = d ? new Date(d).toISOString().slice(0, 10) : "unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

export default function SonucTahminlerimPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("current");
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState(null);

  const archive = activeTab === "archive";

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("mine_only", "true");
        params.set("archive", archive ? "true" : "false");
        params.set("page", String(page));
        params.set("page_size", "20");
        const payload = await apiRequest(`/admin/predictions/list?${params.toString()}`);
        setData({
          items: payload?.items || [],
          total: payload?.total ?? 0,
          page: payload?.page ?? 1,
          total_pages: payload?.total_pages ?? 1,
        });
      } catch (err) {
        setError(err?.message || t.resultPredictions?.loadError || "Failed to load.");
      } finally {
        setLoading(false);
      }
    },
    [archive, t.resultPredictions]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const refreshOne = useCallback(
    async (predictionId) => {
      setRefreshingId(predictionId);
      setError("");
      try {
        await apiRequest(`/admin/predictions/${predictionId}/refresh-result`, { method: "POST" });
        await load(data.page);
      } catch (err) {
        setError(err?.message || "Refresh failed.");
      } finally {
        setRefreshingId(null);
      }
    },
    [load, data.page]
  );

  const grouped = useMemo(() => groupByDate(data.items), [data.items]);

  if (!readAuthToken()) {
    return <Navigate to="/login" replace />;
  }

  const emptyMessage = archive
    ? (t.resultPredictions?.emptyArchive ?? "No archived predictions.")
    : (t.resultPredictions?.emptyCurrent ?? "No current predictions.");

  return (
    <div className="container">
      <section className="card wide">
        <h2>{t.resultPredictions?.title ?? "Sonuç Tahminlerim"}</h2>

        <div className="row wrap" style={{ gap: "8px", marginBottom: "16px" }}>
          <button
            type="button"
            className={activeTab === "current" ? "btn-primary" : "btn-secondary"}
            onClick={() => setActiveTab("current")}
          >
            {t.resultPredictions?.current ?? "Güncel"}
          </button>
          <button
            type="button"
            className={activeTab === "archive" ? "btn-primary" : "btn-secondary"}
            onClick={() => setActiveTab("archive")}
          >
            {t.resultPredictions?.archive ?? "Arşiv"}
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        {loading ? (
          <p className="small-text">{t.savedPredictions?.loading?.default ?? "Loading..."}</p>
        ) : grouped.length === 0 ? (
          <p>{emptyMessage}</p>
        ) : (
          <>
            {grouped.map(([dateKey, items]) => (
              <div key={dateKey} style={{ marginBottom: "24px" }}>
                <h3 className="small-text" style={{ marginBottom: "8px", color: "var(--text-secondary)" }}>
                  {formatDate(dateKey)}
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th>{t.savedPredictions?.table?.match ?? "Match"}</th>
                      <th>{t.savedPredictions?.table?.prediction1x2 ?? "Prediction"}</th>
                      <th>{t.savedPredictions?.table?.actualResult ?? "Result"}</th>
                      <th>{t.savedPredictions?.table?.status ?? "Status"}</th>
                      <th>{t.savedPredictions?.table?.action ?? "Action"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={`pred-${item.id}`}>
                        <td>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ textAlign: "left", padding: 0 }}
                            onClick={() => navigate(`/fixture/${item.fixture_id}`)}
                          >
                            {item.match_label || `${item.home_team_name || ""} - ${item.away_team_name || ""}`.trim() || "-"}
                          </button>
                          {item.league_id ? (
                            <div className="small-text">{item.model_name || item.model_id || ""}</div>
                          ) : null}
                        </td>
                        <td>
                          Ev {asPercent(item.predicted_home_win)} / Ber. {asPercent(item.predicted_draw)} / Dep.{" "}
                          {asPercent(item.predicted_away_win)}
                          <div className="small-text">
                            {t.savedPredictions?.table?.predictionLabel ?? "Prediction"}: {outcomeLabel(item.prediction_outcome)}
                          </div>
                        </td>
                        <td>
                          {item.actual_home_goals ?? "-"} - {item.actual_away_goals ?? "-"}
                          {item.actual_outcome ? (
                            <div className="small-text">{outcomeLabel(item.actual_outcome)}</div>
                          ) : null}
                        </td>
                        <td>
                          {item.status === "settled"
                            ? item.is_correct
                              ? t.savedPredictions?.table?.statusSettledCorrect
                              : t.savedPredictions?.table?.statusSettledWrong
                            : t.savedPredictions?.table?.statusPending}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={item.status === "settled" || refreshingId === item.id}
                            onClick={() => refreshOne(item.id)}
                          >
                            {refreshingId === item.id
                              ? (t.savedPredictions?.loading?.checking ?? "...")
                              : (t.resultPredictions?.refreshResult ?? "Refresh")}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => navigate(`/fixture/${item.fixture_id}`)}
                          >
                            {t.resultPredictions?.goToMatch ?? "View match"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {data.total_pages > 1 ? (
              <div className="row wrap" style={{ gap: "8px", marginTop: "16px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={data.page <= 1}
                  onClick={() => load(data.page - 1)}
                >
                  {t.savedPredictions?.pagination?.prevPage ?? "Previous"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={data.page >= data.total_pages}
                  onClick={() => load(data.page + 1)}
                >
                  {t.savedPredictions?.pagination?.nextPage ?? "Next"}
                </button>
                <span className="small-text">
                  {data.page} / {data.total_pages} ({data.total} {t.resultPredictions?.title ?? "items"})
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
