from app.config import Settings
import modeling.simulate as sim
from sportmonks_client.models import FixturePayload


class _FakeModel:
    def predict(self, X):
        return [1.25]


class _FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    def get_fixture(self, fixture_id):
        return FixturePayload.model_validate(
            {
                "data": {
                    "id": fixture_id,
                    "league_id": 600,
                    "starting_at": "2026-02-13T17:00:00Z",
                    "participants": [
                        {"id": 11, "name": "Home FC", "meta": {"location": "home"}},
                        {"id": 12, "name": "Away FC", "meta": {"location": "away"}},
                    ],
                    "statistics": [],
                }
            }
        )



def test_simulate_fixture_uses_league_routing(monkeypatch):
    captured = {}

    monkeypatch.setattr(sim, "SportMonksClient", _FakeClient)
    monkeypatch.setattr(
        sim,
        "resolve_model_for_league",
        lambda settings, league_id, requested_model_id=None, routing_key=None: {
            "model_id": "system-600",
            "model_name": "System Super Lig 1000",
            "model_version": "v1",
            "trained_at": "2026-02-13T00:00:00+00:00",
            "selection_mode": "league_default",
        },
    )

    def _load(model_id=None):
        captured["model_id"] = model_id
        return (
            _FakeModel(),
            _FakeModel(),
            {
                "model_id": "system-600",
                "model_name": "System Super Lig 1000",
                "feature_columns": sim.FEATURE_COLUMNS,
                "lambda_calibration": {"home_scale": 1.0, "away_scale": 1.0},
            },
        )

    monkeypatch.setattr(sim, "load_models", _load)

    def _inject(features, payload, settings):
        for col in sim.FEATURE_COLUMNS:
            features.setdefault(col, 0.0)
        return False

    monkeypatch.setattr(sim, "_inject_historical_form", _inject)

    result = sim.simulate_fixture(777, settings=Settings(dummy_mode=True, sportmonks_api_token=None), model_id=None)

    assert captured["model_id"] == "system-600"
    assert result["model"]["model_id"] == "system-600"
    assert result["model"]["selection_mode"] == "league_default"
