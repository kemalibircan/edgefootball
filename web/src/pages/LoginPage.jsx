import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";
import ActionButton from "../components/dashboard/ActionButton";
import AuthPageLayout from "../components/auth/AuthPageLayout";
import { apiRequest, loginWithGoogle } from "../lib/api";
import { readAuthToken, writeAuthToken } from "../lib/auth";
import { useLanguage } from "../contexts/LanguageContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [mode, setMode] = useState("password");
  const [form, setForm] = useState({ email: "", password: "", code: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (readAuthToken()) {
    return <Navigate to="/" replace />;
  }

  const handlePasswordLogin = async () => {
    if (googleLoading) return;
    const email = (form.email || "").trim().toLowerCase();
    const password = form.password || "";

    if (!email || !password) {
      setError(t.auth.login.errors.required);
      return;
    }

    const payload = await apiRequest("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
    writeAuthToken(payload.access_token || "");
    navigate("/", { replace: true });
  };

  const handleCodeLogin = async () => {
    if (googleLoading) return;
    const email = (form.email || "").trim().toLowerCase();
    const code = (form.code || "").replace(/\D/g, "").slice(0, 6);

    if (!email) {
      setError(t.auth.login.errors.emailRequired);
      return;
    }
    if (!code) {
      setError(t.auth.login.errors.codeRequired);
      return;
    }

    const payload = await apiRequest("/auth/login/code/verify", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, code }),
    });
    writeAuthToken(payload.access_token || "");
    navigate("/", { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sendingCode || googleLoading) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "password") {
        await handlePasswordLogin();
      } else {
        await handleCodeLogin();
      }
    } catch (err) {
      setError(err.message || t.auth.login.errors.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (loading || googleLoading) return;
    const email = (form.email || "").trim().toLowerCase();
    if (!email) {
      setError(t.auth.login.errors.emailRequired);
      return;
    }

    setSendingCode(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/auth/login/code/request", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email }),
      });
      setSuccess(t.auth.login.success.codeSent);
    } catch (err) {
      setError(err.message || t.auth.login.errors.loginFailed);
    } finally {
      setSendingCode(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    if (loading || sendingCode || googleLoading) return;
    setGoogleLoading(true);
    setError("");
    setSuccess("");
    try {
      const payload = await loginWithGoogle(credential);
      writeAuthToken(payload.access_token || "");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || t.auth.google.errors.loginFailed);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleError = (message) => {
    if (googleLoading) return;
    setSuccess("");
    setError(String(message || t.auth.google.errors.loginFailed));
  };

  return (
    <AuthPageLayout
      title={t.auth.hero.loginTitle}
      subtitle={t.auth.login.panelHelp}
    >
      {error ? <div className="auth-error">{error}</div> : null}
      {success ? <div className="auth-success">{success}</div> : null}

      <div className="auth-mode-toggles">
        <ActionButton
          type="button"
          className={mode === "password" ? "accent-gradient" : "secondary"}
          disabled={loading || sendingCode || googleLoading}
          onClick={() => {
            setMode("password");
            setError("");
            setSuccess("");
          }}
        >
          {t.auth.login.modes.password}
        </ActionButton>
        <ActionButton
          type="button"
          className={mode === "code" ? "accent-gradient" : "secondary"}
          disabled={loading || sendingCode || googleLoading}
          onClick={() => {
            setMode("code");
            setError("");
            setSuccess("");
          }}
        >
          {t.auth.login.modes.code}
        </ActionButton>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          autoComplete="email"
          placeholder={t.auth.login.form.emailPlaceholder}
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        />

        {mode === "password" ? (
          <input
            autoComplete="current-password"
            type="password"
            placeholder={t.auth.login.form.passwordPlaceholder}
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        ) : (
          <div className="auth-code-row">
            <input
              placeholder={t.auth.login.form.codePlaceholder}
              value={form.code}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  code: (event.target.value || "").replace(/\D/g, "").slice(0, 6),
                }))
              }
            />
            <ActionButton
              type="button"
              className="secondary"
              loading={sendingCode}
              loadingText={t.auth.login.form.sendingCode}
              disabled={loading || googleLoading}
              onClick={handleSendCode}
            >
              {t.auth.login.form.sendCodeLabel}
            </ActionButton>
          </div>
        )}

        <div className="auth-actions">
          <ActionButton
            type="submit"
            loading={loading}
            disabled={sendingCode || googleLoading}
            loadingText={
              mode === "password"
                ? t.auth.login.form.submitting
                : t.auth.login.form.verifyCodeSubmitting
            }
          >
            {mode === "password" ? t.auth.login.form.submitLabel : t.auth.login.form.verifyCodeLabel}
          </ActionButton>
          <ActionButton
            type="button"
            className="secondary"
            disabled={loading || sendingCode || googleLoading}
            onClick={() => navigate("/token-purchase")}
          >
            {t.auth.login.form.viewPackages}
          </ActionButton>
        </div>
      </form>

      <div className="auth-divider" role="separator" aria-label={t.auth.google.orLabel}>
        <span>{t.auth.google.orLabel}</span>
      </div>

      <div className="google-auth-zone">
        <p className="auth-google-label">{t.auth.google.loginButtonLabel}</p>
        <GoogleSignInButton
          text="signin_with"
          loading={googleLoading}
          disabled={loading || sendingCode}
          errorFallback={t.auth.google.errors.loginFailed}
          setupErrorFallback={t.auth.google.errors.setupRequired}
          onCredential={handleGoogleCredential}
          onError={handleGoogleError}
        />
        {googleLoading ? <p className="auth-google-loading">{t.auth.google.loading}</p> : null}
      </div>

      <div className="auth-links-row">
        <Link className="auth-link" to="/forgot-password">
          {t.auth.login.links.forgotPassword}
        </Link>
        <Link className="auth-link" to="/register">
          {t.auth.login.links.register}
        </Link>
      </div>
    </AuthPageLayout>
  );
}
