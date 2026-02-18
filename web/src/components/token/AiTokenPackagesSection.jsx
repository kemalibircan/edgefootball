import React from "react";
import ActionButton from "../dashboard/ActionButton";
import PackageCard from "./PackageCard";
import WalletCard from "./WalletCard";

const WALLET_LABELS = {
  solana: "Solana",
  ethereum: "Ethereum",
};

export default function AiTokenPackagesSection({
  title = "AI Token Paketleri",
  description = "",
  packages = [],
  wallets = {},
  headerAction = null,
  copiedWallet = "",
  onCopyWallet = null,
}) {
  const walletEntries = Object.entries(wallets || {});

  return (
    <div className="package-zone">
      {title || headerAction ? (
        <div className="row spread wrap">
          {title ? <h2>{title}</h2> : <span />}
          {headerAction}
        </div>
      ) : null}

      {description ? <p className="help-text">{description}</p> : null}

      <div className="package-grid">
        {packages.map((pack) => (
          <PackageCard key={pack.key} pack={pack} />
        ))}
      </div>

      <div className="grid two-col">
        {walletEntries.map(([key, value]) => {
          const label = WALLET_LABELS[key] || key;
          if (!onCopyWallet) {
            return <WalletCard key={`wallet-${key}`} label={label} value={value} />;
          }
          return (
            <div key={`wallet-${key}`} className="wallet-card">
              <div className="small-text">{label}</div>
              <code>{value}</code>
              <ActionButton className="accent-gradient" onClick={() => onCopyWallet(key)}>
                {copiedWallet === key ? "Kopyalandı" : "Adresi Kopyala"}
              </ActionButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
