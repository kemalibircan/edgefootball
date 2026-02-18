import os

from app.config import Settings
from modeling.simulate import simulate_fixture
from sportmonks_client.models import FixturePayload


def test_simulation_dummy_mode(monkeypatch, tmp_path):
    # Ensure dummy mode to avoid API calls
    settings = Settings(dummy_mode=True, sportmonks_api_token=None, monte_carlo_runs=100)

    # Create minimal fake models to avoid joblib artifacts
    class FakeModel:
        def predict(self, X):
            return [1.2]


    # Monkeypatch load_models to return fake models
    import modeling.simulate as sim

    monkeypatch.setattr(
        sim,
        "load_models",
        lambda model_id=None: (
            FakeModel(),
            FakeModel(),
            {
                "model_id": "test-model",
                "model_name": "Test Model",
                "feature_columns": sim.FEATURE_COLUMNS,
            },
        ),
    )
    monkeypatch.setattr(
        sim,
        "resolve_model_for_league",
        lambda settings, league_id, requested_model_id=None, routing_key=None: {
            "model_id": "test-model",
            "model_name": "Test Model",
            "model_version": "v1",
            "trained_at": None,
            "selection_mode": "explicit",
        },
    )

    result = simulate_fixture(fixture_id=123, settings=settings)
    assert "outcomes" in result
    assert "top_scorelines" in result
    assert result["model"]["model_id"] == "test-model"
    assert len(result["top_scorelines"]) > 0
    assert abs(result["outcomes"]["home_win"] + result["outcomes"]["draw"] + result["outcomes"]["away_win"] - 1) < 1e-6
    assert "calibration" in result
    assert "odds_blend" in result
    assert "quality_flags" in result
    assert "used_global_fallback" in result["quality_flags"]


def _build_fixture_payload(lineups):
    return FixturePayload.model_validate(
        {
            "data": {
                "id": 12345,
                "starting_at": "2026-02-10T18:00:00Z",
                "participants": [
                    {"id": 1, "name": "Home FC", "meta": {"location": "home"}},
                    {"id": 2, "name": "Away FC", "meta": {"location": "away"}},
                ],
                "lineups": lineups,
            }
        }
    )


def test_goal_scorer_probabilities_uses_nested_player_names():
    import modeling.simulate as sim

    payload = _build_fixture_payload(
        [
            {
                "team_id": 1,
                "player_id": 101,
                "player": {"data": {"id": 101, "firstname": "Kerem", "lastname": "Kaya"}},
                "formation_position": 9,
                "jersey_number": 9,
                "type_id": 11,
            },
            {
                "team_id": 1,
                "player_id": 102,
                "player_name": "Mert Demir",
                "formation_position": 10,
                "jersey_number": 10,
                "type_id": 11,
            },
        ]
    )

    rows = sim.goal_scorer_probabilities(payload, team_id=1, lambda_team=1.6, top_n=5)
    names = {row["player_name"] for row in rows}

    assert "Kerem Kaya" in names
    assert "Mert Demir" in names


def test_goal_scorer_probabilities_replaces_numeric_names():
    import modeling.simulate as sim

    payload = _build_fixture_payload(
        [
            {
                "team_id": 1,
                "player_id": 777,
                "player_name": "777",
                "formation_position": 9,
                "jersey_number": 9,
                "type_id": 11,
            }
        ]
    )

    rows = sim.goal_scorer_probabilities(payload, team_id=1, lambda_team=1.2, top_n=5)
    assert rows
    assert rows[0]["player_name"] == "Oyuncu 777"
