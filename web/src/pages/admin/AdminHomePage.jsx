import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import ActionButton from "../../components/dashboard/ActionButton";
import OperationStatus from "../../components/dashboard/OperationStatus";

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
        if (!ctx) throw new Error("Tarayici canvas destegi bulunamadi.");
        ctx.drawImage(image, 0, 0, width, height);
        let dataUrl = canvas.toDataURL(SLIDER_EXPORT_TYPE, SLIDER_EXPORT_QUALITY);
        if (!dataUrl || dataUrl.length < 20) dataUrl = canvas.toDataURL("image/jpeg", 0.86);
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

function clampProgress(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export default function AdminHomePage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const [loadingMap, setLoadingMap] = useState({});
  const [operations, setOperations] = useState({});

  const [sliderImagesAdmin, setSliderImagesAdmin] = useState([]);
  const [sliderDraftImages, setSliderDraftImages] = useState([]);
  const [sliderUploadMessage, setSliderUploadMessage] = useState("");
  const [sliderUploadError, setSliderUploadError] = useState("");

  const [managedUsers, setManagedUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    password: "",
    role: "user",
    credits: "100",
  });
  const [creditDrafts, setCreditDrafts] = useState({});
  const [passwordDrafts, setPasswordDrafts] = useState({});

  const [paymentNotices, setPaymentNotices] = useState([]);
  const [paymentStatusDrafts, setPaymentStatusDrafts] = useState({});

  const isSuperAdmin = currentUser?.role === "superadmin";
  const isManager = currentUser?.role === "admin" || currentUser?.role === "superadmin";

  const isLoading = (key) => !!loadingMap[key];
  const setOperation = (key, patch) => {
    setOperations((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  };
  const clearOperation = (key, delayMs = 1800) => {
    window.setTimeout(() => {
      setOperations((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, delayMs);
  };
  const runOperation = async (key, config, fn) => {
    const opts = { start: 10, stage: "Isleniyor", successStage: "Tamamlandi", clearMs: 1800, ...config };
    setLoadingMap((prev) => ({ ...prev, [key]: true }));
    setOperation(key, { progress: clampProgress(opts.start), stage: opts.stage, indeterminate: false, error: false });
    try {
      const result = await fn({ setProgress: (p, s) => setOperation(key, { progress: clampProgress(p), stage: s || opts.stage }) });
      setOperation(key, { progress: 100, stage: opts.successStage });
      clearOperation(key, opts.clearMs);
      setError("");
      return result;
    } catch (err) {
      setError(err.message || "Islem basarisiz.");
      return undefined;
    } finally {
      setLoadingMap((prev) => ({ ...prev, [key]: false }));
    }
  };
  const operationFor = (...keys) => {
    for (const k of keys) {
      if (operations[k]) return operations[k];
    }
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    apiRequest("/auth/me")
      .then((profile) => {
        if (!cancelled) setCurrentUser(profile || null);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setSliderDraftImages(Array.isArray(sliderImagesAdmin) ? sliderImagesAdmin.slice(0, MAX_SLIDER_IMAGES) : []);
  }, [sliderImagesAdmin]);

  const loadSliderImages = useCallback(
    async (silent = false) => {
      if (!isSuperAdmin) return;
      const apply = (payload) => {
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        const urls = rows.map((r) => String(r?.image_url || "").trim()).filter(Boolean).slice(0, 10);
        setSliderImagesAdmin(urls);
      };
      if (silent) {
        try {
          const payload = await apiRequest("/admin/slider-images");
          apply(payload);
        } catch {
          setSliderImagesAdmin([]);
        }
        return;
      }
      const payload = await runOperation(
        "slider-images-load",
        { start: 12, stage: "Slider gorselleri yukleniyor", successStage: "Guncel", clearMs: 1000 },
        async ({ setProgress }) => {
          setProgress(82, "Hazirlaniyor");
          return apiRequest("/admin/slider-images");
        }
      );
      if (payload) apply(payload);
    },
    [isSuperAdmin]
  );

  const saveSliderImages = useCallback(
    async (images = []) => {
      if (!isSuperAdmin) {
        setError("Bu islem sadece superadmin icindir.");
        return false;
      }
      const normalized = (Array.isArray(images) ? images : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10);
      const rows = normalized.map((imageUrl, index) => ({ image_url: imageUrl, display_order: index, is_active: true }));
      const payload = await runOperation(
        "slider-images-save",
        { start: 14, stage: "Kaydediliyor", successStage: "Kaydedildi", clearMs: 1200 },
        async ({ setProgress }) => {
          setProgress(86, "Yenileniyor");
          const res = await apiRequest("/admin/slider-images", { method: "PUT", body: JSON.stringify({ rows }) });
          return res;
        }
      );
      if (payload) {
        const resultRows = Array.isArray(payload?.items) ? payload.items : [];
        setSliderImagesAdmin(resultRows.map((r) => String(r?.image_url || "").trim()).filter(Boolean).slice(0, 10));
      }
      return !!payload;
    },
    [isSuperAdmin]
  );

  const loadManagedUsers = useCallback(
    async (silent = false) => {
      if (!isManager) return;
      const apply = (payload) => setManagedUsers(payload?.items || []);
      if (silent) {
        try {
          const payload = await apiRequest("/admin/users?limit=500");
          apply(payload);
        } catch {
          setManagedUsers([]);
        }
        return;
      }
      const payload = await runOperation(
        "users-load",
        { start: 15, stage: "Kullanicilar yukleniyor", successStage: "Guncel", clearMs: 1200 },
        async ({ setProgress }) => {
          setProgress(82, "Hazirlaniyor");
          return apiRequest("/admin/users?limit=500");
        }
      );
      if (payload) apply(payload);
    },
    [isManager]
  );

  const loadPaymentNotices = useCallback(
    async (silent = false) => {
      if (!isManager) return;
      const apply = (payload) => setPaymentNotices(payload?.items || []);
      if (silent) {
        try {
          const payload = await apiRequest("/admin/payments/notices?limit=200");
          apply(payload);
        } catch {
          setPaymentNotices([]);
        }
        return;
      }
      const payload = await runOperation(
        "payments-load",
        { start: 16, stage: "Odeme bildirimleri yukleniyor", successStage: "Guncel", clearMs: 1200 },
        async ({ setProgress }) => {
          setProgress(85, "Hazirlaniyor");
          return apiRequest("/admin/payments/notices?limit=200");
        }
      );
      if (payload) apply(payload);
    },
    [isManager]
  );

  const resolveTodayLocalISO = () => {
    const base = new Date();
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().slice(0, 10);
  };

  const refreshTodayFixturesCache = async () => {
    const todayIso = resolveTodayLocalISO();
    await runOperation(
      "fixtures-cache-refresh-today",
      {
        start: 18,
        stage: "Bugunun mac cache'i yenileniyor",
        successStage: "Mac cache guncellendi",
        clearMs: 1600,
      },
      async () => {
        await apiRequest("/admin/tasks/fixtures-cache-refresh", {
          method: "POST",
          body: JSON.stringify({
            date_from: todayIso,
            date_to: todayIso,
            league_ids: null,
          }),
        });
      }
    );
  };

  useEffect(() => {
    if (isSuperAdmin) loadSliderImages(true);
  }, [isSuperAdmin, loadSliderImages]);
  useEffect(() => {
    if (isManager) {
      loadManagedUsers(true);
      loadPaymentNotices(true);
    }
  }, [isManager, loadManagedUsers, loadPaymentNotices]);

  const handleSliderUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
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
    const selected = imageFiles.slice(0, remaining);
    try {
      const encoded = await Promise.all(selected.map((f) => fileToDataURL(f)));
      const next = [...sliderDraftImages, ...encoded].slice(0, MAX_SLIDER_IMAGES);
      setSliderDraftImages(next);
      setSliderUploadError("");
      setSliderUploadMessage(`${encoded.length} gorsel ekleniyor...`);
      const ok = await saveSliderImages(next);
      if (!ok) {
        setSliderUploadError("Gorseller yayina alinamadi.");
        setSliderUploadMessage("");
        return;
      }
      await loadSliderImages(true);
      setSliderUploadMessage(`${encoded.length} gorsel yayinlandi.`);
      setSliderUploadError("");
    } catch (err) {
      setSliderUploadError(err.message || "Yukleme hatasi.");
      setSliderUploadMessage("");
    }
  };

  const removeSliderDraftImage = (index) => {
    setSliderDraftImages((prev) => prev.filter((_, i) => i !== index));
    setSliderUploadMessage("Gorsel kaldirildi.");
    setSliderUploadError("");
  };

  const saveSliderDraftImages = async () => {
    const ok = await saveSliderImages(sliderDraftImages);
    if (!ok) return;
    await loadSliderImages(true);
    setSliderUploadError("");
    setSliderUploadMessage("Slider yayinlandi.");
  };

  const resetSliderToDefaults = async () => {
    const ok = await saveSliderImages([]);
    if (!ok) return;
    await loadSliderImages(true);
    setSliderUploadError("");
    setSliderUploadMessage("Varsayilana donuldu.");
  };

  const createManagedUser = async () => {
    const email = (newUserForm.email || "").trim().toLowerCase();
    const password = newUserForm.password || "";
    const role = (newUserForm.role || "user").trim();
    const creditsText = (newUserForm.credits || "").trim();
    if (!email) {
      setError("Email gerekli.");
      return;
    }
    if (password.length < 6) {
      setError("Sifre en az 6 karakter olmali.");
      return;
    }
    let creditsValue = null;
    if (creditsText !== "") {
      const parsed = Number(creditsText);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Kredi 0 veya daha buyuk olmali.");
        return;
      }
      creditsValue = Math.floor(parsed);
    }
    const result = await runOperation(
      "users-create",
      { start: 12, stage: "Kullanici olusturuluyor", successStage: "Olusturuldu", clearMs: 1500 },
      async () => {
        await apiRequest("/admin/users", {
          method: "POST",
          body: JSON.stringify({ email, password, role, credits: creditsValue }),
        });
        await loadManagedUsers(true);
        return true;
      }
    );
    if (result !== undefined) {
      setNewUserForm({ email: "", password: "", role: "user", credits: "100" });
      setError("");
    }
  };

  const updateManagedUserCredits = async (userId) => {
    const delta = Number(creditDrafts[userId]);
    if (!Number.isFinite(delta) || delta === 0) {
      setError("Kredi degisikligi icin 0 disi deger gir.");
      return;
    }
    const result = await runOperation(
      `users-credits-${userId}`,
      { start: 10, stage: "Kredi guncelleniyor", successStage: "Guncellendi", clearMs: 1000 },
      async () => {
        const payload = await apiRequest(`/admin/users/${userId}/credits`, {
          method: "POST",
          body: JSON.stringify({ delta: Math.trunc(delta), reason: "panel_manual_adjustment" }),
        });
        setManagedUsers((prev) => prev.map((u) => (Number(u.id) === Number(userId) ? payload.user || u : u)));
        return payload;
      }
    );
    if (result !== undefined) {
      setCreditDrafts((prev) => ({ ...prev, [userId]: "" }));
      setError("");
    }
  };

  const setManagedUserPassword = async (userId) => {
    const nextPassword = passwordDrafts[userId] || "";
    if (nextPassword.length < 6) {
      setError("Sifre en az 6 karakter olmali.");
      return;
    }
    const result = await runOperation(
      `users-password-${userId}`,
      { start: 10, stage: "Sifre guncelleniyor", successStage: "Guncellendi", clearMs: 1000 },
      async () => {
        await apiRequest(`/admin/users/${userId}/password`, {
          method: "POST",
          body: JSON.stringify({ new_password: nextPassword }),
        });
      }
    );
    if (result !== undefined) {
      setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
      setError("");
    }
  };

  const setPaymentNoticeStatus = async (noticeId, nextStatus) => {
    const result = await runOperation(
      `payments-status-${noticeId}`,
      { start: 12, stage: "Durum guncelleniyor", successStage: "Guncellendi", clearMs: 1000 },
      async () => {
        const response = await apiRequest(`/admin/payments/notices/${noticeId}/status`, {
          method: "POST",
          body: JSON.stringify({ status: nextStatus, admin_note: paymentStatusDrafts[noticeId] || null }),
        });
        setPaymentNotices((prev) => prev.map((row) => (Number(row.id) === Number(noticeId) ? response.notice || row : row)));
        setPaymentStatusDrafts((prev) => ({ ...prev, [noticeId]: "" }));
        return response;
      }
    );
    if (result !== undefined) setError("");
  };

  const deletePaymentNotice = async (noticeId) => {
    const target = paymentNotices.find((r) => Number(r.id) === Number(noticeId));
    if (!target) {
      setError("Bildirim bulunamadi.");
      return;
    }
    if (String(target.status || "").toLowerCase() !== "rejected") {
      setError("Sadece reddedilen bildirimler silinebilir.");
      return;
    }
    if (!window.confirm("Bu reddedilen bildirimi silmek istiyor musun?")) return;
    const result = await runOperation(
      `payments-delete-${noticeId}`,
      { start: 14, stage: "Siliniyor", successStage: "Silindi", clearMs: 1100 },
      async () => {
        await apiRequest(`/admin/payments/notices/${noticeId}`, { method: "DELETE" });
        setPaymentNotices((prev) => prev.filter((r) => Number(r.id) !== Number(noticeId)));
        setPaymentStatusDrafts((prev) => {
          const next = { ...prev };
          delete next[noticeId];
          return next;
        });
      }
    );
    if (result !== undefined) setError("");
  };

  if (!currentUser) {
    return (
      <div className="container">
        <div className="card">Yukleniyor...</div>
      </div>
    );
  }

  return (
    <div className="container">
      {error ? <div className="error">{error}</div> : null}

      {isManager ? (
        <section className="grid">
          <div className="card">
            <h2>Bugunun Mac Cache'i</h2>
            <p className="help-text">
              SportMonks'tan bugunun maclarini cekip fixture cache tablosuna kaydeder. Public sayfalarda bugun icin bu
              cache kullanilir. Islemi gunde bir kez calistirman genelde yeterlidir.
            </p>
            <OperationStatus op={operationFor("fixtures-cache-refresh-today")} />
            <ActionButton
              loading={isLoading("fixtures-cache-refresh-today")}
              loadingText="Cache yenileniyor..."
              onClick={refreshTodayFixturesCache}
              disabled={isLoading("fixtures-cache-refresh-today")}
            >
              Bugunun Maclarini Yenile (SportMonks)
            </ActionButton>
          </div>
        </section>
      ) : null}

      {isSuperAdmin ? (
        <section className="grid">
          <div className="card wide guest-upload-zone">
            <div className="row spread wrap">
              <h2>Ana Sayfa Slider Yonetimi (Superadmin)</h2>
              <div className="row wrap">
                <ActionButton className="secondary" onClick={() => navigate("/admin/vitrin")}>
                  AI Tahmin Karti / Vitrin
                </ActionButton>
                <ActionButton
                  className="secondary"
                  loading={isLoading("slider-images-load")}
                  loadingText="Yenileniyor..."
                  onClick={() => loadSliderImages(false)}
                >
                  Sunucudan Yenile
                </ActionButton>
                <ActionButton className="secondary" onClick={resetSliderToDefaults}>
                  Varsayilana Don
                </ActionButton>
              </div>
            </div>
            <p className="help-text">
              Slider gorsellerini sadece superadmin guncelleyebilir. Dosya secildiginde otomatik yayinlanir.
            </p>
            <OperationStatus op={operationFor("slider-images-load", "slider-images-save")} />
            {sliderUploadError ? <div className="error">{sliderUploadError}</div> : null}
            {sliderUploadMessage ? <div className="success-box">{sliderUploadMessage}</div> : null}
            <label className="guest-upload-input">
              <span>Gorsel Sec (JPG/PNG/WEBP)</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={isLoading("slider-images-save")}
                onChange={handleSliderUpload}
              />
            </label>
            <div className="guest-thumb-grid">
              {sliderDraftImages.map((image, index) => (
                <article key={`admin-slider-${index}`} className="guest-thumb">
                  <img src={image} alt={`Slider ${index + 1}`} />
                  <div className="guest-thumb-actions">
                    <button type="button" onClick={() => removeSliderDraftImage(index)}>
                      Kaldir
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!sliderDraftImages.length ? <div className="small-text">Henuz slider gorseli yok.</div> : null}
            <div className="row">
              <ActionButton
                className="accent-gradient"
                loading={isLoading("slider-images-save")}
                loadingText="Kaydediliyor..."
                onClick={saveSliderDraftImages}
              >
                Slideri Yayina Al
              </ActionButton>
            </div>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section className="grid">
          <div className="card wide">
            <h2>Kullanici Yonetimi</h2>
            <p className="help-text">
              Admin ve superadmin kullanici olusturabilir, sifre degistirebilir ve kredi ekleyip/cikarabilir.
            </p>
            <OperationStatus op={operationFor("users-load", "users-create")} />
            <div className="row wrap">
              <input
                placeholder="Yeni kullanici email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                type="password"
                placeholder="Sifre (min 6)"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
              />
              <select
                value={newUserForm.role}
                onChange={(e) => setNewUserForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                {currentUser.role === "superadmin" ? <option value="superadmin">superadmin</option> : null}
              </select>
              <input
                type="number"
                min="0"
                placeholder="Baslangic kredi (default 100)"
                value={newUserForm.credits}
                onChange={(e) => setNewUserForm((prev) => ({ ...prev, credits: e.target.value }))}
              />
            </div>
            <div className="row">
              <ActionButton loading={isLoading("users-create")} loadingText="Olusturuluyor..." onClick={createManagedUser}>
                Kullanici Ekle
              </ActionButton>
              <ActionButton
                className="secondary"
                loading={isLoading("users-load")}
                loadingText="Yenileniyor..."
                onClick={() => loadManagedUsers(false)}
              >
                Kullanicilari Yenile
              </ActionButton>
            </div>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Kredi</th>
                  <th>Kredi Islem</th>
                  <th>Sifre Islem</th>
                </tr>
              </thead>
              <tbody>
                {(managedUsers || []).map((user) => (
                  <tr key={`managed-user-${user.id}`}>
                    <td>{user.id}</td>
                    <td>{user.email || user.username}</td>
                    <td>{user.role}</td>
                    <td>{user.credits}</td>
                    <td>
                      <div className="row wrap">
                        <input
                          type="number"
                          placeholder="+/- kredi"
                          value={creditDrafts[user.id] ?? ""}
                          onChange={(e) => setCreditDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                        />
                        <ActionButton
                          loading={isLoading(`users-credits-${user.id}`)}
                          loadingText="Guncelleniyor..."
                          onClick={() => updateManagedUserCredits(user.id)}
                        >
                          Krediyi Guncelle
                        </ActionButton>
                      </div>
                    </td>
                    <td>
                      <div className="row wrap">
                        <input
                          type="password"
                          placeholder="Yeni sifre"
                          value={passwordDrafts[user.id] ?? ""}
                          onChange={(e) => setPasswordDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                        />
                        <ActionButton
                          loading={isLoading(`users-password-${user.id}`)}
                          loadingText="Kaydediliyor..."
                          onClick={() => setManagedUserPassword(user.id)}
                        >
                          Sifreyi Degistir
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {!managedUsers?.length ? (
                  <tr>
                    <td colSpan={6}>Kullanici bulunamadi.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <h3>Odeme Bildirimleri</h3>
            <p className="help-text">Kullanicilarin gonderdigi transaction id bildirimleri.</p>
            <OperationStatus op={operationFor("payments-load")} />
            <div className="row">
              <ActionButton
                className="accent-gradient"
                loading={isLoading("payments-load")}
                loadingText="Yukleniyor..."
                onClick={() => loadPaymentNotices(false)}
              >
                Bildirimleri Yenile
              </ActionButton>
            </div>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Kullanici</th>
                  <th>Paket</th>
                  <th>Chain</th>
                  <th>TxID</th>
                  <th>Durum</th>
                  <th>Islem</th>
                </tr>
              </thead>
              <tbody>
                {(paymentNotices || []).map((notice) => (
                  <tr key={`payment-notice-${notice.id}`}>
                    <td>{notice.id}</td>
                    <td>
                      {notice.username}
                      <div className="small-text">{notice.telegram_contact || "-"}</div>
                    </td>
                    <td>
                      {notice.package_title}
                      <div className="small-text">{notice.amount_tl} TL</div>
                    </td>
                    <td>{notice.chain}</td>
                    <td><code>{notice.transaction_id}</code></td>
                    <td>{notice.status}</td>
                    <td>
                      <div className="row wrap">
                        <input
                          placeholder="admin notu"
                          value={paymentStatusDrafts[notice.id] ?? ""}
                          onChange={(e) => setPaymentStatusDrafts((prev) => ({ ...prev, [notice.id]: e.target.value }))}
                        />
                        <ActionButton
                          className="accent-gradient"
                          loading={isLoading(`payments-status-${notice.id}`)}
                          loadingText="Onay..."
                          onClick={() => setPaymentNoticeStatus(notice.id, "approved")}
                        >
                          Onayla
                        </ActionButton>
                        <ActionButton
                          className="secondary"
                          loading={isLoading(`payments-status-${notice.id}`)}
                          loadingText="Reddediliyor..."
                          onClick={() => setPaymentNoticeStatus(notice.id, "rejected")}
                        >
                          Reddet
                        </ActionButton>
                        {String(notice.status || "").toLowerCase() === "rejected" ? (
                          <ActionButton
                            className="secondary"
                            loading={isLoading(`payments-delete-${notice.id}`)}
                            loadingText="Siliniyor..."
                            onClick={() => deletePaymentNotice(notice.id)}
                          >
                            Reddedileni Sil
                          </ActionButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!paymentNotices?.length ? (
                  <tr>
                    <td colSpan={7}>Henuz odeme bildirimi yok.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
