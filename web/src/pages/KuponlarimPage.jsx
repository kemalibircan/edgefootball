import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { requestCouponApi } from "../lib/chatApi";
import { readAuthToken } from "../lib/auth";
import { getPublicFixtureDetail } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import "./KuponlarimPage.css";

function formatDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString("tr-TR");
}

function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : null;
}

function collectMissingLogoFixtureIds(coupons = []) {
  const set = new Set();
  for (const coupon of coupons) {
    const matches = Array.isArray(coupon?.items) ? coupon.items : [];
    for (const match of matches) {
      const fixtureId = toPositiveInt(match?.fixture_id);
      if (!fixtureId) continue;
      const hasHomeLogo = Boolean(String(match?.home_team_logo || "").trim());
      const hasAwayLogo = Boolean(String(match?.away_team_logo || "").trim());
      if (!hasHomeLogo || !hasAwayLogo) {
        set.add(fixtureId);
      }
    }
  }
  return Array.from(set);
}

function mergeFixtureDetailsIntoCoupons(coupons = [], fixtureMap = new Map()) {
  if (!fixtureMap.size) return coupons;
  return coupons.map((coupon) => {
    const matches = Array.isArray(coupon?.items) ? coupon.items : [];
    const nextMatches = matches.map((match) => {
      const fixtureId = toPositiveInt(match?.fixture_id);
      const detail = fixtureId ? fixtureMap.get(fixtureId) : null;
      if (!detail) return match;
      return {
        ...match,
        home_team_name: String(match?.home_team_name || "").trim() || detail.home_team_name || match?.home_team_name,
        away_team_name: String(match?.away_team_name || "").trim() || detail.away_team_name || match?.away_team_name,
        home_team_logo: String(match?.home_team_logo || "").trim() || detail.home_team_logo || null,
        away_team_logo: String(match?.away_team_logo || "").trim() || detail.away_team_logo || null,
      };
    });
    return {
      ...coupon,
      items: nextMatches,
    };
  });
}

