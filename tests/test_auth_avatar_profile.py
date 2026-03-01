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
        self.updated_avatar_key = None

    def execute(self, statement, params):
        sql = str(statement)
        if "UPDATE app_users" in sql and "SET avatar_key" in sql:
            self.updated_avatar_key = str(params["avatar_key"])
            return _FakeResult(
                {
                    "id": int(params["user_id"]),
                    "username": "user@example.com",
                    "email": "user@example.com",
                    "email_verified": True,
                    "role": "user",
                    "credits": 100,
                    "is_active": True,
                    "created_at": None,
                    "updated_at": params["now_utc"],
                    "advanced_mode_enabled": False,
                    "avatar_key": self.updated_avatar_key,
                }
            )
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


def _settings() -> Settings:
    return Settings(dummy_mode=True, sportmonks_api_token=None)


def _request(base_url: str = "http://localhost:8001/"):
    return type("Request", (), {"base_url": base_url})()


def _user(avatar_key: str = "open_peeps_01") -> auth.AuthUser:
    return auth.AuthUser(
        id=9,
        username="user@example.com",
        email="user@example.com",
        email_verified=True,
        role="user",
        credits=100,
        is_active=True,
        advanced_mode_enabled=False,
        avatar_key=avatar_key,
    )


def test_avatar_options_returns_10_unique_items():
    payload = auth.avatar_options(request=_request())

    assert len(payload.items) == 10
    keys = [item.key for item in payload.items]
    assert len(set(keys)) == 10
    assert keys[0] == "open_peeps_01"
    assert payload.items[0].image_url.endswith("/static/avatars/open_peeps_01.png")


def test_update_my_avatar_rejects_invalid_key(monkeypatch):
    monkeypatch.setattr(auth, "create_engine", lambda db_url: _FakeEngine(_FakeConn()))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)

    with pytest.raises(HTTPException) as exc:
        auth.update_my_avatar(
            request=auth.AvatarUpdateRequest(avatar_key="invalid-key"),
            current_user=_user(),
            settings=_settings(),
        )

    assert int(exc.value.status_code) == 400


def test_update_my_avatar_persists_and_returns_user(monkeypatch):
    conn = _FakeConn()
    monkeypatch.setattr(auth, "create_engine", lambda db_url: _FakeEngine(conn))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)

    payload = auth.update_my_avatar(
        request=auth.AvatarUpdateRequest(avatar_key="open_peeps_06"),
        current_user=_user(),
        settings=_settings(),
    )

    assert conn.updated_avatar_key == "open_peeps_06"
    assert payload.avatar_key == "open_peeps_06"


def test_me_response_contains_avatar_key():
    current = _user(avatar_key="open_peeps_04")
    payload = auth.me(current_user=current)

    assert payload.avatar_key == "open_peeps_04"
