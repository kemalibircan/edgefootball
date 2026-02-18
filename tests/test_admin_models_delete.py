import app.admin as admin
from app.auth import AuthUser
from app.config import Settings


def test_delete_model_allows_owner_and_returns_next_active(monkeypatch):
    monkeypatch.setattr(
        admin,
        "get_model",
        lambda model_id: {
            "model_id": model_id,
            "model_name": "my-model",
            "created_by_user_id": 42,
            "meta": {"created_by_user_id": 42},
        },
    )
    monkeypatch.setattr(
        admin,
        "delete_registered_model",
        lambda model_id: (
            {"model_id": model_id, "model_name": "my-model"},
            {"model_id": "next-model", "model_name": "next"},
        ),
    )
    monkeypatch.setattr(admin, "load_league_default_models", lambda settings: {})

    current_user = AuthUser(
        id=42,
        username="owner",
        role="user",
        credits=100,
        is_active=True,
    )

    payload = admin.delete_model("my-model", settings=Settings(dummy_mode=True, sportmonks_api_token=None), current_user=current_user)
    assert payload["deleted_model_id"] == "my-model"
    assert payload["active_model_id"] == "next-model"


def test_delete_model_rejects_system_managed(monkeypatch):
    monkeypatch.setattr(
        admin,
        "get_model",
        lambda model_id: {
            "model_id": model_id,
            "model_name": "system-model",
            "meta": {"system_managed": True},
        },
    )
    monkeypatch.setattr(admin, "load_league_default_models", lambda settings: {})

    current_user = AuthUser(
        id=1,
        username="admin",
        role="admin",
        credits=100,
        is_active=True,
    )

    try:
        admin.delete_model("system-model", settings=Settings(dummy_mode=True, sportmonks_api_token=None), current_user=current_user)
        assert False, "system managed model should be protected"
    except admin.HTTPException as exc:
        assert exc.status_code == 400
