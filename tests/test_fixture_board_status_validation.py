from app.config import Settings
import app.fixture_board as fixture_board


def test_probe_configured_leagues_marks_unavailable_ids(monkeypatch):
    class _FakeClient:
        def get_league(self, league_id, includes=None):
            if int(league_id) == 600:
                return {"data": {"id": 600, "name": "Super Lig"}}
            if int(league_id) == 2:
                return {"data": {"name": "Champions League"}}
            return {"data": None}

    monkeypatch.setattr(fixture_board, "_build_client", lambda settings: _FakeClient())

    settings = Settings(
        dummy_mode=True,
        sportmonks_api_token=None,
        fixture_cache_league_ids="600,2,5",
    )
    payload = fixture_board.probe_configured_leagues(settings, [600, 2, 5])

    assert payload["unavailable_ids"] == [2, 5]
    assert [item["league_id"] for item in payload["items"]] == [600, 2, 5]
    assert payload["items"][0]["provider_available"] is True
    assert payload["items"][0]["provider_name"] == "Super Lig"
    assert payload["items"][1]["provider_available"] is False
    assert payload["items"][2]["provider_available"] is False


def test_get_fixture_board_page_orders_live_matches_first(monkeypatch):
    captured_sql = {}

    class _CountResult:
        def scalar_one(self):
            return 1

    class _RowsResult:
        def mappings(self):
            return self

        def all(self):
            return [
                {
                    "fixture_id": 42,
                    "league_id": 600,
                    "league_name": "Super Lig",
                    "event_date": "2026-02-20",
                    "starting_at": "2026-02-20T17:00:00+00:00",
                    "status": "1st Half",
                    "is_live": True,
                    "home_team_id": 11,
                    "away_team_id": 22,
                    "home_team_name": "Home",
                    "away_team_name": "Away",
                    "home_team_logo": None,
                    "away_team_logo": None,
                    "home_score": 1,
                    "away_score": 0,
                    "match_state": "1st Half",
                    "match_minute": 33,
                    "match_second": None,
                    "match_added_time": None,
                    "market_match_result_json": None,
                    "market_first_half_json": None,
                    "market_handicap_json": None,
                    "market_over_under_25_json": None,
                    "market_btts_json": None,
                    "extra_market_count": 0,
                    "is_featured": False,
                    "source_refreshed_at": "2026-02-20T17:00:30+00:00",
                }
            ]

    class _Connection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, statement, params=None):
            sql = str(statement)
            if "SELECT COUNT(*)" in sql:
                return _CountResult()
            captured_sql["query"] = sql
            return _RowsResult()

    class _Engine:
        def connect(self):
            return _Connection()

    monkeypatch.setattr(fixture_board, "create_engine", lambda db_url: _Engine())
    monkeypatch.setattr(fixture_board, "ensure_fixture_board_tables", lambda engine: None)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None)
    payload = fixture_board.get_fixture_board_page(settings=settings, sort="asc")

    assert payload["items"][0]["fixture_id"] == 42
    assert "ORDER BY is_live DESC, event_date ASC, starting_at ASC, fixture_id ASC" in captured_sql["query"]
