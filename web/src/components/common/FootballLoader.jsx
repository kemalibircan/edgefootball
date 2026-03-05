import React from "react";
import "./FootballLoader.css";

export default function FootballLoader({ label = "Loading...", size = "md" }) {
  const safeSize = size === "sm" || size === "lg" ? size : "md";
  return (
    <div className={`football-loader football-loader-${safeSize}`} role="status" aria-live="polite">
      <div className="football-loader-ball" aria-hidden="true" />
      <div className="football-loader-shadow" aria-hidden="true" />
      <span className="football-loader-label">{label}</span>
    </div>
  );
}











