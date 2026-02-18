import app.league_model_bootstrap as bootstrap
from app.config import Settings


def test_bootstrap_uses_pro_training_sources(monkeypatch):
    captured = {}

    monkeypatch.setattr(bootstrap, "parse_league_model_ids", lambda settings, league_ids=None: [600])
    monkeypatch.setattr(bootstrap, "ingest_league_history", lambda league_id, target_count, progress_cb=None: [])
    monkeypatch.setattr(bootstrap, "build_and_persist_features", lambda progress_cb=None: 321)
    monkeypatch.setattr(bootstrap, "mark_model_as_system_managed", lambda model_id, league_id=None: True)
    monkeypatch.setattr(
        bootstrap,
        "_persist_league_default_with_retention",
        lambda *args, **kwargs: str(kwargs.get("model_id") or ""),
    )
    monkeypatch.setattr(bootstrap, "get_league_data_pool_status", lambda league_id, settings: {"ok": True})
    monkeypatch.setattr(
        bootstrap,
        "validate_league_default_mapping",
        lambda settings, league_ids=None: {
            "league_ids": [600],
            "missing": [],
            "unresolved": [],
            "is_complete": True,
        },
    )

    def _run_training(**kwargs):
        captured["data_sources"] = kwargs.get("data_sources")
        return {
            "model_id": "model-600",
            "trained_at": "2026-02-16T00:00:00+00:00",
            "rows_used": 1000,
        }

    monkeypatch.setattr(bootstrap, "run_training", _run_training)

    settings = Settings(
        dummy_mode=True,
        sportmonks_api_token=None,
        pro_training_data_sources="team_form,elo,market_odds",
        league_model_target_rows=1000,
        league_model_min_rows=600,
    )

    payload = bootstrap.bootstrap_league_models(
        settings=settings,
        trigger_type="manual",
        requested_by=99,
        league_ids=[600],
    )

    assert captured["data_sources"] == ["team_form", "elo", "market_odds"]
    assert payload["pro_data_sources"] == ["team_form", "elo", "market_odds"]
    assert payload["results"][0]["status"] == "ready"
