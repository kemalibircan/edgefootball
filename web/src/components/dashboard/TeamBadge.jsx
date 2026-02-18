import React from "react";

export default function TeamBadge({ logo, name, small = false }) {
  const label = String(name || "?");
  const fallback = label.trim().slice(0, 1).toUpperCase();

  return (
    <span className={`team-badge ${small ? "small" : ""}`}>
      {logo ? <img src={logo} alt={`${label} amblem`} loading="lazy" /> : <span className="team-fallback">{fallback}</span>}
      <span className="team-name">{label}</span>
    </span>
  );
}
