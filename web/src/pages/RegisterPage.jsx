import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";
import ActionButton from "../components/dashboard/ActionButton";
import AuthPageLayout from "../components/auth/AuthPageLayout";
import { apiRequest, loginWithGoogle } from "../lib/api";
import { readAuthToken, writeAuthToken } from "../lib/auth";
import { useLanguage } from "../contexts/LanguageContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
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
  const [googleLoading, setGoogleLoading] = useState(false);

  if (readAuthToken()) {
    return <Navigate to="/" replace />;
  }

  const validateRequestFields = () => {
    const email = (form.email || "").trim().toLowerCase();
    const password = form.password || "";
    const confirmPassword = form.confirm_password || "";

    if (!email) {
      setError(t.auth.register.errors.emailRequired);
      return null;
    }
    if (password.length < 6) {
      setError(t.auth.register.errors.passwordTooShort);
      return null;
    }
    if (password !== confirmPassword) {
      setError(t.auth.register.errors.passwordMismatch);
      return null;
    }

    return { email, password };
  };

  const handleRequestCode = async ({ resend = false } = {}) => {
    if (loading || googleLoading) return;
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
          ? `${t.auth.register.success.codeSent} (Yeni kod gonderildi)`
          : t.auth.register.success.codeSent,
      );
    } catch (err) {
      setError(err.message || t.auth.register.errors.registerFailed);
    } finally {
      setRequestingCode(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (requestingCode || googleLoading) return;
    const email = (form.email || "").trim().toLowerCase();
    const code = (form.code || "").trim();

    if (!email) {
      setError(t.auth.register.errors.emailRequired);
      return;
    }
    if (!code) {
      setError(t.auth.register.errors.codeRequired);
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
      setError(err.message || t.auth.register.errors.registerFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    if (loading || requestingCode || googleLoading) return;
    setGoogleLoading(true);
    setError("");
    setSuccess("");
    try {
      const payload = await loginWithGoogle(credential);
      writeAuthToken(payload.access_token || "");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || t.auth.google.errors.registerFailed);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleError = (message) => {
    if (googleLoading) return;
    setSuccess("");
    setError(String(message || t.auth.google.errors.registerFailed));
  };

  return (
    <AuthPageLayout
      title={t.auth.hero.registerTitle}
      subtitle={t.auth.register.panelHelp}
    >
      {error ? <div className="auth-error">{error}</div> : null}
      {success ? <div className="auth-success">{success}</div> : null}

      <form className="auth-form" onSubmit={handleVerify}>
          <input
            autoComplete="email"
            placeholder={t.auth.register.form.emailPlaceholder}
            value={form.email}
            disabled={step === "verify"}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            autoComplete="new-password"
            type="password"
            placeholder={t.auth.register.form.passwordPlaceholder}
            value={form.password}
            disabled={step === "verify"}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
          <input
            autoComplete="new-password"
            type="password"
            placeholder={t.auth.register.form.confirmPasswordPlaceholder}
            value={form.confirm_password}
            disabled={step === "verify"}
            onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
          />

          {step === "request" ? (
            <div className="auth-actions">
              <ActionButton
                type="button"
                className="secondary"
                loading={requestingCode}
                loadingText={t.auth.register.form.requestingCode}
                disabled={loading || googleLoading}
                onClick={() => handleRequestCode({ resend: false })}
              >
                {t.auth.register.form.requestCodeLabel}
              </ActionButton>
            </div>
          ) : null}

          {step === "verify" ? (
            <>
              <input
                placeholder={t.auth.register.form.codePlaceholder}
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    code: (event.target.value || "").replace(/\D/g, "").slice(0, 6),
                  }))
                }
              />
              <div className="auth-actions">
                <ActionButton
                  type="submit"
                  loading={loading}
                  disabled={requestingCode || googleLoading}
                  loadingText={t.auth.register.form.submitting}
                >
                  {t.auth.register.form.submitLabel}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  loading={requestingCode}
                  loadingText={t.auth.register.form.resendingCode}
                  disabled={loading || googleLoading}
                  onClick={() => handleRequestCode({ resend: true })}
                >
                  {t.auth.register.form.resendCodeLabel}
                </ActionButton>
                <ActionButton
                  type="button"
                  className="secondary"
                  disabled={loading || requestingCode || googleLoading}
                  onClick={() => navigate("/login")}
                >
                  {t.auth.register.form.backToLogin}
                </ActionButton>
              </div>
            </>
          ) : (
            <div className="auth-actions">
              <ActionButton
                type="button"
                className="secondary"
                disabled={loading || requestingCode || googleLoading}
                onClick={() => navigate("/login")}
              >
                {t.auth.register.form.backToLogin}
              </ActionButton>
            </div>
          )}
        </form>

      <div className="auth-divider" role="separator" aria-label={t.auth.google.orLabel}>
        <span>{t.auth.google.orLabel}</span>
      </div>

      <div className="google-auth-zone">
        <p className="auth-google-label">{t.auth.google.registerButtonLabel}</p>
        <GoogleSignInButton
          text="signup_with"
          loading={googleLoading}
          disabled={loading || requestingCode}
          errorFallback={t.auth.google.errors.registerFailed}
          setupErrorFallback={t.auth.google.errors.setupRequired}
          onCredential={handleGoogleCredential}
          onError={handleGoogleError}
        />
        {googleLoading ? <p className="auth-google-loading">{t.auth.google.loading}</p> : null}
      </div>

      <div className="auth-links-row">
        <Link className="auth-link" to="/login">
          {t.auth.register.links.haveAccount}
        </Link>
        <Link className="auth-link" to="/forgot-password">
          {t.auth.register.links.forgotPassword}
        </Link>
      </div>
    </AuthPageLayout>
  );
}
