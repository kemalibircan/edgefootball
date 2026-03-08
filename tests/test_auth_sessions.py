from datetime import timedelta

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import app.auth as auth
from app.config import Settings


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


def _settings() -> Settings:
    return Settings(
        dummy_mode=True,
        sportmonks_api_token=None,
        auth_secret="unit-test-secret",
        auth_access_token_ttl_minutes=15,
        auth_refresh_token_ttl_days=30,
    )


def test_refresh_rotates_session_and_returns_mobile_refresh_token(monkeypatch):
    settings = _settings()
    now_utc = auth._utc_now()

    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(
        auth,
        "_get_session_by_refresh_hash",
        lambda conn, refresh_hash: {
            "id": 10,
            "user_id": 5,
            "client_platform": "mobile",
            "expires_at": now_utc + timedelta(hours=1),
            "revoked_at": None,
        },
    )
    monkeypatch.setattr(
        auth,
        "_fetch_user_by_id",
        lambda conn, user_id: auth.AuthUser(
            id=5,
            username="tester",
            email="tester@example.com",
            email_verified=True,
            role="user",
            credits=50,
            is_active=True,
        ),
    )
    monkeypatch.setattr(auth, "create_refresh_token", lambda: "next-refresh-token")
    monkeypatch.setattr(
        auth,
        "rotate_session",
        lambda conn, **kwargs: {
            "id": 11,
            "user_id": 5,
            "client_platform": "mobile",
            "expires_at": now_utc + timedelta(days=30),
            "revoked_at": None,
        },
    )

    payload = auth.refresh_access_token(
        refresh_request=auth.RefreshRequest(refresh_token="old-refresh-token"),
        settings=settings,
    )

    assert payload.refresh_token == "next-refresh-token"
    decoded = auth.decode_access_token(payload.access_token, settings)
    assert int(decoded["sub"]) == 5
    assert int(decoded["sid"]) == 11


def test_refresh_rejects_unknown_session(monkeypatch):
    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(auth, "_get_session_by_refresh_hash", lambda conn, refresh_hash: None)

    with pytest.raises(HTTPException) as exc:
        auth.refresh_access_token(
            refresh_request=auth.RefreshRequest(refresh_token="unknown"),
            settings=_settings(),
        )

    assert int(exc.value.status_code) == 401
    assert str(exc.value.detail) == "Session invalidated"


def test_logout_revokes_current_session(monkeypatch):
    revoked_ids: list[int] = []

    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(
        auth,
        "_extract_session_id_from_credentials",
        lambda credentials, *, settings, request=None: 44,
    )
    monkeypatch.setattr(auth, "revoke_session", lambda conn, session_id: revoked_ids.append(int(session_id)))

    response = auth.logout(
        credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"),
        settings=_settings(),
    )

    assert response.ok is True
    assert revoked_ids == [44]


def test_get_current_user_rejects_revoked_session(monkeypatch):
    settings = _settings()
    now_utc = auth._utc_now()

    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)
    monkeypatch.setattr(auth, "decode_access_token", lambda token, settings, request=None: {"sub": 8, "sid": 91})
    monkeypatch.setattr(
        auth,
        "get_session_by_id",
        lambda conn, session_id: {
            "id": 91,
            "user_id": 8,
            "expires_at": now_utc + timedelta(hours=1),
            "revoked_at": now_utc,
        },
    )

    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(
            credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token"),
            settings=settings,
        )

    assert int(exc.value.status_code) == 401
    assert str(exc.value.detail) == "Session invalidated"


def test_get_current_user_does_not_run_runtime_schema_ddl(monkeypatch):
    settings = _settings()
    now_utc = auth._utc_now()

    monkeypatch.setattr(auth, "get_engine", lambda settings: _FakeEngine(object()))
    monkeypatch.setattr(
        auth,
        "ensure_auth_tables",
        lambda engine: (_ for _ in ()).throw(AssertionError("ensure_auth_tables should not run in request path")),
    )
    monkeypatch.setattr(auth, "decode_access_token", lambda token, settings, request=None: {"sub": 8, "sid": 91})
    monkeypatch.setattr(
        auth,
        "get_session_by_id",
        lambda conn, session_id: {
            "id": 91,
            "user_id": 8,
            "expires_at": now_utc + timedelta(hours=1),
            "revoked_at": None,
        },
    )
    monkeypatch.setattr(auth, "_touch_session", lambda conn, session_id: None)
    monkeypatch.setattr(
        auth,
        "_fetch_user_by_id",
        lambda conn, user_id: auth.AuthUser(
            id=8,
            username="tester",
            email="tester@example.com",
            email_verified=True,
            role="user",
            credits=100,
            is_active=True,
        ),
    )

    user = auth.get_current_user(
        credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token"),
        settings=settings,
    )

    assert int(user.id) == 8
