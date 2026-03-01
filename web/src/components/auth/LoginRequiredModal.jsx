import React from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import "./LoginRequiredModal.css";

export default function LoginRequiredModal({ isOpen, onClose, message = null, returnPath = null }) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  if (!isOpen) return null;

  const handleLogin = () => {
    const targetPath = returnPath || window.location.pathname;
    navigate("/login", { state: { from: targetPath } });
    onClose();
  };

  const handleRegister = () => {
    const targetPath = returnPath || window.location.pathname;
    navigate("/register", { state: { from: targetPath } });
    onClose();
  };

  return (
    <>
      <div className="login-modal-backdrop" onClick={onClose} />
      <div className="login-modal-container">
        <div className="login-modal-content glass-card">
          <button className="login-modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div className="login-modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>

          <h2 className="login-modal-title">{t.coupon.loginRequired}</h2>
          
          <p className="login-modal-message">
            {message || t.coupon.emptySlipHint}
          </p>

          <div className="login-modal-actions">
            <button className="btn-primary login-modal-btn" onClick={handleLogin}>
              {t.coupon.loginButton}
            </button>
            <button className="btn-ghost login-modal-btn" onClick={handleRegister}>
              {t.auth.links.register}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
