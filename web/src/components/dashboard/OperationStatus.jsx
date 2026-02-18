import React from "react";
import ProgressBar from "./ProgressBar";

function clampProgress(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

export default function OperationStatus({ op }) {
  if (!op) return null;
  const progress = clampProgress(op.progress, op.indeterminate ? 20 : 0);
  return (
    <div className="op-status">
      <div className="row spread compact-row">
        <span className="small-text">{op.stage || "Islem suruyor"}</span>
        <span className="small-text">{op.indeterminate ? "..." : `${progress}%`}</span>
      </div>
      <ProgressBar progress={progress} indeterminate={!!op.indeterminate} />
    </div>
  );
}
