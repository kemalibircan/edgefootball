import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { useCouponSlip } from "../../state/coupon/CouponSlipContext";
import { readAuthToken } from "../../lib/auth";
import { resolveSlipPickKey } from "../../lib/couponSlip";
import { requestCouponApi } from "../../lib/chatApi";
import TeamLogo from "../common/TeamLogo";
import "./ModernCouponDock.css";

const HIDDEN_PATHNAMES = new Set(["/login", "/register", "/forgot-password"]);
const COUPON_COUNT_OPTIONS = [1, 2, 3, 5, 10];
const STAKE_OPTIONS = [10, 20, 50, 100, 200, 500];

export default function ModernCouponDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const [hasToken, setHasToken] = useState(() => !!readAuthToken());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveInfo, setSaveInfo] = useState("");

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
    const syncAuth = () => {
      setHasToken(!!readAuthToken());
    };

    const onStorage = (event) => {
      if (!event.key || event.key === "football_ai_access_token") {
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

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  const isHiddenRoute = HIDDEN_PATHNAMES.has(location.pathname);
  const shouldShowDock = hasToken && !isHiddenRoute;

  const mapSlipItemToSavedItem = (item) => ({
    fixture_id: Number(item?.fixture_id),
    home_team_name: String(item?.home_team_name || "-"),
    away_team_name: String(item?.away_team_name || "-"),
    home_team_logo: null,
    away_team_logo: null,
    starting_at: item?.starting_at || null,
    selection: String(item?.selection || ""),
    odd: Number(item?.odd),
    league_id: null,
    league_name: null,
    market_key: item?.market_key || null,
    market_label: item?.market_label || null,
    line: item?.line || null,
    selection_display: item?.selection_display || null,
  });

  const handleSaveCoupon = async () => {
    if (!items.length) return;

    setSaving(true);
    setSaveError("");
    setSaveInfo("");
    try {
      const safeCouponCount = Math.max(1, Number(couponCount || 1));
      const safeStake = Math.max(1, Number(stake || 1));
      const totalOddsValue = Number(totalOdds);
      if (!Number.isFinite(totalOddsValue) || totalOddsValue <= 1) {
        throw new Error(locale === "tr" ? "Kupon orani gecersiz." : "Coupon odds are invalid.");
      }

      const mappedItems = items
        .map(mapSlipItemToSavedItem)
        .filter((item) => Number.isFinite(item.fixture_id) && item.fixture_id > 0 && item.selection && Number(item.odd) > 1);
      if (!mappedItems.length) {
        throw new Error(locale === "tr" ? "Kaydedilecek gecerli secim yok." : "No valid selections to save.");
      }

      const couponAmountValue = safeCouponCount * safeStake;
      const maxWinValue = couponAmountValue * totalOddsValue;
      const sourceTaskId =
        String(
          items.find((item) => String(item?.task_id || "").trim())?.task_id || ""
        ).trim() || undefined;
      await requestCouponApi("/saved", {
        method: "POST",
        body: JSON.stringify({
          name: `${t.coupon.title} ${new Date().toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}`,
          risk_level: "manual",
          source_task_id: sourceTaskId,
          items: mappedItems,
          summary: {
            coupon_count: safeCouponCount,
            stake: safeStake,
            total_odds: Number(totalOddsValue.toFixed(2)),
            coupon_amount: Number(couponAmountValue.toFixed(2)),
            max_win: Number(maxWinValue.toFixed(2)),
          },
        }),
      });
      setSaveInfo(locale === "tr" ? "Kupon kaydedildi." : "Coupon saved.");
      navigate("/kuponlarim");
    } catch (err) {
      setSaveError(String(err?.message || (locale === "tr" ? "Kupon kaydedilemedi." : "Coupon could not be saved.")));
    } finally {
      setSaving(false);
    }
  };

  if (!shouldShowDock) return null;

  return (
    <>
      {isOpen && <div className="modern-coupon-backdrop" onClick={close} />}
      
      <div className={`modern-coupon-dock ${isOpen ? "open" : "collapsed"}`}>
        {!isOpen ? (
          <button
            type="button"
            className="modern-coupon-toggle"
            onClick={open}
            aria-label={t.coupon.title}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            {itemCount > 0 && <span className="modern-coupon-badge">{itemCount}</span>}
          </button>
        ) : (
          <div className="modern-coupon-panel">
            <div className="modern-coupon-header">
              <div className="modern-coupon-header-title">
                <h3>{t.coupon.title}</h3>
                <span className="modern-coupon-count">
                  {itemCount} {t.coupon.matchCount}
                </span>
              </div>
              <button
                type="button"
                className="modern-coupon-close"
                onClick={close}
                aria-label="Close coupon"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modern-coupon-content">
              {items.length === 0 ? (
                <div className="modern-coupon-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                  <p>{t.coupon.emptySlip}</p>
                  <span>{t.coupon.emptySlipHint}</span>
                </div>
              ) : (
                <div className="modern-coupon-list">
                  {items.map((item) => {
                    const pickKey = resolveSlipPickKey(item);
                    return (
                      <div key={pickKey} className="modern-coupon-item">
                        <div className="modern-coupon-item-header">
                          <div className="modern-coupon-item-teams">
                            <TeamLogo
                              src={item.home_team_logo}
                              teamName={item.home_team_name}
                              size="sm"
                              showFallback={true}
                            />
                            <span className="modern-coupon-item-vs">vs</span>
                            <TeamLogo
                              src={item.away_team_logo}
                              teamName={item.away_team_name}
                              size="sm"
                              showFallback={true}
                            />
                          </div>
                          <button
                            type="button"
                            className="modern-coupon-item-remove"
                            onClick={() => removePick(pickKey)}
                            aria-label={t.coupon.remove}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                        <div className="modern-coupon-item-match">
                          {item.home_team_name} - {item.away_team_name}
                        </div>
                        <div className="modern-coupon-item-selection">
                          <span className="modern-coupon-item-pick">
                            {item.selection_display || item.selection}
                          </span>
                          <span className="modern-coupon-item-odd">{Number(item.odd).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {items.length > 0 && (
                <>
                  <div className="modern-coupon-controls">
                    <div className="modern-coupon-control">
                      <label>{t.coupon.couponCount}</label>
                      <select
                        value={couponCount}
                        onChange={(e) => setCouponCount(Number(e.target.value || 1))}
                        className="modern-coupon-select"
                      >
                        {COUPON_COUNT_OPTIONS.map((value) => (
                          <option key={`count-${value}`} value={value}>
                            {value}x
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="modern-coupon-control">
                      <label>{t.coupon.stakePerCoupon}</label>
                      <select
                        value={stake}
                        onChange={(e) => setStake(Number(e.target.value || 50))}
                        className="modern-coupon-select"
                      >
                        {STAKE_OPTIONS.map((value) => (
                          <option key={`stake-${value}`} value={value}>
                            {value} TL
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="modern-coupon-summary">
                    <div className="modern-coupon-summary-row">
                      <span>{t.coupon.totalOdds}</span>
                      <strong className="modern-coupon-odds-value">
                        {totalOdds > 0 ? totalOdds.toFixed(2) : "-"}
                      </strong>
                    </div>
                    <div className="modern-coupon-summary-row">
                      <span>{locale === "en" ? "Total Amount" : "Toplam Tutar"}</span>
                      <strong>{couponAmount.toFixed(2)} TL</strong>
                    </div>
                    <div className="modern-coupon-summary-row highlight">
                      <span>{t.coupon.potentialWin}</span>
                      <strong className="modern-coupon-win-value">
                        {maxWin > 0 ? `${maxWin.toFixed(2)} TL` : "-"}
                      </strong>
                    </div>
                  </div>

                  <div className="modern-coupon-actions">
                    <button
                      type="button"
                      className="btn-primary modern-coupon-save"
                      onClick={handleSaveCoupon}
                      disabled={saving}
                    >
                      {saving ? t.coupon.saving : t.coupon.saveCoupon}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost modern-coupon-clear"
                      onClick={clearSlip}
                    >
                      {t.coupon.clearAll}
                    </button>
                  </div>
                  {saveError ? <p className="small-text" style={{ color: "var(--danger-500)" }}>{saveError}</p> : null}
                  {saveInfo ? <p className="small-text">{saveInfo}</p> : null}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