export default function KuponlarimPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("active");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const archived = activeTab === "archive";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await requestCouponApi(`/saved?archived=${archived}&limit=50`);
      const coupons = Array.isArray(res?.items) ? res.items : [];
      const missingFixtureIds = collectMissingLogoFixtureIds(coupons).slice(0, 40);

      if (!missingFixtureIds.length) {
        setItems(coupons);
        return;
      }

      const fixtureMap = new Map();
      const detailResults = await Promise.allSettled(
        missingFixtureIds.map(async (fixtureId) => {
          const payload = await getPublicFixtureDetail(fixtureId);
          return { fixtureId, payload };
        }),
      );
      for (const result of detailResults) {
        if (result.status !== "fulfilled") continue;
        const fixtureId = toPositiveInt(result.value?.fixtureId);
        const payload = result.value?.payload || {};
        if (!fixtureId) continue;
        fixtureMap.set(fixtureId, {
          home_team_name: String(payload?.home_team_name || "").trim() || null,
          away_team_name: String(payload?.away_team_name || "").trim() || null,
          home_team_logo: String(payload?.home_team_logo || "").trim() || null,
          away_team_logo: String(payload?.away_team_logo || "").trim() || null,
        });
      }

      setItems(mergeFixtureDetailsIntoCoupons(coupons, fixtureMap));
    } catch (err) {
      setError(err?.message || t.myCoupons?.loadError || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [archived, t.myCoupons]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRename = useCallback(
    async (couponId) => {
      const name = String(renameValue || "").trim();
      if (!name) return;
      setActionLoading(true);
      setError("");
      try {
        await requestCouponApi(`/saved/${couponId}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        setRenameId(null);
        setRenameValue("");
        await load();
      } catch (err) {
        setError(err?.message || "Rename failed.");
      } finally {
        setActionLoading(false);
      }
    },
    [renameValue, load]
  );

  const handleArchive = useCallback(
    async (couponId) => {
      setActionLoading(true);
      setError("");
      try {
        await requestCouponApi(`/saved/${couponId}/archive`, { method: "POST" });
        await load();
      } catch (err) {
        setError(err?.message || "Archive failed.");
      } finally {
        setActionLoading(false);
      }
    },
    [load]
  );

  const handleRestore = useCallback(
    async (couponId) => {
      setActionLoading(true);
      setError("");
      try {
        await requestCouponApi(`/saved/${couponId}/restore`, { method: "POST" });
        await load();
      } catch (err) {
        setError(err?.message || "Restore failed.");
      } finally {
        setActionLoading(false);
      }
    },
    [load]
  );

  const handleDelete = useCallback(
    async (couponId) => {
      setActionLoading(true);
      setError("");
      try {
        await requestCouponApi(`/saved/${couponId}`, { method: "DELETE" });
        setDeleteConfirmId(null);
        await load();
      } catch (err) {
        setError(err?.message || "Delete failed.");
      } finally {
        setActionLoading(false);
      }
    },
    [load]
  );

  const openRename = (coupon) => {
    setRenameId(coupon.id);
    setRenameValue(coupon.name || "");
  };

  if (!readAuthToken()) {
    return <Navigate to="/login" replace />;
  }

  const emptyMessage = archived
    ? (t.myCoupons?.emptyArchive ?? "No archived coupons.")
    : (t.myCoupons?.emptyActive ?? "No active coupons.");

  const matchesCountText = (count) =>
    (t.myCoupons?.matchesCount ?? "{{count}} matches").replace("{{count}}", String(count ?? 0));

  return (
    <div className="container kuponlarim-page">
      <section className="card wide">
        <h2>{t.myCoupons?.title ?? "Kuponlarım"}</h2>

        <div className="kuponlarim-tabs">
          <button
            type="button"
            className={`kuponlarim-tab ${activeTab === "active" ? "active" : ""}`}
            onClick={() => setActiveTab("active")}
          >
            {t.myCoupons?.active ?? "Aktif"}
          </button>
          <button
            type="button"
            className={`kuponlarim-tab ${activeTab === "archive" ? "active" : ""}`}
            onClick={() => setActiveTab("archive")}
          >
            {t.myCoupons?.archive ?? "Arşiv"}
          </button>
        </div>

        {error && <div className="kuponlarim-error">{error}</div>}

        {loading ? (
          <p className="kuponlarim-loading">{t.savedPredictions?.loading?.default ?? "Loading..."}</p>
        ) : items.length === 0 ? (
          <div className="kuponlarim-empty">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
            </svg>
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="kuponlarim-grid">
            {items.map((coupon) => (
              <div key={coupon.id} className="kuponlarim-card">
                <div className="kuponlarim-card-header">
                  <div className="kuponlarim-card-title-section">
                    {renameId === coupon.id ? (
                      <div className="kuponlarim-rename-form">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder={t.myCoupons?.renamePlaceholder ?? "Coupon name"}
                          className="kuponlarim-rename-input"
                        />
                        <button
                          type="button"
                          className="kuponlarim-action-btn primary"
                          disabled={actionLoading || !String(renameValue || "").trim()}
                          onClick={() => handleRename(coupon.id)}
                        >
                          {actionLoading ? "..." : (t.myCoupons?.renameAction ?? "Save")}
                        </button>
                        <button
                          type="button"
                          className="kuponlarim-action-btn"
                          disabled={actionLoading}
                          onClick={() => { setRenameId(null); setRenameValue(""); }}
                        >
                          {t.myCoupons?.cancel ?? "Cancel"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="kuponlarim-card-title">
                          {coupon.name || "Kupon"}
                          {coupon.risk_level && (
                            <span className="kuponlarim-risk-badge">
                              {coupon.risk_level}
                            </span>
                          )}
                        </h3>
                        <div className="kuponlarim-card-meta">
                          <span className="kuponlarim-meta-item">
                            {matchesCountText(coupon.items?.length ?? 0)}
                          </span>
                          <span className="kuponlarim-meta-item">
                            {t.myCoupons?.stake ?? "Stake"}: <strong>{Number(coupon.summary?.stake ?? 0).toFixed(2)}</strong>
                          </span>
                          <span className="kuponlarim-meta-item">
                            {t.myCoupons?.totalOdds ?? "Total odds"}: <strong>{Number(coupon.summary?.total_odds ?? 0).toFixed(2)}</strong>
                          </span>
                          <span className="kuponlarim-meta-item">
                            {t.myCoupons?.potentialWin ?? "Potential win"}: <strong>{Number(coupon.summary?.max_win ?? 0).toFixed(2)}</strong>
                          </span>
                        </div>
                        <div className="kuponlarim-card-date">
                          {formatDate(coupon.created_at)}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {renameId !== coupon.id && coupon.items && coupon.items.length > 0 && (
                  <div className="kuponlarim-card-body">
                    <div className="kuponlarim-matches-section">
                      <h4 className="kuponlarim-matches-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                          <path d="M2 12h20"/>
                        </svg>
                        Maçlar
                      </h4>
                      <div className="kuponlarim-matches-grid">
                        {coupon.items.map((match, idx) => (
                          <div key={match.fixture_id || idx} className="kuponlarim-match-item">
                            <div className="kuponlarim-match-teams">
                              <div className="kuponlarim-team">
                                {match.home_team_logo && (
                                  <img
                                    src={match.home_team_logo}
                                    alt={match.home_team_name}
                                    className="kuponlarim-team-logo"
                                  />
                                )}
                                <span className="kuponlarim-team-name">{match.home_team_name}</span>
                              </div>
                              <span className="kuponlarim-vs">vs</span>
                              <div className="kuponlarim-team">
                                {match.away_team_logo && (
                                  <img
                                    src={match.away_team_logo}
                                    alt={match.away_team_name}
                                    className="kuponlarim-team-logo"
                                  />
                                )}
                                <span className="kuponlarim-team-name">{match.away_team_name}</span>
                              </div>
                            </div>
                            <div className="kuponlarim-match-info">
                              {match.league_name && (
                                <span className="kuponlarim-match-info-item">
                                  🏆 {match.league_name}
                                </span>
                              )}
                              {match.starting_at && (
                                <span className="kuponlarim-match-info-item">
                                  📅 {formatDate(match.starting_at)}
                                </span>
                              )}
                            </div>
                            <div className="kuponlarim-match-details">
                              <div className="kuponlarim-match-detail">
                                <span className="kuponlarim-match-detail-label">Seçim</span>
                                <span className="kuponlarim-match-detail-value">
                                  {match.selection_display || match.selection}
                                </span>
                              </div>
                              <div className="kuponlarim-match-detail">
                                <span className="kuponlarim-match-detail-label">Oran</span>
                                <span className="kuponlarim-match-detail-value kuponlarim-match-odd">
                                  {Number(match.odd || 0).toFixed(2)}
                                </span>
                              </div>
                              {match.market_label && (
                                <span className="kuponlarim-match-market">
                                  ({match.market_label})
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {renameId !== coupon.id && (
                  <div className="kuponlarim-card-actions">
                    {deleteConfirmId === coupon.id ? (
                      <div className="kuponlarim-delete-confirm">
                        <span className="kuponlarim-delete-text">
                          {t.myCoupons?.confirmDelete ?? "Delete?"}
                        </span>
                        <button
                          type="button"
                          className="kuponlarim-action-btn danger"
                          disabled={actionLoading}
                          onClick={() => handleDelete(coupon.id)}
                        >
                          {t.myCoupons?.deleteAction ?? "Yes, delete"}
                        </button>
                        <button
                          type="button"
                          className="kuponlarim-action-btn"
                          disabled={actionLoading}
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          {t.myCoupons?.cancel ?? "Cancel"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="kuponlarim-action-btn"
                          disabled={actionLoading}
                          onClick={() => openRename(coupon)}
                        >
                          ✏️ {t.myCoupons?.renameAction ?? "Rename"}
                        </button>
                        {archived ? (
                          <button
                            type="button"
                            className="kuponlarim-action-btn"
                            disabled={actionLoading}
                            onClick={() => handleRestore(coupon.id)}
                          >
                            ↩️ {t.myCoupons?.restoreAction ?? "Restore"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="kuponlarim-action-btn"
                            disabled={actionLoading}
                            onClick={() => handleArchive(coupon.id)}
                          >
                            📦 {t.myCoupons?.archiveAction ?? "Archive"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="kuponlarim-action-btn danger"
                          disabled={actionLoading}
                          onClick={() => setDeleteConfirmId(coupon.id)}
                        >
                          🗑️ {t.myCoupons?.deleteAction ?? "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
