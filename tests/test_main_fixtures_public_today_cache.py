from datetime import date

import app.main as main
from app.config import Settings


def test_fixtures_public_today_uses_cached_paged_source(monkeypatch):
    captured = {}

    def fake_get_fixtures_paged(**kwargs):
        captured.update(kwargs)
        return {
            "page": 1,
            "page_size": 12,
            "total": 1,
            "total_pages": 1,
            "items": [
                {
                    "fixture_id": 9001,
                    "league_id": 600,
                    "starting_at": "2026-02-13T17:00:00+00:00",
                    "home_team_name": "Home",
                    "away_team_name": "Away",
                }
            ],
        }

    monkeypatch.setattr(main, "get_fixtures_paged", fake_get_fixtures_paged)
    settings = Settings(dummy_mode=True, sportmonks_api_token=None)

    payload = main.fixtures_public_today(
        page=1,
        page_size=12,
        league_id=600,
        q=None,
        sort="asc",
        day=date(2026, 2, 13),
        settings=settings,
    )

    assert payload["day"] == "2026-02-13"
    assert payload["items"][0]["fixture_id"] == 9001
    assert captured["upcoming_only"] is False
