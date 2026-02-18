from types import SimpleNamespace

import app.admin as admin
from app.auth import AuthUser
from app.config import Settings


def test_enqueue_models_reset_and_reseed_pro(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="reset-reseed-task-1")

    monkeypatch.setattr(admin, "models_reset_and_reseed_pro_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(admin, "parse_league_model_ids", lambda settings: [600, 564, 8, 384, 2, 5])
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

    payload = admin.enqueue_models_reset_and_reseed_pro(
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(
            id=1,
            username="super",
            role="superadmin",
            credits=100,
            is_active=True,
            advanced_mode_enabled=True,
        ),
    )

    assert payload.task_id == "reset-reseed-task-1"
    assert captured["args"][0] == "manual"
    assert captured["args"][1] == 1
    assert captured["args"][2] == [600, 564, 8, 384, 2, 5]


def test_enqueue_models_reset_and_reseed_requires_superadmin():
    try:
        admin.enqueue_models_reset_and_reseed_pro(
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(
                id=2,
                username="admin",
                role="admin",
                credits=100,
                is_active=True,
                advanced_mode_enabled=True,
            ),
        )
        assert False, "Expected HTTPException for non-superadmin"
    except admin.HTTPException as exc:
        assert int(exc.status_code) == 403


def test_enqueue_models_reset_and_reseed_requires_advanced_mode():
    try:
        admin.enqueue_models_reset_and_reseed_pro(
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(
                id=3,
                username="super",
                role="superadmin",
                credits=100,
                is_active=True,
                advanced_mode_enabled=False,
            ),
        )
        assert False, "Expected HTTPException when advanced mode is disabled"
    except admin.HTTPException as exc:
        assert int(exc.status_code) == 403
        assert "advanced mode" in str(exc.detail).lower()
