import pytest

import app.admin as admin
from app.auth import AuthUser
from app.config import Settings


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class _FakeConn:
    def __init__(self, row):
        self._row = row
        self.deleted_id = None

    def execute(self, statement, params):
        sql = str(statement)
        if "SELECT id, status" in sql:
            return _FakeResult(self._row)
        if "DELETE FROM" in sql:
            self.deleted_id = int(params["notice_id"])
            return _FakeResult(None)
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


def _manager_user():
    return AuthUser(
        id=7,
        username="manager",
        role="admin",
        credits=100,
        is_active=True,
    )


def test_delete_rejected_payment_notice_allows_admin(monkeypatch):
    conn = _FakeConn({"id": 12, "status": "rejected"})
    monkeypatch.setattr(admin, "get_engine", lambda settings: _FakeEngine(conn))
    monkeypatch.setattr(admin, "_ensure_payment_notices_table", lambda engine: None)

    payload = admin.delete_rejected_payment_notice(
        notice_id=12,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_manager_user(),
    )

    assert payload["deleted_id"] == 12
    assert conn.deleted_id == 12


def test_delete_rejected_payment_notice_rejects_non_rejected_status(monkeypatch):
    conn = _FakeConn({"id": 20, "status": "approved"})
    monkeypatch.setattr(admin, "get_engine", lambda settings: _FakeEngine(conn))
    monkeypatch.setattr(admin, "_ensure_payment_notices_table", lambda engine: None)

    with pytest.raises(admin.HTTPException) as exc:
        admin.delete_rejected_payment_notice(
            notice_id=20,
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=_manager_user(),
        )

    assert int(exc.value.status_code) == 400
    assert "reddedilen" in str(exc.value.detail).lower()
