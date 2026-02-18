from datetime import date
from types import SimpleNamespace

import pytest

import app.admin as admin
from app.auth import AuthUser
from app.config import Settings


def test_enqueue_fixtures_cache_refresh_queues_task(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="fixtures-cache-task-1")

    monkeypatch.setattr(admin, "refresh_fixture_board_cache_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(task_id=task_id, state="PENDING", ready=False, successful=False, result=None, meta=None),
    )

    request = admin.FixturesCacheRefreshRequest(
        date_from=date(2026, 2, 13),
        date_to=date(2026, 2, 20),
        league_ids=[600, 564],
    )
    current_user = AuthUser(id=9, username="manager", role="admin", credits=100, is_active=True)

    payload = admin.enqueue_fixtures_cache_refresh(request=request, current_user=current_user)

    assert payload.task_id == "fixtures-cache-task-1"
    assert captured["args"][0] == "manual"
    assert captured["args"][1] == 9
    assert captured["args"][2] == "2026-02-13"
    assert captured["args"][3] == "2026-02-20"
    assert captured["args"][4] == [600, 564]


def test_enqueue_fixtures_cache_refresh_rejects_invalid_range():
    request = admin.FixturesCacheRefreshRequest(
        date_from=date(2026, 2, 20),
        date_to=date(2026, 2, 13),
    )
    current_user = AuthUser(id=9, username="manager", role="admin", credits=100, is_active=True)

    with pytest.raises(admin.HTTPException):
        admin.enqueue_fixtures_cache_refresh(request=request, current_user=current_user)


def test_get_fixtures_cache_status_supports_provider_validation(monkeypatch):
    captured = {}

    def _status(settings, *, validate_provider=False):
        captured["validate_provider"] = validate_provider
        return {"stale": False, "provider_validation": {"items": [], "unavailable_ids": []}}

    monkeypatch.setattr(admin, "get_fixture_cache_status", _status)

    payload = admin.get_fixtures_cache_status(
        validate_provider=True,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=9, username="manager", role="admin", credits=100, is_active=True),
    )

    assert captured["validate_provider"] is True
    assert payload["stale"] is False
