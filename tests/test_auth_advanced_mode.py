import pytest

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
    def __init__(self, *, current_enabled: bool):
        self.current_enabled = bool(current_enabled)
        self.update_count = 0

    def execute(self, statement, params):
        sql = str(statement)
        if "SELECT advanced_mode_enabled" in sql:
            return _FakeResult({"advanced_mode_enabled": self.current_enabled})
        if "UPDATE app_users" in sql and "SET advanced_mode_enabled" in sql:
            self.current_enabled = bool(params["enabled"])
            self.update_count += 1
            return _FakeResult({"advanced_mode_enabled": self.current_enabled})
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


def _current_user(enabled: bool) -> auth.AuthUser:
    return auth.AuthUser(
        id=5,
        username="user",
        role="user",
        credits=100,
        is_active=True,
        advanced_mode_enabled=enabled,
    )


def test_set_advanced_mode_blocks_self_upgrade(monkeypatch):
    conn = _FakeConn(current_enabled=False)
    monkeypatch.setattr(auth, "create_engine", lambda db_url: _FakeEngine(conn))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)

    with pytest.raises(auth.HTTPException) as exc:
        auth.set_advanced_mode(
            request=auth.AdvancedModeUpdateRequest(enabled=True),
            current_user=_current_user(False),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None, advanced_mode_price_tl=500),
        )

    assert int(exc.value.status_code) == 403
    assert "odeme" in str(exc.value.detail).lower()
    assert conn.update_count == 0


def test_set_advanced_mode_allows_disable(monkeypatch):
    conn = _FakeConn(current_enabled=True)
    monkeypatch.setattr(auth, "create_engine", lambda db_url: _FakeEngine(conn))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)

    payload = auth.set_advanced_mode(
        request=auth.AdvancedModeUpdateRequest(enabled=False),
        current_user=_current_user(True),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
    )

    assert payload.advanced_mode_enabled is False
    assert conn.update_count == 1


def test_set_advanced_mode_idempotent_when_already_enabled(monkeypatch):
    conn = _FakeConn(current_enabled=True)
    monkeypatch.setattr(auth, "create_engine", lambda db_url: _FakeEngine(conn))
    monkeypatch.setattr(auth, "ensure_auth_tables", lambda engine: None)

    payload = auth.set_advanced_mode(
        request=auth.AdvancedModeUpdateRequest(enabled=True),
        current_user=_current_user(True),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
    )

    assert payload.advanced_mode_enabled is True
    assert conn.update_count == 0
