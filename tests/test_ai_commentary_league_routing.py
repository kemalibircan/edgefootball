import app.main as main
from app.auth import AuthUser
from app.config import Settings



def test_ai_commentary_uses_league_routed_simulation(monkeypatch):
    captured = {}

    def _simulate_fixture(fixture_id, settings, model_id=None):
        captured["model_id"] = model_id
        return {
            "model": {
                "model_id": "system-384",
                "model_name": "System Serie A 1000",
                "selection_mode": "league_default",
            },
            "outcomes": {"home_win": 0.41, "draw": 0.27, "away_win": 0.32},
            "lambda_home": 1.22,
            "lambda_away": 1.11,
            "top_scorelines": [{"score": "1-1", "probability": 0.12}],
        }

    monkeypatch.setattr(main, "simulate_fixture", _simulate_fixture)
    monkeypatch.setattr(
        main,
        "generate_match_commentary",
        lambda **kwargs: {
            "commentary": "ok",
            "provider": "openai",
            "model": "gpt-5",
            "provider_error": None,
            "odds_summary": {},
            "web_news": [],
            "analysis_table": [],
        },
    )
    monkeypatch.setattr(main, "consume_ai_credits", lambda settings, user_id, reason: 77)

    payload = main.ai_commentary(
        request=main.CommentaryRequest(fixture_id=1234, model_id=None, language="tr"),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=4, username="u", role="user", credits=100, is_active=True),
    )

    assert captured["model_id"] is None
    assert payload["model"]["model_id"] == "system-384"
    assert payload["model"]["selection_mode"] == "league_default"
