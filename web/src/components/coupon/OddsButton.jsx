import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCouponSlip } from "../../state/coupon/CouponSlipContext";
import { readAuthToken } from "../../lib/auth";
import "./OddsButton.css";

export default function OddsButton({
  fixture,
  selection,
  odd,
  marketKey = "match_result",
  marketLabel = null,
  line = null,
  selectionDisplay = null,
  requiresAuth = true,
  className = "",
  size = "md",
  onAuthRequired = null,
}) {
  const navigate = useNavigate();
  const { items, addPick, removePick } = useCouponSlip();
  const isAuthenticated = !!readAuthToken();

  const pickKey = useMemo(() => {
    if (!fixture?.fixture_id || !selection) return null;
    const normalizedLine = line ? String(line).trim() : "-";
    return `${fixture.fixture_id}:${marketKey}:${normalizedLine}:${selection}`;
  }, [fixture?.fixture_id, selection, marketKey, line]);

  const isInCoupon = useMemo(() => {
    if (!pickKey) return false;
    return items.some((item) => item.pick_key === pickKey);
  }, [items, pickKey]);

  const handleClick = (e) => {
    e.stopPropagation();

    if (requiresAuth && !isAuthenticated) {
      if (onAuthRequired) {
        onAuthRequired();
      } else {
        navigate("/login", { state: { from: window.location.pathname } });
      }
      return;
    }

    if (!pickKey || !fixture) return;

    if (isInCoupon) {
      removePick(pickKey);
    } else {
      const item = {
        fixture_id: fixture.fixture_id,
        home_team_name: fixture.home_team_name,
        away_team_name: fixture.away_team_name,
        home_team_logo: fixture.home_team_logo || null,
        away_team_logo: fixture.away_team_logo || null,
        starting_at: fixture.starting_at || null,
        league_id: fixture.league_id || null,
        league_name: fixture.league_name || null,
        selection: String(selection),
        selection_display: selectionDisplay || selection,
        odd: Number(odd),
        market_key: marketKey,
        market_label: marketLabel,
        line: line || null,
      };
      addPick(item);
    }
  };

  const oddValue = Number(odd);
  const isValidOdd = Number.isFinite(oddValue) && oddValue > 1;

  if (!isValidOdd) {
    return (
      <button className={`odds-button disabled ${className}`} disabled>
        -
      </button>
    );
  }

  const sizeClass = `odds-button-${size}`;
  const stateClass = isInCoupon ? "in-coupon" : "";
  const authClass = requiresAuth && !isAuthenticated ? "guest" : "";

  return (
    <button
      className={`odds-button ${sizeClass} ${stateClass} ${authClass} ${className}`}
      onClick={handleClick}
      title={isInCoupon ? "Click to remove" : "Click to add to coupon"}
    >
      <span className="odds-button-value">{oddValue.toFixed(2)}</span>
      {isInCoupon && <span className="odds-button-check">✓</span>}
    </button>
  );
}
