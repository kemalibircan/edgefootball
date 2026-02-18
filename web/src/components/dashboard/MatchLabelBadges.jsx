import React from "react";
import TeamBadge from "./TeamBadge";

function splitMatchLabel(label) {
  const text = String(label || "");
  const parts = text.split(/\s+vs\s+/i);
  if (parts.length === 2) {
    return {
      home: parts[0].trim(),
      away: parts[1].trim(),
    };
  }
  return null;
}

export default function MatchLabelBadges({ label, small = false }) {
  const parsed = splitMatchLabel(label);
  if (!parsed) return <span>{label || "-"}</span>;

  return (
    <div className="fixture-teams inline">
      <TeamBadge name={parsed.home} small={small} />
      <span className="vs-chip">vs</span>
      <TeamBadge name={parsed.away} small={small} />
    </div>
  );
}
