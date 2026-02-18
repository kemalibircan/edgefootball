from datetime import datetime, timezone

from app.fixture_board import _build_fixture_board_row


def _sample_fixture_payload() -> dict:
    return {
        "id": 99001,
        "league_id": 600,
        "starting_at": "2026-02-20T20:00:00Z",
        "participants": [
            {"id": 11, "name": "Home Team", "meta": {"location": "home"}, "image_path": "home-logo.png"},
            {"id": 22, "name": "Away Team", "meta": {"location": "away"}, "image_path": "away-logo.png"},
        ],
        "state": {"name": "NS"},
        "odds": [
            {"market_description": "Match Winner", "label": "1", "value": 1.90},
            {"market_description": "Match Winner", "label": "0", "value": 3.25},
            {"market_description": "Match Winner", "label": "2", "value": 3.80},
            {"market_description": "1st Half Result", "label": "1", "value": 2.40},
            {"market_description": "1st Half Result", "label": "0", "value": 2.05},
            {"market_description": "1st Half Result", "label": "2", "value": 4.20},
            {"market_description": "Handicap Result", "line": "1:0", "label": "1", "value": 2.10},
            {"market_description": "Handicap Result", "line": "1:0", "label": "0", "value": 3.30},
            {"market_description": "Handicap Result", "line": "1:0", "label": "2", "value": 2.95},
            {"market_description": "Total Goals Over/Under", "line": "2.5", "label": "Alt 2.5", "value": 1.82},
            {"market_description": "Total Goals Over/Under", "line": "2.5", "label": "Ust 2.5", "value": 1.96},
            {"market_description": "Both Teams To Score", "label": "Var", "value": 1.88},
            {"market_description": "Both Teams To Score", "label": "Yok", "value": 1.92},
            {"market_description": "Double Chance", "label": "1X", "value": 1.32},
        ],
    }


def test_build_fixture_board_row_parses_five_markets():
    refreshed_at = datetime.now(timezone.utc)
    row = _build_fixture_board_row(_sample_fixture_payload(), refreshed_at=refreshed_at)

    assert row is not None
    assert row["fixture_id"] == 99001
    assert row["home_team_name"] == "Home Team"
    assert row["away_team_name"] == "Away Team"
    assert row["home_team_logo"] == "home-logo.png"
    assert row["away_team_logo"] == "away-logo.png"

    assert row["market_match_result_json"] == {"1": 1.9, "0": 3.25, "2": 3.8}
    assert row["market_first_half_json"] == {"1": 2.4, "0": 2.05, "2": 4.2}
    assert row["market_handicap_json"]["line"] == "1:0"
    assert row["market_handicap_json"]["1"] == 2.1
    assert row["market_handicap_json"]["0"] == 3.3
    assert row["market_handicap_json"]["2"] == 2.95
    assert row["market_over_under_25_json"]["line"] == "2.5"
    assert row["market_over_under_25_json"]["under"] == 1.82
    assert row["market_over_under_25_json"]["over"] == 1.96
    assert row["market_btts_json"]["yes"] == 1.88
    assert row["market_btts_json"]["no"] == 1.92
    assert row["extra_market_count"] >= 1


def test_build_fixture_board_row_handles_missing_odds():
    payload = _sample_fixture_payload()
    payload["odds"] = []
    row = _build_fixture_board_row(payload, refreshed_at=datetime.now(timezone.utc))

    assert row is not None
    assert row["market_match_result_json"] is None
    assert row["market_first_half_json"] is None
    assert row["market_handicap_json"] is None
    assert row["market_over_under_25_json"] is None
    assert row["market_btts_json"] is None
    assert row["extra_market_count"] == 0
