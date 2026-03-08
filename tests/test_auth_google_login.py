import pytest
from fastapi import HTTPException

import app.auth as auth
from app.config import Settings


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class _FakeConn:
    def __init__(self):
        self.insert_params = None
        self.credit_tx_params = None
        self.update_params = None
        self.select_after_update_row = None

    def execute(self, statement, params):
        sql = str(statement)
        if "INSERT INTO app_users" in sql:
            self.insert_params = dict(params)
            return _FakeResult(
                {
                    "id": 77,
                    "username": params["username"],
                    "email": params["email"],
                    "email_verified": True,
                    "role": params["role"],
                    "credits": params["credits"],
                    "is_active": True,
                    "created_at": params["created_at"],
                    "updated_at": params["updated_at"],
                    "advanced_mode_enabled": False,
                    "google_sub": params["google_sub"],
                }
            )
        if "INSERT INTO credit_transactions" in sql:
            self.credit_tx_params = dict(params)
            return _FakeResult(None)
        if "UPDATE app_users" in sql and "SET google_sub" in sql:
            self.update_params = dict(params)
            return _FakeResult(None)
        if "SELECT id, username, email, email_verified, role, credits, is_active" in sql and "WHERE id = :user_id" in sql:
            return _FakeResult(self.select_after_update_row)
        raise AssertionError(f"Unexpected SQL in test: {sql}")


class _FakeBegin:
    def __init__(self, conn):
        self._conn = conn

    def __enter__(self):
        return self._conn

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeEngine:
    def __init__(self, conn):
        self._conn = conn

    def begin(self):
        return _FakeBegin(self._conn)


def _settings(**kwargs) -> Settings:
    base = {
        "dummy_mode": True,
        "sportmonks_api_token": None,
        "auth_secret": "unit-test-secret",
        "google_oauth_client_ids": "web-client-id.apps.googleusercontent.com",
    }
    base.update(kwargs)
    return Settings(
        **base,
    )


def test_login_google_creates_new_user_when_email_not_found(monkeypatch):
    conn = _FakeConn()
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(conn))
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
        "_verify_google_id_token",
        lambda raw_id_token, *, settings: {"email": "new@example.com", "sub": "google-sub-001"},
    )
    monkeypatch.setattr(auth, "_fetch_user_by_google_sub", lambda conn, google_sub: None)
    monkeypatch.setattr(auth, "_fetch_login_row", lambda conn, email: None)

    response = auth.login_google(
        request=auth.GoogleLoginRequest(id_token="x" * 60),
        settings=_settings(auth_initial_credits=50),
    )

    assert response.access_token
    assert response.user.email == "new@example.com"
    assert conn.insert_params is not None
    assert conn.insert_params["google_sub"] == "google-sub-001"
    assert conn.credit_tx_params is not None
    assert conn.credit_tx_params["reason"] == "google_signup_initial_credits"


def test_login_google_links_existing_email_without_google_sub(monkeypatch):
    conn = _FakeConn()
    conn.select_after_update_row = {
        "id": 12,
        "username": "existing@example.com",
        "email": "existing@example.com",
        "email_verified": True,
        "role": "user",
        "credits": 100,
        "is_active": True,
        "created_at": None,
        "updated_at": None,
        "advanced_mode_enabled": False,
        "google_sub": "google-sub-xyz",
    }
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(conn))
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
        "_verify_google_id_token",
        lambda raw_id_token, *, settings: {"email": "existing@example.com", "sub": "google-sub-xyz"},
    )
    monkeypatch.setattr(auth, "_fetch_user_by_google_sub", lambda conn, google_sub: None)
    monkeypatch.setattr(
        auth,
        "_fetch_login_row",
        lambda conn, email: {
            "id": 12,
            "username": "existing@example.com",
            "email": "existing@example.com",
            "email_verified": True,
            "password_hash": auth.hash_password("StrongPass123"),
            "role": "user",
            "credits": 100,
            "is_active": True,
            "advanced_mode_enabled": False,
            "google_sub": None,
        },
    )

    response = auth.login_google(
        request=auth.GoogleLoginRequest(id_token="x" * 60),
        settings=_settings(),
    )

    assert response.access_token
    assert response.user.id == 12
    assert conn.update_params is not None
    assert conn.update_params["google_sub"] == "google-sub-xyz"


def test_login_google_rejects_conflicting_google_sub(monkeypatch):
    conn = _FakeConn()
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(conn))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(
        auth,
        "_verify_google_id_token",
        lambda raw_id_token, *, settings: {"email": "existing@example.com", "sub": "incoming-google-sub"},
    )
    monkeypatch.setattr(auth, "_fetch_user_by_google_sub", lambda conn, google_sub: None)
    monkeypatch.setattr(
        auth,
        "_fetch_login_row",
        lambda conn, email: {
            "id": 99,
            "username": "existing@example.com",
            "email": "existing@example.com",
            "email_verified": True,
            "password_hash": auth.hash_password("StrongPass123"),
            "role": "user",
            "credits": 100,
            "is_active": True,
            "advanced_mode_enabled": False,
            "google_sub": "different-google-sub",
        },
    )

    with pytest.raises(HTTPException) as exc:
        auth.login_google(
            request=auth.GoogleLoginRequest(id_token="x" * 60),
            settings=_settings(),
        )
    assert int(exc.value.status_code) == 409


def test_verify_google_id_token_rejects_when_client_ids_not_configured():
    with pytest.raises(HTTPException) as exc:
        auth._verify_google_id_token("x" * 60, settings=_settings(google_oauth_client_ids=""))
    assert int(exc.value.status_code) == 503


def test_verify_google_id_token_rejects_invalid_issuer(monkeypatch):
    monkeypatch.setattr(
        auth.google_id_token,
        "verify_oauth2_token",
        lambda token, request, audience=None: {
            "aud": "web-client-id.apps.googleusercontent.com",
            "iss": "invalid-issuer",
            "email": "valid@example.com",
            "email_verified": True,
            "sub": "google-sub-1",
        },
    )

    with pytest.raises(HTTPException) as exc:
        auth._verify_google_id_token("x" * 60, settings=_settings())
    assert int(exc.value.status_code) == 401


def test_verify_google_id_token_rejects_unverified_email(monkeypatch):
    monkeypatch.setattr(
        auth.google_id_token,
        "verify_oauth2_token",
        lambda token, request, audience=None: {
            "aud": "web-client-id.apps.googleusercontent.com",
            "iss": "https://accounts.google.com",
            "email": "valid@example.com",
            "email_verified": False,
            "sub": "google-sub-1",
        },
    )

    with pytest.raises(HTTPException) as exc:
        auth._verify_google_id_token("x" * 60, settings=_settings())
    assert int(exc.value.status_code) == 401
