import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import { apiRequest } from "../lib/api";
import { readAuthToken, writeAuthToken } from "../lib/auth";
import { uiText } from "../i18n/terms.tr";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("request");
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm_password: "",
    code: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);

  if (readAuthToken()) {
    return <Navigate to="/" replace />;
  }

  const validateRequestFields = () => {
    const email = (form.email || "").trim().toLowerCase();
    const password = form.password || "";
    const confirmPassword = form.confirm_password || "";

    if (!email) {
      setError(uiText.auth.register.errors.emailRequired);
      return null;
    }
    if (password.length < 6) {
      setError(uiText.auth.register.errors.passwordTooShort);
      return null;
    }
    if (password !== confirmPassword) {
      setError(uiText.auth.register.errors.passwordMismatch);
      return null;
    }

    return { email, password };
  };

  const handleRequestCode = async ({ resend = false } = {}) => {
    const fields = validateRequestFields();
    if (!fields) return;

    setRequestingCode(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/auth/register/request", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(fields),
      });
      setStep("verify");
      setSuccess(
        resend
          ? `${uiText.auth.register.success.codeSent} (Yeni kod gonderildi)`
          : uiText.auth.register.success.codeSent,
      );
    } catch (err) {
      setError(err.message || uiText.auth.register.errors.registerFailed);
    } finally {
      setRequestingCode(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    const email = (form.email || "").trim().toLowerCase();
    const code = (form.code || "").trim();

    if (!email) {
      setError(uiText.auth.register.errors.emailRequired);
      return;
    }
    if (!code) {
      setError(uiText.auth.register.errors.codeRequired);
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const payload = await apiRequest("/auth/register/verify", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email, code }),
      });
      writeAuthToken(payload.access_token || "");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || uiText.auth.register.errors.registerFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container auth-page-shell">
      <section className="card sportsbook-hero auth-hero-card">
        <div className="sportsbook-topbar">
          <span className="sports-pill">{uiText.auth.hero.registerPill}</span>
          <span className="sports-status">{uiText.auth.hero.registerStatus}</span>
        </div>
        <h1>{uiText.auth.hero.registerTitle}</h1>
        <p className="hero-text">{uiText.auth.hero.registerText}</p>
      </section>

      <section className="card auth-card auth-form-card">
        <h2>{uiText.auth.register.panelTitle}</h2>
        <p className="help-text">{uiText.auth.register.panelHelp}</p>
        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success-box">{success}</div> : null}

        <form className="auth-input-grid" onSubmit={handleVerify}>
          <input
            autoComplete="email"
            placeholder={uiText.auth.register.form.emailPlaceholder}
            value={form.email}
            disabled={step === "verify"}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            autoComplete="new-password"
            type="password"
            placeholder={uiText.auth.register.form.passwordPlaceholder}
            value={form.password}
            disabled={step === "verify"}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
          <input
            autoComplete="new-password"
            type="password"
            placeholder={uiText.auth.register.form.confirmPasswordPlaceholder}
            value={form.confirm_password}
            disabled={step === "verify"}
            onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
          />

          {step === "request" ? (
            <div className="row wrap auth-actions">
              <ActionButton
                type="button"
                className="secondary"
                loading={requestingCode}
                loadingText={uiText.auth.register.form.requestingCode}
                onClick={() => handleRequestCode({ resend: false })}
              >
                {uiText.auth.register.form.requestCodeLabel}
              </ActionButton>
            </div>
          ) : null}

          {step === "verify" ? (
            <>
              <input
                placeholder={uiText.auth.register.form.codePlaceholder}
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    code: (event.target.value || "").replace(/\D/g, "").slice(0, 6),
                  }))
                }
              />
              <div className="row wrap auth-actions">
                <ActionButton type="submit" loading={loading} loadingText={uiText.auth.register.form.submitting}>
                  {uiText.auth.register.form.submitLabel}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  loading={requestingCode}
                  loadingText={uiText.auth.register.form.resendingCode}
                  onClick={() => handleRequestCode({ resend: true })}
                >
                  {uiText.auth.register.form.resendCodeLabel}
                </ActionButton>
                <ActionButton type="button" className="secondary" onClick={() => navigate("/login")}>
                  {uiText.auth.register.form.backToLogin}
                </ActionButton>
              </div>
            </>
          ) : (
            <div className="row wrap auth-actions">
              <ActionButton type="button" className="secondary" onClick={() => navigate("/login")}>
                {uiText.auth.register.form.backToLogin}
              </ActionButton>
            </div>
          )}
        </form>

        <div className="auth-inline-links">
          <Link className="auth-link" to="/login">
            {uiText.auth.register.links.haveAccount}
          </Link>
          <Link className="auth-link" to="/forgot-password">
            {uiText.auth.register.links.forgotPassword}
          </Link>
        </div>
      </section>
    </div>
  );
}
