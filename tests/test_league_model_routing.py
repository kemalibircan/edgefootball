from app.config import Settings
import app.league_model_routing as routing



def _model(model_id: str, *, league_id=None, scope="ready", system_managed=False) -> dict:
    meta = {"league_id": league_id} if league_id is not None else {}
    if system_managed:
        meta["system_managed"] = True
        if league_id is not None:
            meta["system_league_id"] = league_id
    return {
        "model_id": model_id,
        "model_name": f"Model {model_id}",
        "version": "v1",
        "trained_at": "2026-02-13T00:00:00+00:00",
        "artifact_dir": "/tmp/artifacts",
        "model_scope": scope,
        "meta": meta,
    }


def test_resolve_model_for_league_prefers_explicit(monkeypatch):
    monkeypatch.setattr(routing, "get_model", lambda model_id: _model(model_id, league_id=600))

    resolved = routing.resolve_model_for_league(
        Settings(dummy_mode=True, sportmonks_api_token=None),
        league_id=600,
        requested_model_id="explicit-1",
    )

    assert resolved["model_id"] == "explicit-1"
    assert resolved["selection_mode"] == "explicit"



def test_resolve_model_for_league_uses_default_mapping(monkeypatch):
    monkeypatch.setattr(routing, "get_league_default_model", lambda settings, league_id: {"model_id": "league-default-600"})
    monkeypatch.setattr(routing, "get_model", lambda model_id: _model(model_id, league_id=600))

    resolved = routing.resolve_model_for_league(
        Settings(dummy_mode=True, sportmonks_api_token=None),
        league_id=600,
        requested_model_id=None,
    )

    assert resolved["model_id"] == "league-default-600"
    assert resolved["selection_mode"] == "league_default"



def test_resolve_model_for_league_uses_latest_ready_same_league(monkeypatch):
    monkeypatch.setattr(routing, "get_league_default_model", lambda settings, league_id: None)
    monkeypatch.setattr(routing, "get_model", lambda model_id: None)
    monkeypatch.setattr(
        routing,
        "list_models",
        lambda limit=5000: [
            _model("m-564", league_id=564, scope="ready"),
            _model("m-600", league_id=600, scope="ready"),
        ],
    )

    resolved = routing.resolve_model_for_league(
        Settings(dummy_mode=True, sportmonks_api_token=None),
        league_id=600,
        requested_model_id=None,
    )

    assert resolved["model_id"] == "m-600"
    assert resolved["selection_mode"] == "league_ready_latest"


def test_resolve_model_for_league_prefers_system_managed_ready_model(monkeypatch):
    monkeypatch.setattr(routing, "get_league_default_model", lambda settings, league_id: None)
    monkeypatch.setattr(routing, "get_model", lambda model_id: None)
    monkeypatch.setattr(
        routing,
        "list_models",
        lambda limit=5000: [
            _model("m-600-user", league_id=600, scope="ready"),
            _model("m-600-system", league_id=600, scope="ready", system_managed=True),
            _model("m-564-system", league_id=564, scope="ready", system_managed=True),
        ],
    )

    resolved = routing.resolve_model_for_league(
        Settings(dummy_mode=True, sportmonks_api_token=None),
        league_id=600,
        requested_model_id=None,
    )

    assert resolved["model_id"] == "m-600-system"
    assert resolved["selection_mode"] == "league_ready_latest"



def test_resolve_model_for_league_uses_global_fallback(monkeypatch):
    monkeypatch.setattr(routing, "get_league_default_model", lambda settings, league_id: None)
    monkeypatch.setattr(routing, "list_models", lambda limit=5000: [])
    monkeypatch.setattr(routing, "get_active_model", lambda: _model("active-model", league_id=600))

    resolved = routing.resolve_model_for_league(
        Settings(
            dummy_mode=True,
            sportmonks_api_token=None,
            strict_league_model_routing=False,
            allow_global_fallback_model=True,
        ),
        league_id=8,
        requested_model_id=None,
    )

    assert resolved["model_id"] == "active-model"
    assert resolved["selection_mode"] == "global_fallback"


def test_resolve_model_for_league_blocks_global_fallback_when_strict(monkeypatch):
    monkeypatch.setattr(routing, "get_league_default_model", lambda settings, league_id: None)
    monkeypatch.setattr(routing, "list_models", lambda limit=5000: [])
    monkeypatch.setattr(routing, "get_active_model", lambda: _model("active-model", league_id=600))

    import pytest

    with pytest.raises(FileNotFoundError):
        routing.resolve_model_for_league(
            Settings(dummy_mode=True, sportmonks_api_token=None, strict_league_model_routing=True),
            league_id=8,
            requested_model_id=None,
        )


def test_resolve_model_for_league_uses_rollback_override(monkeypatch):
    monkeypatch.setattr(
        routing,
        "_get_league_rollout_policy",
        lambda settings, league_id: {"rollback_model_id": "rollback-600"},
    )
    monkeypatch.setattr(routing, "get_model", lambda model_id: _model(model_id, league_id=600))

    resolved = routing.resolve_model_for_league(
        Settings(dummy_mode=True, sportmonks_api_token=None),
        league_id=600,
    )

    assert resolved["model_id"] == "rollback-600"
    assert resolved["selection_mode"] == "league_rollback"


def test_resolve_model_for_league_uses_shadow_rollout(monkeypatch):
    monkeypatch.setattr(
        routing,
        "_get_league_rollout_policy",
        lambda settings, league_id: {
            "shadow_enabled": True,
            "shadow_model_id": "shadow-600",
            "rollout_percent": 100,
            "rollback_model_id": None,
        },
    )
    monkeypatch.setattr(routing, "get_model", lambda model_id: _model(model_id, league_id=600))

    resolved = routing.resolve_model_for_league(
        Settings(dummy_mode=True, sportmonks_api_token=None),
        league_id=600,
        routing_key=777,
    )

    assert resolved["model_id"] == "shadow-600"
    assert resolved["selection_mode"] == "shadow_rollout"
