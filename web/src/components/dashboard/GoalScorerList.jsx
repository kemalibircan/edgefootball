import React from "react";

function asPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export default function GoalScorerList({ title, items }) {
  const displayPlayerName = (item) => {
    const rawName = String(item?.player_name || "").trim();
    if (rawName && !/^\d+$/.test(rawName)) {
      return rawName;
    }
    if (item?.player_id !== undefined && item?.player_id !== null && item?.player_id !== "") {
      return `Oyuncu ${item.player_id}`;
    }
    return "Oyuncu";
  };

  return (
    <div>
      <h3>{title}</h3>
      {!items?.length ? <p className="small-text">Lineup verisi yok.</p> : null}
      {(items || []).map((item) => (
        <div key={`${title}-${item.player_id}`} className="row spread">
          <span>{displayPlayerName(item)}</span>
          <span>{asPercent(item.score_probability)}</span>
        </div>
      ))}
    </div>
  );
}
