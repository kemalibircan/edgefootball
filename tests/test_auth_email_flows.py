from fastapi import HTTPException

import app.auth as auth
from app.config import Settings
from app.mailer import MailDeliveryError


class _FakeBegin:
    def __init__(self, conn):
        self._conn = conn

    def __enter__(self):
        return self._conn

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeEngine:
    def __init__(self, conn=None):
        self._conn = conn or object()

    def begin(self):
        return _FakeBegin(self._conn)

    def connect(self):
        return _FakeBegin(self._conn)


def _settings() -> Settings:
    return Settings(
        dummy_mode=True,
        sportmonks_api_token=None,
        auth_secret="unit-test-secret",
        auth_code_ttl_minutes=10,
        auth_code_resend_cooldown_seconds=60,
        auth_code_max_attempts=5,
    )


def test_register_request_dispatches_code(monkeypatch):
    captured: dict[str, object] = {}
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(auth, "_fetch_login_row", lambda conn, email: None)

    def _create(conn, *, email, purpose, payload, settings):
        captured["email"] = email
        captured["purpose"] = purpose
        captured["payload"] = payload
        return "123456"

    def _send(settings, *, email, purpose, code):
        captured["sent_email"] = email
        captured["sent_purpose"] = purpose
        captured["sent_code"] = code

    monkeypatch.setattr(auth, "_create_email_challenge", _create)
    monkeypatch.setattr(auth, "_send_email_code", _send)

    response = auth.register_request(
        request=auth.RegisterRequest(email="USER@Example.com", password="StrongPass123"),
        settings=_settings(),
    )

    assert response.ok is True
    assert captured["email"] == "user@example.com"
    assert captured["purpose"] == auth.EMAIL_CODE_PURPOSE_REGISTER
    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert payload.get("password_hash")
    assert captured["sent_code"] == "123456"


def test_register_request_returns_conflict_for_verified_email(monkeypatch):
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(
        auth,
        "_fetch_login_row",
        lambda conn, email: {"id": 1, "email": email, "email_verified": True},
    )

    try:
        auth.register_request(
            request=auth.RegisterRequest(email="user@example.com", password="StrongPass123"),
            settings=_settings(),
        )
        assert False, "Expected conflict for verified email"
    except HTTPException as exc:
        assert int(exc.status_code) == 409


def test_register_request_wraps_mail_delivery_error(monkeypatch):
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(auth, "_fetch_login_row", lambda conn, email: None)
    monkeypatch.setattr(auth, "_create_email_challenge", lambda conn, **kwargs: "123456")
    monkeypatch.setattr(
        auth,
        "_send_email_code",
        lambda settings, *, email, purpose, code: (_ for _ in ()).throw(MailDeliveryError("smtp-down")),
    )

    try:
        auth.register_request(
            request=auth.RegisterRequest(email="user@example.com", password="StrongPass123"),
            settings=_settings(),
        )
        assert False, "Expected 503 on mail delivery failure"
    except HTTPException as exc:
        assert int(exc.status_code) == 503
        assert "mail" in str(exc.detail).lower()


def test_login_requires_verified_and_active(monkeypatch):
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(
        auth,
        "_fetch_login_row",
        lambda conn, email: {
            "id": 4,
            "username": email,
            "email": email,
            "email_verified": False,
            "password_hash": auth.hash_password("StrongPass123"),
            "role": "user",
            "credits": 100,
            "is_active": True,
        },
    )

    try:
        auth.login(
            request=auth.LoginRequest(email="user@example.com", password="StrongPass123"),
            settings=_settings(),
        )
        assert False, "Expected forbidden when email is not verified"
    except HTTPException as exc:
        assert int(exc.status_code) == 403


def test_verify_login_code_success(monkeypatch):
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(
        auth,
        "_create_login_session_payload",
        lambda conn, *, user, settings, request=None, response=None: auth.LoginResponse(
            access_token="session-token",
            user=user,
            expires_in_seconds=900,
            refresh_token="refresh-token",
        ),
    )
    monkeypatch.setattr(
        auth,
        "_consume_email_code",
        lambda conn, *, email, purpose, code, settings: {"user_id": 10},
    )
    monkeypatch.setattr(
        auth,
        "_fetch_login_row",
        lambda conn, email: {
            "id": 10,
            "username": email,
            "email": email,
            "email_verified": True,
            "password_hash": auth.hash_password("StrongPass123"),
            "role": "user",
            "credits": 75,
            "is_active": True,
        },
    )

    response = auth.verify_login_code(
        request=auth.VerifyLoginCodeRequest(email="user@example.com", code="123456"),
        settings=_settings(),
    )
    assert response.access_token
    assert response.user.email == "user@example.com"
    assert response.user.email_verified is True
