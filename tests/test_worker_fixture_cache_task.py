from datetime import date

import worker.celery_app as celery_app_module


def test_refresh_fixture_board_cache_task_forces_today_for_live_window(monkeypatch):
    captured = {}

    monkeypatch.setattr(
        celery_app_module,
        "refresh_fixture_board_cache",
        lambda **kwargs: captured.update(kwargs) or {"ok": True},
    )
    monkeypatch.setattr(celery_app_module.refresh_fixture_board_cache_task, "update_state", lambda *args, **kwargs: None)

    payload = celery_app_module.refresh_fixture_board_cache_task.run(
        trigger_type="scheduled_live_window",
        requested_by=5,
        date_from="2026-02-01",
        date_to="2026-02-02",
        league_ids=[600, 2],
    )

    assert payload["ok"] is True
    assert captured["date_from"] == captured["date_to"]
    assert isinstance(captured["date_from"], date)
    assert captured["date_from"] != date(2026, 2, 1)
    assert captured["trigger_type"] == "scheduled_live_window"


def test_refresh_fixture_board_cache_task_keeps_explicit_window_for_manual(monkeypatch):
    captured = {}

    monkeypatch.setattr(
        celery_app_module,
        "refresh_fixture_board_cache",
        lambda **kwargs: captured.update(kwargs) or {"ok": True},
    )
    monkeypatch.setattr(celery_app_module.refresh_fixture_board_cache_task, "update_state", lambda *args, **kwargs: None)

    payload = celery_app_module.refresh_fixture_board_cache_task.run(
        trigger_type="manual",
        requested_by=9,
        date_from="2026-02-10",
        date_to="2026-02-12",
        league_ids=[600],
    )

    assert payload["ok"] is True
    assert captured["date_from"] == date(2026, 2, 10)
    assert captured["date_to"] == date(2026, 2, 12)
    assert captured["trigger_type"] == "manual"


def test_worker_schedule_contains_live_window_refresh():
    schedule = celery_app_module.celery_app.conf.beat_schedule
    live_refresh = schedule.get("refresh-fixture-board-cache-live-window")

    assert isinstance(live_refresh, dict)
    assert live_refresh["task"] == "worker.celery_app.refresh_fixture_board_cache_task"
    assert live_refresh["kwargs"]["trigger_type"] == "scheduled_live_window"
