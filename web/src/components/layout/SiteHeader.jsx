import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiRequest, API_BASE, logoutCurrentSession } from "../../lib/api";
import { clearAuthToken, readAuthToken } from "../../lib/auth";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import ThemeToggle from "../theme/ThemeToggle";
import LanguageSwitcher from "../theme/LanguageSwitcher";
import ChatToggleButton from "./ChatToggleButton";
import logoLight from "../../images/logo.png";
import logoDark from "../../images/logo-dark.png";
import "./ProfileMenu.css";

const AUTH_TOKEN_KEY = "football_ai_access_token";
const SUPER_LIG_ID = 600;
const PROFILE_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

function todayLocalISODate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export default function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale, setLocale } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savedPredictionsCount, setSavedPredictionsCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

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

    const refreshAuthState = () => {
      if (!readAuthToken()) {
        setCurrentUser(null);
        setSavedPredictionsCount(0);
        return;
      }
      loadCurrentUser({ silent: true });
      loadSavedPredictionsCount();
    };

    const onAuthChanged = () => {
      refreshAuthState();
    };

    const onStorage = (event) => {
      if (!event.key || event.key === AUTH_TOKEN_KEY) {
        refreshAuthState();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAuthState();
      }
    };
    const onWindowFocus = () => {
      refreshAuthState();
    };

    window.addEventListener("auth-token-changed", onAuthChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshAuthState();
    }, PROFILE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("auth-token-changed", onAuthChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadCurrentUser, loadSavedPredictionsCount]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileMenuOpen]);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    try {
      await logoutCurrentSession();
    } catch (_err) {
      // Local logout still proceeds if backend revoke call fails.
    }
    clearAuthToken();
    setCurrentUser(null);
    setSavedPredictionsCount(0);
    navigate("/login", { replace: true });
  };

  const toggleProfileMenu = () => {
    setProfileMenuOpen(!profileMenuOpen);
  };

  const handleProfileMenuClick = (action) => {
    setProfileMenuOpen(false);
    if (action) action();
  };

  const toggleLanguage = () => {
    setLocale(locale === "tr" ? "en" : "tr");
  };

  const toggleThemeMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
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
    <header className="site-header-bar">
      <div className="site-header-container">
        {/* Logo */}
        <div className="site-brand" onClick={() => navigate(`/${locale}`)}>
          <img
            src={theme === "dark" ? logoDark : logoLight}
            alt={t.app.name}
            className="site-logo"
          />
          <div className="site-brand-text">
            <strong>{t.app.name}</strong>
          </div>
        </div>

        {/* Navigation */}
        <nav className={`site-nav-links ${mobileMenuOpen ? "mobile-open" : ""}`}>
          <NavLink to={`/${locale}`} end className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
            {t.header.home}
          </NavLink>
          {isAuthenticated && (
            <>
              <NavLink to="/kuponlarim" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
                {t.header.myCoupons}
              </NavLink>
            </>
          )}
          <NavLink
            to="/ai-tahminlerim"
            className={({ isActive }) => `site-link with-count ${isActive ? "active" : ""}`}
          >
            <span>{t.header.myAiPredictions}</span>
            {isAuthenticated && savedPredictionsCount > 0 && (
              <span className="site-link-count">{savedPredictionsCount}</span>
            )}
          </NavLink>
          {isAuthenticated && (
            <NavLink to="/chat" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
              {t.header.aiChat}
            </NavLink>
          )}
          {isAdminUser && (
            <NavLink to="/admin" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
              {t.header.adminPanel}
            </NavLink>
          )}
        </nav>

        {/* Right side controls */}
        <div className="site-header-actions">
          {/* Mobile menu toggle */}
          <button
            className="site-nav-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <div className="site-header-controls">
            <ChatToggleButton />
          </div>
          
          <div className="site-auth-zone">
            {isAuthenticated ? (
              <div className="site-header-profile-menu" ref={profileMenuRef}>
                <div className="site-profile-avatar" onClick={toggleProfileMenu}>
                  {currentUser?.avatar_key ? (
                    <img
                      src={`${API_BASE}/static/avatars/${currentUser.avatar_key}.png`}
                      alt="Profile"
                    />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="7"
                        r="4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>

                <div className={`site-profile-dropdown ${profileMenuOpen ? "open" : ""}`}>
                  <div className="site-profile-dropdown-header">
                    <p className="site-profile-dropdown-email">
                      {currentUser?.email || currentUser?.username}
                    </p>
                    <p className="site-profile-dropdown-credits">
                      {currentUser?.credits} {t.header.creditsLabel}
                    </p>
                  </div>

                  <div className="site-profile-dropdown-menu">
                    <button
                      className="site-profile-dropdown-item"
                      onClick={() => handleProfileMenuClick(() => navigate("/profile-settings"))}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      {t.header.profileSettings}
                    </button>

                    <button
                      className="site-profile-dropdown-item"
                      onClick={() => handleProfileMenuClick(() => navigate("/token-purchase"))}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      {t.header.tokenTopup}
                    </button>

                    <div className="site-profile-dropdown-divider" />

                    <button
                      className="site-profile-dropdown-item"
                      onClick={() => handleProfileMenuClick(toggleLanguage)}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path
                          d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                      {t.header.language}: {locale === "tr" ? "TR" : "EN"}
                    </button>

                    <button
                      className="site-profile-dropdown-item"
                      onClick={() => handleProfileMenuClick(toggleThemeMode)}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        {theme === "dark" ? (
                          <path
                            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : (
                          <>
                            <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
                            <path
                              d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </>
                        )}
                      </svg>
                      {t.header.theme}: {theme === "dark" ? "Dark" : "Light"}
                    </button>

                    <div className="site-profile-dropdown-divider" />

                    <button
                      className="site-profile-dropdown-item danger"
                      onClick={() => handleProfileMenuClick(handleLogout)}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <polyline
                          points="16 17 21 12 16 7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <line
                          x1="21"
                          y1="12"
                          x2="9"
                          y2="12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {t.header.logout}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {hasToken && loadingProfile ? (
                  <span className="site-loading-text">{t.header.checkingProfile}</span>
                ) : (
                  <>
                    <NavLink to="/login" className={({ isActive }) => `site-link ${isActive ? "active" : ""}`}>
                      {t.header.login}
                    </NavLink>
                    <NavLink to="/register" className={({ isActive }) => `site-link site-btn-register ${isActive ? "active" : ""}`}>
                      {t.header.register}
                    </NavLink>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
