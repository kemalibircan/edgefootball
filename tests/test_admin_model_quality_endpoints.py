from types import SimpleNamespace

import pytest

import app.admin as admin
from app.auth import AuthUser
from app.config import Settings


def test_enqueue_build_features_full_rebuild(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="features-full-task-1")

    monkeypatch.setattr(admin, "build_features_full_rebuild_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(task_id=task_id, state="PENDING", ready=False, successful=False, result=None, meta=None),
    )

    payload = admin.enqueue_build_features_full_rebuild(
        current_user=AuthUser(id=1, username="manager", role="admin", credits=10, is_active=True),
    )

    assert payload.task_id == "features-full-task-1"
    assert captured["args"] == ()


def test_get_latest_model_backtest(monkeypatch):
    monkeypatch.setattr(
        admin,
        "load_latest_backtest",
        lambda settings, league_id=None: {"model_id": "m1", "league_id": league_id, "log_loss": 0.91},
    )

    payload = admin.get_latest_model_backtest(
        league_id=600,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=2, username="manager", role="admin", credits=10, is_active=True),
    )

    assert payload["model_id"] == "m1"
    assert payload["league_id"] == 600


def test_get_latest_model_backtest_404(monkeypatch):
    monkeypatch.setattr(admin, "load_latest_backtest", lambda settings, league_id=None: None)

    with pytest.raises(admin.HTTPException):
        admin.get_latest_model_backtest(
            league_id=600,
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(id=2, username="manager", role="admin", credits=10, is_active=True),
        )
