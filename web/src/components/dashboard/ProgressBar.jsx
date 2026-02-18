import React from "react";

function clampProgress(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

export default function ProgressBar({ progress = 0, indeterminate = false }) {
  const safe = clampProgress(progress, 0);

  return (
    <div
      className={`progress ${indeterminate ? "indeterminate" : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : safe}
      aria-label="İşlem ilerlemesi"
    >
      <div className="progress-fill" style={{ width: indeterminate ? "40%" : `${safe}%` }} />
    </div>
  );
}
