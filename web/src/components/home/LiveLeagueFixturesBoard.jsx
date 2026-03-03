import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OddsButton from "../coupon/OddsButton";
import ActionButton from "../dashboard/ActionButton";
import TeamBadge from "../dashboard/TeamBadge";
import { slugify } from "../../lib/seo";
import "./LiveLeagueFixturesBoard.css";

// Backend varsayılan portu 8000; env yoksa buna düş.
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

function toPositiveOdd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 1) return null;
  return Number(parsed.toFixed(2));
}

function normalizeOneX2FromFixtureMarkets(rawMarkets) {
  const markets = rawMarkets && typeof rawMarkets === "object" ? rawMarkets : {};
  const matchResult = markets.match_result || markets.matchResult;
  if (!matchResult || typeof matchResult !== "object") return null;

  const home = toPositiveOdd(matchResult["1"] ?? matchResult.home);
  const draw = toPositiveOdd(matchResult["0"] ?? matchResult["X"] ?? matchResult.draw);
  const away = toPositiveOdd(matchResult["2"] ?? matchResult.away);

  if (!home && !draw && !away) return null;
  return { home, draw, away };
}

function formatKickoff(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("tr-TR");
}

export default function LiveLeagueFixturesBoard() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    const fetchLive = async () => {
      try {
        const today = new Date();
        const local = new Date(today.getTime() - today.getTimezoneOffset() * 60 * 1000);
        const day = local.toISOString().slice(0, 10);
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("page_size", "200");
        params.set("day", day);

        const response = await fetch(`${API_BASE}/fixtures/public/today?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || `Request failed: ${response.status}`);
        }
        if (!isMounted) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
      } catch (err) {
        if (!isMounted) return;
        setError(String(err.message || "Maçlar yüklenemedi."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    fetchLive();
    const timer = window.setInterval(fetchLive, 30000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const groupedByLeague = useMemo(() => {
    const map = new Map();
    (items || []).forEach((fixture) => {
      const leagueKey = fixture.league_id || fixture.league_name || "others";
      const leagueLabel = fixture.league_name || `Lig ${leagueKey}`;
      if (!map.has(leagueKey)) {
        map.set(leagueKey, {
          leagueId: fixture.league_id ?? null,
          leagueName: leagueLabel,
          fixtures: [],
        });
      }
      map.get(leagueKey).fixtures.push(fixture);
    });
    return Array.from(map.values()).sort((a, b) => a.leagueName.localeCompare(b.leagueName, "tr"));
  }, [items]);

  const goToDetail = (fixture) => {
    const basePathLocale = "tr";
    const label = String(
      fixture.match_label ||
        `${fixture.home_team_name || "Home"} vs ${fixture.away_team_name || "Away"}`
    ).trim();
    const slug = slugify(label);
    const fixtureId = fixture.fixture_id;
    navigate(`/${basePathLocale}/fixtures/${fixtureId}${slug ? `/${slug}` : ""}`);
  };

  const renderShell = (children) => (
    <section className="live-league-wrapper">
      <div className="container">
        <section className="card wide live-league-fixtures-section">
          <div className="section-header">
            <h2>Canlı &amp; Bugünkü Maçlar</h2>
            <span className="small-text">
              Toplam <strong>{items.length}</strong> maç
            </span>
          </div>
          <p className="section-description">
            Tüm liglerdeki bugünkü maçlar lig bazında gruplanmış şekilde listelenir. Herhangi bir orana tıklayarak
            kuponuna ekleyebilir, maç kartına tıklayarak detay sayfasını açabilirsin.
          </p>
          {children}
        </section>
      </div>
    </section>
  );

  if (loading && !items.length) {
    return renderShell(<p className="small-text">Canlı maçlar yükleniyor...</p>);
  }

  if (error && !items.length) {
    return renderShell(<div className="error">{error}</div>);
  }

  if (!items.length) {
    return renderShell(<p className="small-text">Bugün için listelenecek maç bulunamadı.</p>);
  }

  return renderShell(

      <div className="live-league-grid">
        {groupedByLeague.map((group) => (
          <div key={group.leagueId || group.leagueName} className="live-league-column">
            <div className="live-league-header">
              <span className="live-league-name">{group.leagueName}</span>
              <span className="live-league-count">{group.fixtures.length} maç</span>
            </div>

            <div className="live-league-list">
              {group.fixtures.map((fixture) => {
                const markets = normalizeOneX2FromFixtureMarkets(fixture.markets);
                const isLive =
                  String(fixture.status || "").toLowerCase().includes("live") ||
                  String(fixture.status || "").toLowerCase().includes("inplay");
                return (
                  <article
                    key={fixture.fixture_id}
                    className="live-fixture-row"
                    onClick={() => goToDetail(fixture)}
                  >
                    <div className="live-fixture-main">
                      <div className="live-fixture-teams">
                        <TeamBadge logo={fixture.home_team_logo} name={fixture.home_team_name} small />
                        <span className="vs-chip">vs</span>
                        <TeamBadge logo={fixture.away_team_logo} name={fixture.away_team_name} small />
                      </div>
                      <div className="live-fixture-meta">
                        <span>{formatKickoff(fixture.starting_at)}</span>
                        {isLive ? <span className="live-badge">CANLI</span> : null}
                      </div>
                    </div>

                    <div
                      className="live-fixture-odds"
                      onClick={(event) => {
                        // Stop card navigation; odds buttons handle their own clicks.
                        event.stopPropagation();
                      }}
                    >
                      {markets ? (
                        <>
                          <OddsButton
                            fixture={fixture}
                            selection="1"
                            odd={markets.home}
                            marketKey="match_result"
                            marketLabel="Maç Sonucu"
                            selectionDisplay="MS 1"
                            size="sm"
                            className="live-odd"
                          />
                          <OddsButton
                            fixture={fixture}
                            selection="0"
                            odd={markets.draw}
                            marketKey="match_result"
                            marketLabel="Maç Sonucu"
                            selectionDisplay="MS X"
                            size="sm"
                            className="live-odd"
                          />
                          <OddsButton
                            fixture={fixture}
                            selection="2"
                            odd={markets.away}
                            marketKey="match_result"
                            marketLabel="Maç Sonucu"
                            selectionDisplay="MS 2"
                            size="sm"
                            className="live-odd"
                          />
                        </>
                      ) : (
                        <span className="small-text">Oranlar yakında</span>
                      )}
                    </div>

                    <div className="live-fixture-open-detail">
                      <ActionButton className="secondary small">Detay</ActionButton>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
  );
}


