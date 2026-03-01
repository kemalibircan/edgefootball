import React, { useEffect, useState } from "react";
import { apiRequest, API_BASE } from "../../lib/api";
import { useLanguage } from "../../contexts/LanguageContext";
import "./ProfileAvatarPicker.css";

export default function ProfileAvatarPicker({ currentAvatarKey, onAvatarChange }) {
  const { t } = useLanguage();
  const [avatarOptions, setAvatarOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAvatarOptions();
  }, []);

  const loadAvatarOptions = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/auth/avatar-options", { skipAuth: true });
      setAvatarOptions(data.items || []);
      setError("");
    } catch (err) {
      setError(err.message || "Avatar listesi yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarSelect = async (avatarKey) => {
    if (updating || avatarKey === currentAvatarKey) return;

    try {
      setUpdating(true);
      setError("");
      setMessage("");

      const updatedUser = await apiRequest("/auth/me/avatar", {
        method: "PATCH",
        body: JSON.stringify({ avatar_key: avatarKey }),
      });

      setMessage(t.profile.avatarUpdateSuccess);
      if (onAvatarChange) {
        onAvatarChange(updatedUser);
      }
    } catch (err) {
      setError(err.message || t.profile.avatarUpdateError);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="avatar-picker-loading">
        <div className="spinner"></div>
        <p>{t.profile.loading}</p>
      </div>
    );
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-picker-header">
        <h3>{t.profile.selectAvatar}</h3>
        <p className="avatar-picker-help">{t.profile.avatarHelp}</p>
      </div>

      {error && (
        <div className="avatar-picker-message error">
          {error}
        </div>
      )}

      {message && (
        <div className="avatar-picker-message success">
          {message}
        </div>
      )}

      <div className="avatar-picker-grid">
        {avatarOptions.map((option) => {
          const isSelected = option.key === currentAvatarKey;
          const isDisabled = updating;

          return (
            <button
              key={option.key}
              className={`avatar-option ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}`}
              onClick={() => handleAvatarSelect(option.key)}
              disabled={isDisabled}
              type="button"
            >
              <div className="avatar-option-image">
                <img src={option.image_url} alt={option.label} />
                {isSelected && (
                  <div className="avatar-option-check">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M13.3333 4L6 11.3333L2.66667 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <span className="avatar-option-label">{option.label}</span>
            </button>
          );
        })}
      </div>

      {avatarOptions.length > 0 && (
        <div className="avatar-picker-footer">
          <small>
            {t.profile.avatarSource}: {avatarOptions[0].source_name} ({avatarOptions[0].license_name})
          </small>
        </div>
      )}
    </div>
  );
}
