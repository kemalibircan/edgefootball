from types import SimpleNamespace

import app.admin as admin
from app.auth import AuthUser
from app.config import Settings


def test_enqueue_train_returns_taskinfo_with_credits_remaining(monkeypatch):
    monkeypatch.setattr(
        admin,
        "consume_ai_credits",
        lambda settings, user_id, reason: 95,
    )
    monkeypatch.setattr(
        admin,
        "train_models_task",
        SimpleNamespace(delay=lambda *args, **kwargs: SimpleNamespace(id="train-task-1")),
    )
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(
            task_id=task_id,
            state="PENDING",
            ready=False,
            successful=False,
            result=None,
            meta=None,
        ),
    )

    request = admin.TrainRequest(
        limit=100,
        league_id=600,
        model_name="test-model",
        description="test description",
        data_sources=["team_form"],
        set_active=True,
    )
    current_user = AuthUser(
        id=42,
        username="tester",
        role="user",
        credits=100,
        is_active=True,
        advanced_mode_enabled=True,
    )
    settings = Settings(dummy_mode=True, sportmonks_api_token=None)

    payload = admin.enqueue_train(
        request=request,
        settings=settings,
        current_user=current_user,
    )

    assert isinstance(payload, admin.TaskInfo)
    assert payload.task_id == "train-task-1"
    assert payload.credits_remaining == 95


def test_enqueue_train_overrides_user_sources_with_pro_preset(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="train-task-pro-sources")

    monkeypatch.setattr(admin, "consume_ai_credits", lambda settings, user_id, reason: 91)
    monkeypatch.setattr(admin, "train_models_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(
            task_id=task_id,
            state="PENDING",
            ready=False,
            successful=False,
            result=None,
            meta=None,
        ),
    )

    request = admin.TrainRequest(
        limit=120,
        league_id=600,
        model_name="pro-source-override",
        data_sources=["team_info", "live_match_stats"],
    )
    current_user = AuthUser(
        id=43,
        username="advanced-user",
        role="user",
        credits=100,
        is_active=True,
        advanced_mode_enabled=True,
    )
    settings = Settings(
        dummy_mode=True,
        sportmonks_api_token=None,
        pro_training_data_sources="team_form,elo,injuries,lineup_strength,weather,referee,market_odds",
    )

    admin.enqueue_train(request=request, settings=settings, current_user=current_user)

    args = captured["args"]
    assert args[3] == ["team_form", "elo", "injuries", "lineup_strength", "weather", "referee", "market_odds"]


def test_enqueue_train_keeps_standard_mode_on_existing_data(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="train-task-standard")

    monkeypatch.setattr(admin, "consume_ai_credits", lambda settings, user_id, reason: 90)
    monkeypatch.setattr(admin, "train_models_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(
            task_id=task_id,
            state="PENDING",
            ready=False,
            successful=False,
            result=None,
            meta=None,
        ),
    )

    request = admin.TrainRequest(
        limit=200,
        league_id=600,
        model_name="standard-refresh-model",
        training_mode="standard",
    )
    current_user = AuthUser(
        id=5,
        username="standard-user",
        role="admin",
        credits=120,
        is_active=True,
        advanced_mode_enabled=True,
    )
    settings = Settings(dummy_mode=True, sportmonks_api_token=None)

    admin.enqueue_train(request=request, settings=settings, current_user=current_user)

    args = captured["args"]
    assert args[13] == "none"


def test_enqueue_train_uses_incremental_refresh_for_latest_mode(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="train-task-latest")

    monkeypatch.setattr(admin, "consume_ai_credits", lambda settings, user_id, reason: 90)
    monkeypatch.setattr(admin, "train_models_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(
            task_id=task_id,
            state="PENDING",
            ready=False,
            successful=False,
            result=None,
            meta=None,
        ),
    )

    request = admin.TrainRequest(
        limit=200,
        league_id=600,
        model_name="latest-refresh-model",
        training_mode="latest",
    )
    current_user = AuthUser(
        id=6,
        username="latest-user",
        role="admin",
        credits=120,
        is_active=True,
        advanced_mode_enabled=True,
    )
    settings = Settings(dummy_mode=True, sportmonks_api_token=None)

    admin.enqueue_train(request=request, settings=settings, current_user=current_user)

    args = captured["args"]
    assert args[13] == "incremental"


def test_enqueue_train_keeps_date_range_refresh_mode(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="train-task-range")

    monkeypatch.setattr(admin, "consume_ai_credits", lambda settings, user_id, reason: 88)
    monkeypatch.setattr(admin, "train_models_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(
            task_id=task_id,
            state="PENDING",
            ready=False,
            successful=False,
            result=None,
            meta=None,
        ),
    )

    request = admin.TrainRequest(
        limit=150,
        league_id=600,
        model_name="range-model",
        training_mode="date_range",
        date_from=admin.date(2026, 2, 1),
        date_to=admin.date(2026, 2, 10),
    )
    current_user = AuthUser(
        id=8,
        username="range-user",
        role="admin",
        credits=100,
        is_active=True,
        advanced_mode_enabled=True,
    )
    settings = Settings(dummy_mode=True, sportmonks_api_token=None)

    admin.enqueue_train(request=request, settings=settings, current_user=current_user)

    args = captured["args"]
    assert args[0] is None
    assert args[13] == "date_range"
    assert args[14] == "2026-02-01"
    assert args[15] == "2026-02-10"


def test_enqueue_train_rejects_non_advanced_user(monkeypatch):
    consumed = {"called": False}

    def _consume(*args, **kwargs):
        consumed["called"] = True
        return 0

    monkeypatch.setattr(admin, "consume_ai_credits", _consume)
    monkeypatch.setattr(
        admin,
        "train_models_task",
        SimpleNamespace(delay=lambda *args, **kwargs: SimpleNamespace(id="should-not-run")),
    )

    request = admin.TrainRequest(limit=100, league_id=600, model_name="no-advanced")
    current_user = AuthUser(
        id=50,
        username="basic-user",
        role="user",
        credits=200,
        is_active=True,
        advanced_mode_enabled=False,
    )
    settings = Settings(
        dummy_mode=True,
        sportmonks_api_token=None,
        model_training_requires_advanced_mode=True,
    )

    try:
        admin.enqueue_train(request=request, settings=settings, current_user=current_user)
        assert False, "Expected HTTPException for non-advanced user"
    except admin.HTTPException as exc:
        assert int(exc.status_code) == 402
        assert "advanced mode" in str(exc.detail).lower()

    assert consumed["called"] is False
