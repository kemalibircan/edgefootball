import React from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import TeamLogo from "../common/TeamLogo";
import OddsChangeIndicator from "./OddsChangeIndicator";

export default function LiveMatchCard({ match, previousOdds }) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleClick = () => {
    if (match.fixture_id) {
      navigate(`/fixture/${match.fixture_id}`);
    }
  };

  // Dakika formatı
  const formatMinute = (minute, status) => {
    if (status === "HT") return t.liveScores?.halfTime || "Devre Arası";
    if (status === "FT") return t.liveScores?.fullTime || "MS";
    if (minute && minute > 0) return `${minute}'`;
    return "0'";
  };

  // Oranları parse et
  const parseOdds = (oddsData) => {
    if (!oddsData) return null;
    
    // market_match_result_json formatı
    if (oddsData.bookmakers && Array.isArray(oddsData.bookmakers)) {
      const firstBookmaker = oddsData.bookmakers[0];
      if (firstBookmaker?.bets && Array.isArray(firstBookmaker.bets)) {
        const matchResultBet = firstBookmaker.bets.find(
          (bet) => bet.name === "3Way Result" || bet.name === "Match Winner"
        );
        if (matchResultBet?.values && Array.isArray(matchResultBet.values)) {
          const values = matchResultBet.values;
          const homeOdd = values.find((v) => v.value === "1" || v.value === "Home");
          const drawOdd = values.find((v) => v.value === "X" || v.value === "Draw");
          const awayOdd = values.find((v) => v.value === "2" || v.value === "Away");
          
          if (homeOdd && drawOdd && awayOdd) {
            return {
              home: parseFloat(homeOdd.odd),
              draw: parseFloat(drawOdd.odd),
              away: parseFloat(awayOdd.odd),
            };
          }
        }
      }
    }
    
    // Basit format desteği
    const home = oddsData.home || oddsData["1"] || oddsData.odd_home;
    const draw = oddsData.draw || oddsData["X"] || oddsData.odd_draw;
    const away = oddsData.away || oddsData["2"] || oddsData.odd_away;

    if (!home || !draw || !away) return null;

    return {
      home: parseFloat(home),
      draw: parseFloat(draw),
      away: parseFloat(away),
    };
  };

  const currentOdds = parseOdds(match.market_match_result_json || match.odds || match.markets?.match_result);
  const prevOdds = parseOdds(previousOdds);

  return (
    <div className="live-match-card glass-card" onClick={handleClick}>
      <div className="live-match-header">
        <span className="live-match-league">{match.league_name || "—"}</span>
        <span className="live-match-minute pulse">
          {formatMinute(match.match_minute, match.status)}
        </span>
      </div>

      <div className="live-match-teams">
        <div className="live-match-team">
          <TeamLogo
            src={match.home_team_logo}
            teamName={match.home_team_name}
            size="md"
          />
          <span className="team-name">{match.home_team_name}</span>
        </div>

        <div className="live-match-score">
          <span className="score-number">{match.home_score ?? 0}</span>
          <span className="score-separator">-</span>
          <span className="score-number">{match.away_score ?? 0}</span>
        </div>

        <div className="live-match-team">
          <TeamLogo
            src={match.away_team_logo}
            teamName={match.away_team_name}
            size="md"
          />
          <span className="team-name">{match.away_team_name}</span>
        </div>
      </div>

      {currentOdds && (
        <div className="live-match-odds">
          <OddsChangeIndicator
            label="1"
            current={currentOdds.home}
            previous={prevOdds?.home}
          />
          <OddsChangeIndicator
            label="X"
            current={currentOdds.draw}
            previous={prevOdds?.draw}
          />
          <OddsChangeIndicator
            label="2"
            current={currentOdds.away}
            previous={prevOdds?.away}
          />
        </div>
      )}
    </div>
  );
}
