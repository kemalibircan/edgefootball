import React, { useEffect, useState } from "react";

export default function OddsChangeIndicator({ label, current, previous }) {
  const [changeType, setChangeType] = useState(null);

  useEffect(() => {
    if (previous && current && previous !== current) {
      if (current > previous) {
        setChangeType("increase");
      } else if (current < previous) {
        setChangeType("decrease");
      }

      // 2 saniye sonra animasyonu kaldır
      const timer = setTimeout(() => {
        setChangeType(null);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [current, previous]);

  const getChangeIcon = () => {
    if (changeType === "increase") return "↑";
    if (changeType === "decrease") return "↓";
    return null;
  };

  return (
    <div className={`odds-indicator ${changeType || ""}`}>
      <span className="odds-label">{label}</span>
      <span className="odds-value">
        {current?.toFixed(2) || "—"}
        {getChangeIcon() && (
          <span className="odds-change-icon">{getChangeIcon()}</span>
        )}
      </span>
    </div>
  );
}
