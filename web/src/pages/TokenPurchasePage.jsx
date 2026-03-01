import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import AiTokenPackagesSection from "../components/token/AiTokenPackagesSection";
import { useLanguage } from "../contexts/LanguageContext";
import { CREDIT_PACKAGES, PAYMENT_WALLETS } from "../lib/tokenPackages";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8001").replace(/\/+$/, "");
const AUTH_TOKEN_KEY = "football_ai_access_token";

function readAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export default function TokenPurchasePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [copiedWallet, setCopiedWallet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    package_key: CREDIT_PACKAGES[0]?.key || "",
    chain: "solana",
    transaction_id: "",
    telegram_contact: "",
    note: "",
  });

  const selectedPackage = useMemo(
    () => CREDIT_PACKAGES.find((item) => item.key === paymentForm.package_key) || CREDIT_PACKAGES[0],
    [paymentForm.package_key]
  );

  const copyWalletAddress = async (key) => {
    const value = PAYMENT_WALLETS[key];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedWallet(key);
      window.setTimeout(() => setCopiedWallet(""), 1400);
    } catch (_err) {
      setError(t.tokenPurchase.errors.copyFailed);
    }
  };

  const submitPaymentNotice = async () => {
    const transactionId = String(paymentForm.transaction_id || "").trim();
    if (!transactionId) {
      setError(t.tokenPurchase.errors.transactionRequired);
      setSuccess("");
      return;
    }

    const token = readAuthToken();
    if (!token) {
      setError(t.tokenPurchase.errors.loginRequired);
      setSuccess("");
      navigate("/login");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${API_BASE}/admin/payments/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          package_key: selectedPackage?.key,
          package_title: selectedPackage?.title,
          chain: paymentForm.chain,
          amount_tl: Number(selectedPackage?.price_tl || 0),
          transaction_id: transactionId,
          telegram_contact: String(paymentForm.telegram_contact || "").trim() || null,
          note: String(paymentForm.note || "").trim() || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || `Request failed: ${response.status}`);
      }

      setPaymentForm((prev) => ({ ...prev, transaction_id: "", note: "" }));
      setSuccess(t.tokenPurchase.success.submitted);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.tokenPurchase.errors.submitFailed;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <section className="card package-zone in-app">
        <AiTokenPackagesSection
          title={t.tokenPurchase.title}
          description={t.tokenPurchase.description}
          packages={CREDIT_PACKAGES}
          wallets={PAYMENT_WALLETS}
          copiedWallet={copiedWallet}
          onCopyWallet={copyWalletAddress}
        />

        <h3>{t.tokenPurchase.noticeTitle}</h3>
        <p className="help-text">{t.tokenPurchase.noticeHelp}</p>
        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success-box">{success}</div> : null}

        <div className="row wrap">
          <select
            value={paymentForm.package_key}
            onChange={(e) => setPaymentForm((prev) => ({ ...prev, package_key: e.target.value }))}
          >
            {CREDIT_PACKAGES.map((pack) => (
              <option key={`token-purchase-package-${pack.key}`} value={pack.key}>
                {pack.title} - {pack.price_tl} TL
              </option>
            ))}
          </select>
          <select value={paymentForm.chain} onChange={(e) => setPaymentForm((prev) => ({ ...prev, chain: e.target.value }))}>
            <option value="solana">Solana</option>
            <option value="ethereum">Ethereum</option>
          </select>
        </div>

        <div className="row wrap">
          <input
            placeholder={t.tokenPurchase.form.transactionIdPlaceholder}
            value={paymentForm.transaction_id}
            onChange={(e) => setPaymentForm((prev) => ({ ...prev, transaction_id: e.target.value }))}
          />
          <input
            placeholder={t.tokenPurchase.form.telegramPlaceholder}
            value={paymentForm.telegram_contact}
            onChange={(e) => setPaymentForm((prev) => ({ ...prev, telegram_contact: e.target.value }))}
          />
        </div>

        <textarea
          rows={3}
          placeholder={t.tokenPurchase.form.notePlaceholder}
          value={paymentForm.note}
          onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))}
        />

        <div className="row">
          <ActionButton
            className="accent-gradient"
            loading={submitting}
            loadingText={t.tokenPurchase.form.submitting}
            onClick={submitPaymentNotice}
          >
            {t.tokenPurchase.form.submit}
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
