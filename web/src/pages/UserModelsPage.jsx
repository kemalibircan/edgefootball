import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import OperationStatus from "../components/dashboard/OperationStatus";
import ProgressBar from "../components/dashboard/ProgressBar";
import { apiRequest } from "../lib/api";
import {
  fetchAllModels,
  parseModelLeagueId,
  resolveModelScope,
  isVisibleForCurrentUser,
} from "../lib/modelCatalog";
import { readAuthToken } from "../lib/auth";

function formatDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("tr-TR");
}

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

export default function UserModelsPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const [selectedModelId, setSelectedModelId] = useState("");
  const [trainingPreview, setTrainingPreview] = useState([]);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingError, setTrainingError] = useState("");
  const [allTraining, setAllTraining] = useState(null);
  const [selectedTrainingFixtureId, setSelectedTrainingFixtureId] = useState("");

  const [activeOp, setActiveOp] = useState(null);

  useEffect(() => {
    if (!readAuthToken()) {
      setCurrentUser(null);
      setLoadingProfile(false);
      return;
    }
    let cancelled = false;
    const loadProfile = async () => {
      setLoadingProfile(true);
      setProfileError("");
      try {
        const profile = await apiRequest("/auth/me");
        if (cancelled) return;
        setCurrentUser(profile || null);
      } catch (err) {
        if (cancelled) return;
        setProfileError(err?.message || "Profil bilgisi yüklenemedi.");
        setCurrentUser(null);
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !currentUser.advanced_mode_enabled) {
      setModels([]);
      setSelectedModelId("");
      return;
    }
    let cancelled = false;
    const loadModels = async () => {
      setModelsLoading(true);
      setModelsError("");
      try {
        setActiveOp({
          key: "user-models-load",
          stage: "Modeller yükleniyor",
          progress: 24,
        });
        const payload = await fetchAllModels(apiRequest);
        if (cancelled) return;
        const allItems = Array.isArray(payload?.items) ? payload.items : [];
        const visible = allItems.filter((item) => isVisibleForCurrentUser(item, currentUser));
        setModels(visible);
        if (visible.length && !selectedModelId) {
          setSelectedModelId(String(visible[0].model_id || ""));
        }
        setActiveOp({
          key: "user-models-load",
          stage: "Modeller hazır",
          progress: 100,
        });
      } catch (err) {
        if (cancelled) return;
        setModels([]);
        setModelsError(err?.message || "Modeller yüklenemedi.");
        setActiveOp({
          key: "user-models-load",
          stage: "Hata oluştu",
          progress: 100,
          error: true,
        });
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    };
    loadModels();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.advanced_mode_enabled, selectedModelId]);

  useEffect(() => {
    if (!currentUser || !currentUser.advanced_mode_enabled) {
      setTrainingPreview([]);
      setAllTraining(null);
      return;
    }
    if (!selectedModelId) {
      setTrainingPreview([]);
      setAllTraining(null);
      return;
    }
    let cancelled = false;
    const loadPreview = async () => {
      setTrainingLoading(true);
      setTrainingError("");
      try {
        setActiveOp({
          key: "user-training-preview",
          stage: "Eğitim maçları yükleniyor",
          progress: 32,
        });
        const endpoint = `/admin/models/${selectedModelId}/training-matches?page=1&page_size=12`;
        const payload = await apiRequest(endpoint);
        if (cancelled) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setAllTraining(payload || null);
        setTrainingPreview(items.slice(0, 3));
        setSelectedTrainingFixtureId("");
        setActiveOp({
          key: "user-training-preview",
          stage: "Eğitim maçları hazır",
          progress: 100,
        });
      } catch (err) {
        if (cancelled) return;
        setAllTraining(null);
        setTrainingPreview([]);
        setTrainingError(err?.message || "Eğitim maçları yüklenemedi.");
        setActiveOp({
          key: "user-training-preview",
          stage: "Hata oluştu",
          progress: 100,
          error: true,
        });
      } finally {
        if (!cancelled) {
          setTrainingLoading(false);
        }
      }
    };
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.advanced_mode_enabled, selectedModelId]);

  const selectedModel = useMemo(
    () => models.find((item) => String(item.model_id) === String(selectedModelId)) || null,
    [models, selectedModelId]
  );

  const trainingItems = useMemo(
    () => (Array.isArray(allTraining?.items) ? allTraining.items : []),
    [allTraining]
  );

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

  const leagueLabelFor = (model) => {
    const leagueId = parseModelLeagueId(model);
    if (leagueId === null) return null;
    return `Lig ${leagueId}`;
  };

  if (!readAuthToken()) {
    return <Navigate to="/login" replace />;
  }

  if (loadingProfile) {
    return (
      <div className="container">
        <section className="card wide">
          <h2>Pro Modellerim</h2>
          <p className="small-text">Profil bilgilerin yükleniyor...</p>
        </section>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="container">
        <section className="card wide">
          <h2>Pro Modellerim</h2>
          <p className="small-text">{profileError || "Profil bilgisi alınamadı."}</p>
        </section>
      </div>
    );
  }

  const isPro = !!currentUser.advanced_mode_enabled;

  return (
    <div className="container">
      <section className="card wide">
        <h2>Pro Modellerim</h2>
        <p className="help-text">
          Bu ekran, sadece senin hesabına bağlı yapay zeka modellerini ve eğitimde kullanılan maçları gösterir.
        </p>
        {!isPro ? (
          <div className="row wrap" style={{ marginTop: 12 }}>
            <div className="small-text" style={{ maxWidth: 520 }}>
              Pro model sayfasına erişmek için önce <strong>Advanced Mode (500 TL)</strong> paketini satın alman
              gerekir. Ödeme sonrası hesabında Advanced Mode aktif olur ve kendi modellerini eğitip
              inceleyebilirsin.
            </div>
            <ActionButton
              className="accent-gradient"
              onClick={() => {
                navigate("/token-purchase");
              }}
            >
              Advanced Mode Satın Al
            </ActionButton>
          </div>
        ) : null}
        {profileError && <div className="error" style={{ marginTop: 12 }}>{profileError}</div>}
      </section>

      {isPro ? (
        <>
          <section className="grid">
            <div className="card">
              <h3>Modellerim</h3>
              <p className="small-text">
                Burada hem sistemin sunduğu hazır modelleri hem de senin eğittiğin kullanıcı modellerini görebilirsin.
              </p>
              <OperationStatus
                op={
                  activeOp && activeOp.key === "user-models-load"
                    ? {
                        stage: activeOp.stage,
                        meta: { progress: activeOp.progress },
                        ready: activeOp.progress >= 100,
                        successful: !activeOp.error,
                      }
                    : null
                }
              />
              {modelsLoading ? <p className="small-text">Modeller yükleniyor...</p> : null}
              {modelsError ? <div className="error">{modelsError}</div> : null}
              {!modelsLoading && !models.length ? (
                <p className="small-text">
                  Henüz görüntülenebilir model bulunamadı. Advanced Mode açıkken admin paneli üzerinden model
                  eğitimi başlatılabilir.
                </p>
              ) : null}
              <div className="model-list">
                {models.map((item) => {
                  const scope = resolveModelScope(item);
                  const leagueLabel = leagueLabelFor(item);
                  const isSelected = String(item.model_id) === String(selectedModelId);
                  return (
                    <button
                      key={item.model_id}
                      type="button"
                      className={`model-item ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedModelId(String(item.model_id))}
                    >
                      <span className="model-item-title">{item.model_name || item.model_id}</span>
                      <span className="model-item-chips">
                        <span className={`model-chip ${scope === "ready" ? "ready" : "mine"}`}>
                          {scope === "ready"
                            ? "Hazır Yapay Zeka"
                            : item.is_owned_by_me
                            ? "Senin Yapay Zekân"
                            : "Kullanıcı Modeli"}
                        </span>
                        {leagueLabel ? <span className="model-chip">{leagueLabel}</span> : null}
                        {item.is_active ? <span className="model-chip active">Aktif</span> : null}
                      </span>
                      <small>
                        {item.created_by_username ? `Oluşturan: ${item.created_by_username} | ` : ""}
                        {formatDate(item.trained_at)}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h3>Seçili Model Özeti</h3>
              {!selectedModel ? (
                <p className="small-text">Önce soldan bir model seçmelisin.</p>
              ) : (
                <>
                  <p className="small-text">
                    Model: <strong>{selectedModel.model_name || selectedModel.model_id}</strong>
                  </p>
                  <p className="small-text">Model ID: {selectedModel.model_id}</p>
                  <p className="small-text">
                    Tür: {resolveModelScope(selectedModel) === "ready" ? "Hazır Yapay Zeka" : "Kullanıcı Modeli"}
                  </p>
                  <p className="small-text">Versiyon: {selectedModel.version}</p>
                  <p className="small-text">
                    Kullanılan satır sayısı: {selectedModel.meta?.rows_used ?? "-"}
                  </p>
                  <p className="small-text">
                    Eğitim tarihi: {formatDate(selectedModel.trained_at)}
                  </p>
                </>
              )}
              <h4 style={{ marginTop: 16 }}>Son 3 Eğitim Maçı</h4>
              {trainingLoading && <p className="small-text">Eğitim maçları yükleniyor...</p>}
              {trainingError && <div className="error">{trainingError}</div>}
              {!trainingLoading && !trainingError && !trainingPreview.length && selectedModel ? (
                <p className="small-text">Bu model için kayıtlı eğitim maçı bulunamadı.</p>
              ) : null}
              <div className="training-preview-list">
                {trainingPreview.map((match) => (
                  <div
                    key={`preview-${selectedModelId}-${match.fixture_id}`}
                    className="training-preview-item"
                  >
                    <div className="small-text">
                      <strong>
                        {(match.home_team_name || `Team ${match.home_team_id ?? "-"}`) +
                          " vs " +
                          (match.away_team_name || `Team ${match.away_team_id ?? "-"}`)}
                      </strong>
                    </div>
                    <div className="small-text">{formatDate(match.event_date)}</div>
                    <div className="small-text">
                      Skor: {match.label_home_goals ?? "-"} - {match.label_away_goals ?? "-"}
                    </div>
                  </div>
                ))}
              </div>
              {selectedModel && trainingItems.length > 0 ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <ActionButton
                    className="secondary"
                    onClick={() => {
                      const first = trainingItems[0];
                      setSelectedTrainingFixtureId(first ? String(first.fixture_id || "") : "");
                    }}
                  >
                    Tüm Eğitim Maçlarını Gör
                  </ActionButton>
                </div>
              ) : null}
            </div>
          </section>

          {selectedModel && trainingItems.length > 0 ? (
            <section className="card wide">
              <h3>"{selectedModel.model_name || selectedModel.model_id}" Eğitim Maçları</h3>
              <p className="small-text">
                Toplam {allTraining?.total || trainingItems.length} maç | Sayfa {allTraining?.page || 1}/
                {allTraining?.total_pages || 1} | Kullanılan satır sayısı:{" "}
                {allTraining?.rows_used ?? "-"}
              </p>
              <div className="training-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fixture</th>
                      <th>Maç</th>
                      <th>Tarih</th>
                      <th>Skor</th>
                      <th>Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingItems.map((match) => (
                      <tr key={`user-tm-${selectedModel.model_id}-${match.fixture_id}`}>
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
                            className="small secondary"
                            onClick={() => setSelectedTrainingFixtureId(String(match.fixture_id || ""))}
                          >
                            Veri Detayı
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedTrainingMatch ? (
                <div className="training-match-detail" style={{ marginTop: 16 }}>
                  <h4>Maç Eğitim Verisi Detayı</h4>
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
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}


