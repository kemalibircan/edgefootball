import React from "react";

export default function StatCard({ label, value }) {
  return (
    <div className="card stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
