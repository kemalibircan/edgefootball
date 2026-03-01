import asyncio
from datetime import date

import app.main as main
from app.admin import SHOWCASE_SECTION_POPULAR_ODDS
from app.auth import AuthUser
from app.config import Settings


def _admin_user() -> AuthUser:
    return AuthUser(
        id=42,
        username="admin",
        role="admin",
        credits=100,
        is_active=True,
    )


def test_daily_highlights_persists_showcase_popular_odds(monkeypatch):
    captured = {}

    def _fake_get_fixtures_paged(**kwargs):
        return {
            "items": [
                {
                    "fixture_id": 1001,
                    "home_team_name": "Home A",
                    "away_team_name": "Away A",
                    "home_team_logo": "https://example.com/home-a.png",
                    "away_team_logo": "https://example.com/away-a.png",
                    "league_name": "League A",
                    "starting_at": "2026-02-21T17:00:00+00:00",
                    "markets": {"match_result": {"1": 1.91, "0": 3.32, "2": 4.20}},
                },
                {
                    "fixture_id": 1002,
                    "home_team_name": "Home B",
                    "away_team_name": "Away B",
                    "league_name": "League B",
                    "starting_at": "2026-02-21T19:00:00+00:00",
                    "markets": {"match_result": {"home": 2.10, "draw": 3.05, "away": 3.11}},
                },
            ]
        }

    def _fake_replace_showcase_section_rows(settings, section_key, rows, actor_user_id):
        captured["section_key"] = section_key
        captured["rows"] = list(rows)
        captured["actor_user_id"] = actor_user_id
        return len(rows)

    monkeypatch.setattr(main, "get_fixtures_paged", _fake_get_fixtures_paged)
    monkeypatch.setattr(main, "replace_showcase_section_rows", _fake_replace_showcase_section_rows)

    payload = asyncio.run(
        main.generate_daily_highlights_endpoint(
            target_date=date(2026, 2, 21),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=_admin_user(),
        )
    )

    assert payload["success"] is True
    assert payload["highlights_count"] == 2
    assert captured["section_key"] == SHOWCASE_SECTION_POPULAR_ODDS
    assert captured["actor_user_id"] == 42
    assert len(captured["rows"]) == 2
    assert captured["rows"][0]["odd_home"] == 1.91
    assert captured["rows"][0]["odd_draw"] == 3.32
    assert captured["rows"][0]["odd_away"] == 4.20
    assert captured["rows"][1]["odd_home"] == 2.10
    assert captured["rows"][1]["odd_draw"] == 3.05
    assert captured["rows"][1]["odd_away"] == 3.11


def test_daily_highlights_skips_invalid_odds_and_caps_at_four(monkeypatch):
    captured = {}

    def _fixture(fid, odd_home, odd_draw, odd_away):
        return {
            "fixture_id": fid,
            "home_team_name": f"Home {fid}",
            "away_team_name": f"Away {fid}",
            "league_name": "League",
            "starting_at": "2026-02-21T17:00:00+00:00",
            "markets": {"match_result": {"1": odd_home, "0": odd_draw, "2": odd_away}},
        }

    def _fake_get_fixtures_paged(**kwargs):
        return {
            "items": [
                _fixture(2001, 1.80, 3.30, 4.60),
                _fixture(2002, 1.90, 3.40, 4.30),
                _fixture(2003, 2.00, 3.20, 3.90),
                _fixture(2004, 2.10, 3.10, 3.50),
                _fixture(2005, 2.20, 3.00, 3.20),
                _fixture(2006, 1.00, 3.00, 2.90),  # invalid home odd
            ]
        }

    def _fake_replace_showcase_section_rows(settings, section_key, rows, actor_user_id):
        captured["rows"] = list(rows)
        return len(rows)

    monkeypatch.setattr(main, "get_fixtures_paged", _fake_get_fixtures_paged)
    monkeypatch.setattr(main, "replace_showcase_section_rows", _fake_replace_showcase_section_rows)

    payload = asyncio.run(
        main.generate_daily_highlights_endpoint(
            target_date=date(2026, 2, 21),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=_admin_user(),
        )
    )

    assert payload["success"] is True
    assert payload["highlights_count"] == 4
    assert len(payload["fixtures"]) == 4
    assert len(captured["rows"]) == 4
    assert [row["fixture_id"] for row in captured["rows"]] == [2001, 2002, 2003, 2004]
