import React, { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { clearAuthToken, readAuthToken } from "../../lib/auth";
import { uiText } from "../../i18n/terms.tr";

const AUTH_TOKEN_KEY = "football_ai_access_token";
const SUPER_LIG_ID = 600;

function todayLocalISODate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export default function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savedPredictionsCount, setSavedPredictionsCount] = useState(0);

  const loadSavedPredictionsCount = useCallback(async () => {
    if (!readAuthToken()) {
      setSavedPredictionsCount(0);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("day", todayLocalISODate());
      params.set("page", "1");
      params.set("page_size", "1");
      params.set("league_id", String(SUPER_LIG_ID));
      params.set("mine_only", "true");
      const payload = await apiRequest(`/admin/predictions/daily?${params.toString()}`);
      setSavedPredictionsCount(Number(payload?.total || 0));
    } catch (err) {
      setSavedPredictionsCount(0);
    }
  }, []);

  const loadCurrentUser = useCallback(
    async ({ silent = false } = {}) => {
      const token = readAuthToken();
      if (!token) {
        setCurrentUser(null);
        setSavedPredictionsCount(0);
        setLoadingProfile(false);
        return;
      }

      if (!silent) {
        setLoadingProfile(true);
      }

      try {
        const profile = await apiRequest("/auth/me");
        setCurrentUser(profile || null);
      } catch (err) {
        if (!readAuthToken()) {
          setCurrentUser(null);
        }
      } finally {
        if (!silent) {
          setLoadingProfile(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onAuthChanged = () => {
      loadCurrentUser({ silent: true });
      loadSavedPredictionsCount();
    };
    const onStorage = (event) => {
      if (!event.key || event.key === AUTH_TOKEN_KEY) {
        loadCurrentUser({ silent: true });
      }
    };

    window.addEventListener("auth-token-changed", onAuthChanged);
    window.addEventListener("storage", onStorage);

    const refreshTimer = window.setInterval(() => {
      if (readAuthToken()) {
        loadCurrentUser({ silent: true });
        loadSavedPredictionsCount();
      }
    }, 30000);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("auth-token-changed", onAuthChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadCurrentUser, loadSavedPredictionsCount]);

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
    setSavedPredictionsCount(0);
    navigate("/login", { replace: true });
  };

  const hasToken = !!readAuthToken();
  const isAuthenticated = !!currentUser;
  const isAdminUser = currentUser?.role === "admin" || currentUser?.role === "superadmin";

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedPredictionsCount(0);
      return;
    }
    loadSavedPredictionsCount();
  }, [isAuthenticated, location.pathname, loadSavedPredictionsCount]);

  return (
    <header className="site-header-bar card">
      <div className="site-header-main">
        <div className="site-brand">
          <strong>{uiText.app.name}</strong>
          <span>{uiText.app.tagline}</span>
        </div>

        <nav className="site-nav-links">
          <NavLink to="/" end className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
            {uiText.header.home}
          </NavLink>
          <NavLink to="/oran-tahtasi" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
            {uiText.header.oddsBoard}
          </NavLink>
          <NavLink
            to="/ai-tahminlerim"
            className={({ isActive }) => `site-link with-count ${isActive ? "active" : ""}`}
          >
            <span>{uiText.header.myAiPredictions}</span>
            {isAuthenticated ? <span className="site-link-count">{savedPredictionsCount}</span> : null}
          </NavLink>
          {isAdminUser ? (
            <NavLink to="/admin" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
              {uiText.header.adminPanel}
            </NavLink>
          ) : null}
        </nav>
      </div>

      <div className="site-auth-zone">
        {isAuthenticated ? (
          <>
            <div className="site-user-pill">
              <strong>{currentUser.email || currentUser.username}</strong>
              <span>
                {uiText.header.creditsLabel}: {currentUser.credits}
              </span>
            </div>
            <button type="button" className="site-link" onClick={() => navigate("/token-purchase")}>
              {uiText.header.tokenTopup}
            </button>
            <button type="button" className="site-link site-logout-btn" onClick={handleLogout}>
              {uiText.header.logout}
            </button>
          </>
        ) : (
          <>
            {hasToken && loadingProfile ? (
              <span className="small-text">{uiText.header.checkingProfile}</span>
            ) : null}
            <NavLink to="/login" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
              {uiText.header.login}
            </NavLink>
            <NavLink to="/register" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
              {uiText.header.register}
            </NavLink>
          </>
        )}
      </div>
    </header>
  );
}
