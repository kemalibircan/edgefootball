import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, API_BASE } from "../lib/api";
import { readAuthToken } from "../lib/auth";
import { useLanguage } from "../contexts/LanguageContext";
import ProfileAvatarPicker from "../components/profile/ProfileAvatarPicker";
import "./ProfileSettingsPage.css";

export default function ProfileSettingsPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    const token = readAuthToken();
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      setLoading(true);
      const profile = await apiRequest("/auth/me");
      setCurrentUser(profile);
      setError("");
    } catch (err) {
      setError(err.message || t.profile.updateError);
    } finally {
      setLoading(false);
    }
  }, [navigate, t]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleAvatarChange = (updatedUser) => {
    setCurrentUser(updatedUser);
    // Trigger auth-token-changed event to update header
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-token-changed"));
    }
  };

  if (loading) {
    return (
      <div className="profile-settings-page">
        <div className="profile-settings-container">
          <div className="profile-settings-loading">
            <div className="spinner"></div>
            <p>{t.profile.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !currentUser) {
    return (
      <div className="profile-settings-page">
        <div className="profile-settings-container">
          <div className="profile-settings-error">
            <p>{error}</p>
            <button onClick={loadProfile} className="btn-retry">
              {t.savedPredictions.actions.refresh}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const avatarUrl = currentUser?.avatar_key
    ? `${API_BASE}/static/avatars/${currentUser.avatar_key}.png`
    : null;

  return (
    <div className="profile-settings-page">
      <div className="profile-settings-container">
        <div className="profile-settings-header">
          <h1>{t.profile.title}</h1>
        </div>

        <div className="profile-settings-content">
          {/* Profile Card */}
          <div className="profile-card">
            <div className="profile-card-header">
              <div className="profile-avatar-large">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" />
                ) : (
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
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
              <div className="profile-card-info">
                <h2>{currentUser?.email || currentUser?.username || "-"}</h2>
                <p className="profile-status">
                  {currentUser?.is_active ? t.profile.active : t.profile.inactive}
                </p>
              </div>
            </div>

            <div className="profile-card-stats">
              <div className="profile-stat">
                <span className="profile-stat-label">{t.profile.role}</span>
                <span className="profile-stat-value">{currentUser?.role || "-"}</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">{t.profile.credits}</span>
                <span className="profile-stat-value">{currentUser?.credits ?? "-"}</span>
              </div>
            </div>
          </div>

          {/* Avatar Picker Section */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h2>{t.profile.avatarSection}</h2>
            </div>
            <div className="profile-section-content">
              <ProfileAvatarPicker
                currentAvatarKey={currentUser?.avatar_key}
                onAvatarChange={handleAvatarChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
