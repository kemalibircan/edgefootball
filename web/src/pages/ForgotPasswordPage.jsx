import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import AuthPageLayout from "../components/auth/AuthPageLayout";
import { useLanguage } from "../contexts/LanguageContext";
import { apiRequest } from "../lib/api";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
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
      setError(t.forgotPassword.errors.emailRequired);
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
      setSuccess(t.forgotPassword.success.codeSent);
    } catch (err) {
      setError(err.message || t.forgotPassword.errors.submitFailed);
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
      setError(t.forgotPassword.errors.emailRequired);
      setSuccess("");
      return;
    }
    if (!code) {
      setError(t.forgotPassword.errors.codeRequired);
      setSuccess("");
      return;
    }
    if (newPassword.length < 6) {
      setError(t.forgotPassword.errors.passwordTooShort);
      setSuccess("");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.forgotPassword.errors.passwordMismatch);
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
      setSuccess(payload.message || t.forgotPassword.success.default);
      setForm((prev) => ({ ...prev, code: "", new_password: "", confirm_password: "" }));
    } catch (err) {
      setError(err.message || t.forgotPassword.errors.submitFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout
      title={t.forgotPassword.title}
      subtitle={t.forgotPassword.panelHelp}
    >
      {error ? <div className="auth-error">{error}</div> : null}
      {success ? <div className="auth-success">{success}</div> : null}

      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          autoComplete="email"
          placeholder={t.forgotPassword.form.emailPlaceholder}
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        />
        <div className="auth-actions">
          <ActionButton
            type="button"
            className="secondary"
            loading={requestingCode}
            loadingText={t.forgotPassword.form.requestingCode}
            onClick={handleRequestCode}
          >
            {t.forgotPassword.form.requestCode}
          </ActionButton>
        </div>

        <input
          placeholder={t.forgotPassword.form.codePlaceholder}
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
          placeholder={t.forgotPassword.form.newPasswordPlaceholder}
          value={form.new_password}
          onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
        />
        <input
          autoComplete="new-password"
          type="password"
          placeholder={t.forgotPassword.form.confirmPasswordPlaceholder}
          value={form.confirm_password}
          onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
        />

        <div className="auth-actions">
          <ActionButton type="submit" loading={loading} loadingText={t.forgotPassword.form.submitting}>
            {t.forgotPassword.form.submit}
          </ActionButton>
          <ActionButton type="button" className="secondary" onClick={() => navigate("/login")}>
            {t.forgotPassword.form.backToLogin}
          </ActionButton>
        </div>
      </form>

      <div className="auth-links-row">
        <Link className="auth-link" to="/login">
          {t.forgotPassword.links.login}
        </Link>
        <Link className="auth-link" to="/register">
          {t.forgotPassword.links.register}
        </Link>
      </div>
    </AuthPageLayout>
  );
}
