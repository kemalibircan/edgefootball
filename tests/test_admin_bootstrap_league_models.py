from types import SimpleNamespace

import app.admin as admin
from app.auth import AuthUser
from app.config import Settings



def test_enqueue_bootstrap_league_models(monkeypatch):
    captured = {}

    def _delay(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(id="bootstrap-task-1")

    monkeypatch.setattr(admin, "bootstrap_league_models_task", SimpleNamespace(delay=_delay))
    monkeypatch.setattr(
        admin,
        "_task_info",
        lambda task_id: admin.TaskInfo(task_id=task_id, state="PENDING", ready=False, successful=False, result=None, meta=None),
    )

    request = admin.BootstrapLeagueModelsRequest(league_ids=[600, 564, 8, 384])
    current_user = AuthUser(id=99, username="manager", role="admin", credits=100, is_active=True)

    payload = admin.enqueue_bootstrap_league_models(request=request, current_user=current_user)

    assert payload.task_id == "bootstrap-task-1"
    assert captured["args"][0] == "manual"
    assert captured["args"][1] == 99
    assert captured["args"][2] == [600, 564, 8, 384]



def test_get_league_models_status_endpoint(monkeypatch):
    monkeypatch.setattr(
        admin,
        "get_league_model_status",
        lambda settings: {
            "league_ids": [600, 564],
            "items": [{"league_id": 600, "status": "ready"}],
        },
    )

    payload = admin.get_league_models_status(
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=7, username="admin", role="admin", credits=100, is_active=True),
    )

    assert payload["league_ids"] == [600, 564]
    assert payload["items"][0]["status"] == "ready"
