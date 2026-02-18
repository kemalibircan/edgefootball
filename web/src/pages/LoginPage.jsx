import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import { apiRequest } from "../lib/api";
import { readAuthToken, writeAuthToken } from "../lib/auth";
import { uiText } from "../i18n/terms.tr";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("password");
  const [form, setForm] = useState({ email: "", password: "", code: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  if (readAuthToken()) {
    return <Navigate to="/" replace />;
  }

  const handlePasswordLogin = async () => {
    const email = (form.email || "").trim().toLowerCase();
    const password = form.password || "";

    if (!email || !password) {
      setError(uiText.auth.login.errors.required);
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
    const email = (form.email || "").trim().toLowerCase();
    const code = (form.code || "").replace(/\D/g, "").slice(0, 6);

    if (!email) {
      setError(uiText.auth.login.errors.emailRequired);
      return;
    }
    if (!code) {
      setError(uiText.auth.login.errors.codeRequired);
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
      setError(err.message || uiText.auth.login.errors.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    const email = (form.email || "").trim().toLowerCase();
    if (!email) {
      setError(uiText.auth.login.errors.emailRequired);
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
      setSuccess(uiText.auth.login.success.codeSent);
    } catch (err) {
      setError(err.message || uiText.auth.login.errors.loginFailed);
    } finally {
      setSendingCode(false);
    }
  };

  return (
    <div className="container auth-page-shell">
      <section className="card sportsbook-hero auth-hero-card">
        <div className="sportsbook-topbar">
          <span className="sports-pill">{uiText.app.name}</span>
          <span className="sports-status">{uiText.auth.hero.loginStatus}</span>
        </div>
        <h1>{uiText.auth.hero.loginTitle}</h1>
        <p className="hero-text">{uiText.auth.hero.loginText}</p>
      </section>

      <section className="card auth-card auth-form-card">
        <h2>{uiText.auth.login.panelTitle}</h2>
        <p className="help-text">{uiText.auth.login.panelHelp}</p>
        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success-box">{success}</div> : null}

        <div className="row wrap auth-actions">
          <ActionButton
            type="button"
            className={mode === "password" ? "accent-gradient" : "secondary"}
            onClick={() => {
              setMode("password");
              setError("");
              setSuccess("");
            }}
          >
            {uiText.auth.login.modes.password}
          </ActionButton>
          <ActionButton
            type="button"
            className={mode === "code" ? "accent-gradient" : "secondary"}
            onClick={() => {
              setMode("code");
              setError("");
              setSuccess("");
            }}
          >
            {uiText.auth.login.modes.code}
          </ActionButton>
        </div>

        <form className="auth-input-grid" onSubmit={handleSubmit}>
          <input
            autoComplete="email"
            placeholder={uiText.auth.login.form.emailPlaceholder}
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />

          {mode === "password" ? (
            <input
              autoComplete="current-password"
              type="password"
              placeholder={uiText.auth.login.form.passwordPlaceholder}
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          ) : (
            <>
              <input
                placeholder={uiText.auth.login.form.codePlaceholder}
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
                loadingText={uiText.auth.login.form.sendingCode}
                onClick={handleSendCode}
              >
                {uiText.auth.login.form.sendCodeLabel}
              </ActionButton>
            </>
          )}

          <div className="row wrap auth-actions">
            <ActionButton
              type="submit"
              loading={loading}
              loadingText={
                mode === "password"
                  ? uiText.auth.login.form.submitting
                  : uiText.auth.login.form.verifyCodeSubmitting
              }
            >
              {mode === "password" ? uiText.auth.login.form.submitLabel : uiText.auth.login.form.verifyCodeLabel}
            </ActionButton>
            <ActionButton type="button" className="secondary" onClick={() => navigate("/token-purchase")}>
              {uiText.auth.login.form.viewPackages}
            </ActionButton>
          </div>
        </form>

        <div className="auth-inline-links">
          <Link className="auth-link" to="/forgot-password">
            {uiText.auth.login.links.forgotPassword}
          </Link>
          <Link className="auth-link" to="/register">
            {uiText.auth.login.links.register}
          </Link>
        </div>
      </section>
    </div>
  );
}
