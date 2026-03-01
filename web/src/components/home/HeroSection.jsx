import React from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import "./HeroSection.css";

export default function HeroSection({ isLoggedIn = false, isManager = false } = {}) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <section className="hero-section">
      <div className="hero-particles" />
      
      <div className="hero-content">
        <div className="hero-pill">{t.guestLanding.heroPill}</div>
        
        <h1 className="hero-title">{t.guestLanding.heroTitle}</h1>
        
        <p className="hero-text">{t.guestLanding.heroText}</p>
        
        <div className="hero-actions">
          {!isLoggedIn ? (
            <>
              <button className="btn-primary" onClick={() => navigate("/login")}>
                {t.guestLanding.ctaLogin}
              </button>
              <button className="btn-secondary" onClick={() => navigate("/register")}>
                {t.guestLanding.ctaRegister}
              </button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={() => navigate("/sonuc-tahminlerim")}>
                {t.guestLanding.ctaOddsBoard}
              </button>
              <button className="btn-secondary" onClick={() => navigate("/ai-tahminlerim")}>
                {t.guestLanding.ctaMyPredictions}
              </button>
              {isManager ? (
                <button className="btn-secondary" onClick={() => navigate("/admin")}>
                  {t.guestLanding.ctaAdmin}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
