import React from "react";

export default function WalletCard({ label, value }) {
  return (
    <div className="wallet-card">
      <div className="small-text">{label}</div>
      <code>{value}</code>
    </div>
  );
}
