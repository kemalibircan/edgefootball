import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import { uiText } from "../i18n/terms.tr";
import { apiRequest } from "../lib/api";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    code: "",
    new_password: "",
    confirm_password: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);

  const handleRequestCode = async () => {
    const email = (form.email || "").trim().toLowerCase();
    if (!email) {
      setError(uiText.forgotPassword.errors.emailRequired);
      setSuccess("");
      return;
    }

    setRequestingCode(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/auth/password/forgot/request", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email }),
      });
      setSuccess(uiText.forgotPassword.success.codeSent);
    } catch (err) {
      setError(err.message || uiText.forgotPassword.errors.submitFailed);
    } finally {
      setRequestingCode(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const email = (form.email || "").trim().toLowerCase();
    const code = (form.code || "").replace(/\D/g, "").slice(0, 6);
    const newPassword = form.new_password || "";
    const confirmPassword = form.confirm_password || "";

    if (!email) {
      setError(uiText.forgotPassword.errors.emailRequired);
      setSuccess("");
      return;
    }
    if (!code) {
      setError(uiText.forgotPassword.errors.codeRequired);
      setSuccess("");
      return;
    }
    if (newPassword.length < 6) {
      setError(uiText.forgotPassword.errors.passwordTooShort);
      setSuccess("");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(uiText.forgotPassword.errors.passwordMismatch);
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const payload = await apiRequest("/auth/password/forgot/confirm", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({
          email,
          code,
          new_password: newPassword,
        }),
      });
      setSuccess(payload.message || uiText.forgotPassword.success.default);
      setForm((prev) => ({ ...prev, code: "", new_password: "", confirm_password: "" }));
    } catch (err) {
      setError(err.message || uiText.forgotPassword.errors.submitFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container auth-page-shell">
      <section className="card sportsbook-hero auth-hero-card">
        <div className="sportsbook-topbar">
          <span className="sports-pill">{uiText.forgotPassword.heroPill}</span>
          <span className="sports-status">{uiText.forgotPassword.heroStatus}</span>
        </div>
        <h1>{uiText.forgotPassword.title}</h1>
        <p className="hero-text">{uiText.forgotPassword.heroText}</p>
      </section>

      <section className="card auth-card auth-form-card">
        <h2>{uiText.forgotPassword.panelTitle}</h2>
        <p className="help-text">{uiText.forgotPassword.panelHelp}</p>
        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success-box">{success}</div> : null}

        <form className="auth-input-grid" onSubmit={handleSubmit}>
          <input
            autoComplete="email"
            placeholder={uiText.forgotPassword.form.emailPlaceholder}
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <div className="row wrap auth-actions">
            <ActionButton
              type="button"
              className="secondary"
              loading={requestingCode}
              loadingText={uiText.forgotPassword.form.requestingCode}
              onClick={handleRequestCode}
            >
              {uiText.forgotPassword.form.requestCode}
            </ActionButton>
          </div>

          <input
            placeholder={uiText.forgotPassword.form.codePlaceholder}
            value={form.code}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                code: (event.target.value || "").replace(/\D/g, "").slice(0, 6),
              }))
            }
          />
          <input
            autoComplete="new-password"
            type="password"
            placeholder={uiText.forgotPassword.form.newPasswordPlaceholder}
            value={form.new_password}
            onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
          />
          <input
            autoComplete="new-password"
            type="password"
            placeholder={uiText.forgotPassword.form.confirmPasswordPlaceholder}
            value={form.confirm_password}
            onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
          />

          <div className="row wrap auth-actions">
            <ActionButton type="submit" loading={loading} loadingText={uiText.forgotPassword.form.submitting}>
              {uiText.forgotPassword.form.submit}
            </ActionButton>
            <ActionButton type="button" className="secondary" onClick={() => navigate("/login")}>
              {uiText.forgotPassword.form.backToLogin}
            </ActionButton>
          </div>
        </form>

        <div className="auth-inline-links">
          <Link className="auth-link" to="/login">
            {uiText.forgotPassword.links.login}
          </Link>
          <Link className="auth-link" to="/register">
            {uiText.forgotPassword.links.register}
          </Link>
        </div>
      </section>
    </div>
  );
}
