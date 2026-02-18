import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AUTH_TOKEN_KEY, readAuthToken } from "../../lib/auth";
import { resolveSlipPickKey } from "../../lib/couponSlip";
import { useCouponSlip } from "../../state/coupon/CouponSlipContext";

const HIDDEN_PATHNAMES = new Set(["/login", "/register", "/forgot-password"]);
const COUPON_COUNT_OPTIONS = [1, 2, 3, 5];
const STAKE_OPTIONS = [10, 20, 50, 100];

function oddText(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 1) return "-";
  return parsed.toFixed(2);
}

function moneyText(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${parsed.toFixed(2)} TL`;
}

export default function StickyCouponDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasToken, setHasToken] = useState(() => !!readAuthToken());

  const {
    items,
    itemCount,
    couponCount,
    stake,
    isOpen,
    totalOdds,
    couponAmount,
    maxWin,
    removePick,
    clearSlip,
    setCouponCount,
    setStake,
    open,
    close,
  } = useCouponSlip();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncAuth = () => {
      setHasToken(!!readAuthToken());
    };

    const onStorage = (event) => {
      if (!event.key || event.key === AUTH_TOKEN_KEY) {
        syncAuth();
      }
    };

    syncAuth();
    window.addEventListener("auth-token-changed", syncAuth);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("auth-token-changed", syncAuth);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isHiddenRoute = HIDDEN_PATHNAMES.has(location.pathname);
  const shouldShowDock = hasToken && !isHiddenRoute;

  useEffect(() => {
    if (!shouldShowDock || !isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shouldShowDock, isOpen, close]);

  const previewItems = useMemo(() => items.slice(0, 4), [items]);
  const hiddenItemCount = Math.max(0, items.length - previewItems.length);

  if (!shouldShowDock) return null;

  return (
    <div className="coupon-dock-shell">
      {!isOpen ? (
        <button
          type="button"
          className="coupon-dock-toggle"
          onClick={open}
          aria-expanded={false}
          aria-controls="coupon-dock-panel"
        >
          <span>Kuponum</span>
          <span className="coupon-chevron" aria-hidden>
            ˄
          </span>
        </button>
      ) : (
        <aside id="coupon-dock-panel" className="coupon-dock-panel card" aria-live="polite">
          <div className="coupon-dock-header">
            <div>
              <h3>Kuponum</h3>
              <span>{itemCount} Maç</span>
            </div>
            <button
              type="button"
              className="coupon-dock-toggle-btn"
              onClick={close}
              aria-expanded={true}
              aria-controls="coupon-dock-panel"
              aria-label="Kupon panelini kapat"
            >
              <span className="coupon-chevron is-open" aria-hidden>
                ˄
              </span>
            </button>
          </div>

          <div className="coupon-dock-controls">
            <label>
              Kupon Adedi
              <select value={couponCount} onChange={(event) => setCouponCount(Number(event.target.value || 1))}>
                {COUPON_COUNT_OPTIONS.map((value) => (
                  <option key={`coupon-count-${value}`} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Misli
              <select value={stake} onChange={(event) => setStake(Number(event.target.value || 50))}>
                {STAKE_OPTIONS.map((value) => (
                  <option key={`coupon-stake-${value}`} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="coupon-dock-list">
            {previewItems.length ? (
              previewItems.map((item) => {
                const pickKey = resolveSlipPickKey(item);
                return (
                  <article key={`coupon-dock-item-${pickKey}`} className="coupon-dock-item">
                    <div>
                      <strong>
                        {item.home_team_name} - {item.away_team_name}
                      </strong>
                      <span>
                        {item.selection_display || item.selection} / {oddText(item.odd)}
                      </span>
                    </div>
                    <button type="button" className="smart-mini-btn danger" onClick={() => removePick(pickKey)}>
                      Sil
                    </button>
                  </article>
                );
              })
            ) : (
              <p className="small-text">Kuponun boş. Oran tahtasından seçim ekleyebilirsin.</p>
            )}
            {hiddenItemCount > 0 ? <p className="small-text">+{hiddenItemCount} seçim daha var.</p> : null}
          </div>

          <div className="coupon-dock-summary">
            <div className="row spread">
              <span>Toplam Oran</span>
              <strong>{totalOdds > 0 ? totalOdds.toFixed(2) : "-"}</strong>
            </div>
            <div className="row spread">
              <span>Kupon Bedeli</span>
              <strong>{moneyText(couponAmount)}</strong>
            </div>
            <div className="row spread">
              <span>Maksimum Kazanç</span>
              <strong>{maxWin > 0 ? moneyText(maxWin) : "-"}</strong>
            </div>
          </div>

          <div className="coupon-dock-actions">
            <button type="button" className="smart-mini-btn" onClick={() => navigate("/oran-tahtasi")}>
              Oran Tahtasına Git
            </button>
            <button
              type="button"
              className="smart-mini-btn danger"
              onClick={clearSlip}
              disabled={!items.length}
            >
              Kuponu Temizle
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
