import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import TeamLogo from "../common/TeamLogo";
import "./OddsAnalysisBoard.css";

export default function OddsAnalysisBoard({ apiBase }) {
  const { t, locale } = useLanguage();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${apiBase}/fixtures/board?page=1&page_size=10&featured_only=true`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(payload.detail || "Failed to load odds analysis");
      }

      setAnalysis(payload);
    } catch (err) {
      setError(String(err.message || "Failed to load odds analysis"));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  if (loading) {
    return (
      <section className="odds-analysis-board">
        <div className="container">
          <h2 className="section-title">{locale === "en" ? "Odds Analysis" : "İddia Oranları"}</h2>
          <div className="odds-loading">Loading odds...</div>
        </div>
      </section>
    );
  }

  if (error || !analysis || !analysis.items || analysis.items.length === 0) {
    return null;
  }

  return (
    <section className="odds-analysis-board">
      <div className="container">
        <h2 className="section-title">{locale === "en" ? "Odds Analysis" : "İddia Oranları"}</h2>

        <div className="odds-grid">
          {analysis.items.map((fixture) => {
            const odds = fixture.markets?.match_result || {};
            
            if (!odds.home || !odds.draw || !odds.away) return null;

            return (
              <div
                key={fixture.id}
                className="odds-card glass-card"
                onClick={() => navigate(`/fixture/${fixture.id}`)}
              >
                <div className="odds-card-header">
                  <div className="odds-card-teams">
                    <TeamLogo
                      src={fixture.home_team?.logo_url}
                      teamName={fixture.home_team?.name}
                      alt={fixture.home_team?.name}
                      size="sm"
                    />
                    <span className="odds-card-match">
                      {fixture.home_team?.short_name || fixture.home_team?.name} -{" "}
                      {fixture.away_team?.short_name || fixture.away_team?.name}
                    </span>
                    <TeamLogo
                      src={fixture.away_team?.logo_url}
                      teamName={fixture.away_team?.name}
                      alt={fixture.away_team?.name}
                      size="sm"
                    />
                  </div>
                  <div className="odds-card-league">{fixture.league?.name}</div>
                </div>

                <div className="odds-card-values">
                  <div className="odds-value">
                    <div className="odds-value-label">1</div>
                    <div className="odds-value-odd">{parseFloat(odds.home).toFixed(2)}</div>
                  </div>
                  <div className="odds-value">
                    <div className="odds-value-label">X</div>
                    <div className="odds-value-odd">{parseFloat(odds.draw).toFixed(2)}</div>
                  </div>
                  <div className="odds-value">
                    <div className="odds-value-label">2</div>
                    <div className="odds-value-odd">{parseFloat(odds.away).toFixed(2)}</div>
                  </div>
                </div>

                <button className="odds-card-action btn-ghost btn-small">
                  {locale === "en" ? "View Details" : "Detayları Gör"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
