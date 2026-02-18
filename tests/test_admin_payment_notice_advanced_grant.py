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
    def __init__(self, notice_row, *, user_advanced: bool = False):
        self.notice_row = dict(notice_row) if notice_row else None
        self.user_advanced = bool(user_advanced)
        self.user_update_count = 0

    def execute(self, statement, params):
        sql = str(statement)
        if "SELECT id, user_id, package_key" in sql:
            return _FakeResult(dict(self.notice_row) if self.notice_row else None)
        if "UPDATE payment_notices" in sql and "SET status" in sql:
            if not self.notice_row:
                return _FakeResult(None)
            self.notice_row["status"] = params["status"]
            self.notice_row["admin_note"] = params["admin_note"]
            self.notice_row["reviewed_by"] = params["reviewed_by"]
            return _FakeResult(dict(self.notice_row))
        if "UPDATE app_users" in sql and "advanced_mode_enabled = TRUE" in sql:
            if self.user_advanced:
                return _FakeResult(None)
            self.user_advanced = True
            self.user_update_count += 1
            return _FakeResult({"id": int(params["user_id"])})
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
        advanced_mode_enabled=True,
    )


def test_set_payment_notice_status_grants_advanced_mode_once(monkeypatch):
    conn = _FakeConn(
        {
            "id": 10,
            "user_id": 42,
            "package_key": "advanced-mode-500",
            "status": "pending",
        },
        user_advanced=False,
    )
    monkeypatch.setattr(admin, "create_engine", lambda db_url: _FakeEngine(conn))
    monkeypatch.setattr(admin, "_ensure_payment_notices_table", lambda engine: None)
    monkeypatch.setattr(admin, "ensure_auth_tables", lambda engine: None)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, advanced_mode_package_key="advanced-mode-500")
    request = admin.PaymentNoticeStatusRequest(status="approved", admin_note="ok")

    first = admin.set_payment_notice_status(
        notice_id=10,
        request=request,
        settings=settings,
        current_user=_manager_user(),
    )
    second = admin.set_payment_notice_status(
        notice_id=10,
        request=request,
        settings=settings,
        current_user=_manager_user(),
    )

    assert first["notice"]["status"] == "approved"
    assert first["advanced_mode_granted"] is True
    assert int(first["advanced_mode_user_id"]) == 42

    assert second["advanced_mode_granted"] is False
    assert int(second["advanced_mode_user_id"]) == 42
    assert conn.user_update_count == 1


def test_set_payment_notice_status_does_not_grant_for_other_packages(monkeypatch):
    conn = _FakeConn(
        {
            "id": 11,
            "user_id": 51,
            "package_key": "starter-15",
            "status": "pending",
        },
        user_advanced=False,
    )
    monkeypatch.setattr(admin, "create_engine", lambda db_url: _FakeEngine(conn))
    monkeypatch.setattr(admin, "_ensure_payment_notices_table", lambda engine: None)
    monkeypatch.setattr(admin, "ensure_auth_tables", lambda engine: None)

    payload = admin.set_payment_notice_status(
        notice_id=11,
        request=admin.PaymentNoticeStatusRequest(status="approved", admin_note=None),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None, advanced_mode_package_key="advanced-mode-500"),
        current_user=_manager_user(),
    )

    assert payload["notice"]["status"] == "approved"
    assert payload["advanced_mode_granted"] is False
    assert payload["advanced_mode_user_id"] is None
    assert conn.user_update_count == 0
