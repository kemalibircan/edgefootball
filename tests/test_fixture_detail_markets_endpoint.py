from app.config import Settings
import app.fixture_board as fixture_board
import app.main as main


def _sample_payload() -> dict:
    return {
        "data": {
            "id": 555,
            "participants": [
                {"id": 1, "name": "Home FC", "meta": {"location": "home"}},
                {"id": 2, "name": "Away FC", "meta": {"location": "away"}},
            ],
            "odds": [
                {"market_description": "Match Winner", "label": "Home", "value": "2.10"},
                {"market_description": "Match Winner", "label": "Home", "value": "2.35"},
                {"market_description": "Match Winner", "label": "Draw", "value": "3.20"},
                {"market_description": "Match Winner", "label": "Away", "value": "3.90"},
                {"market_description": "1st Half Result", "label": "Home", "value": "2.30"},
                {"market_description": "1st Half Result", "label": "Home", "value": "2.05"},
                {"market_description": "1st Half Result", "label": "Draw", "value": "1.80"},
                {"market_description": "1st Half Result", "label": "Away", "value": "5.00"},
            ],
        }
    }


def test_extract_fixture_markets_from_payload_uses_max_policy():
    parsed = fixture_board.extract_fixture_markets_from_payload(_sample_payload(), odds_policy="max")
    markets = parsed["markets"]

    assert markets["match_result"]["1"] == 2.35
    assert markets["match_result"]["0"] == 3.2
    assert markets["match_result"]["2"] == 3.9
    assert markets["first_half"]["1"] == 2.3
    assert markets["first_half"]["0"] == 1.8
    assert markets["first_half"]["2"] == 5.0
    assert parsed["odds_row_count"] == 8


def test_fixtures_public_markets_returns_meta_source_and_policy(monkeypatch):
    monkeypatch.setattr(
        main,
        "_load_fixture_payload_for_markets",
        lambda settings, fixture_id: (_sample_payload(), "raw_fixtures"),
    )
    settings = Settings(dummy_mode=True, sportmonks_api_token=None)

    payload = main.fixtures_public_markets(fixture_id=555, settings=settings)

    assert payload["fixture_id"] == 555
    assert payload["meta"]["source"] == "raw_fixtures"
    assert payload["meta"]["odds_policy"] == "max"
    assert payload["markets"]["match_result"]["1"] == 2.35
    assert payload["markets"]["first_half"]["2"] == 5.0


def test_load_fixture_payload_for_markets_falls_back_to_provider(monkeypatch):
    class _RowsResult:
        def mappings(self):
            return self

        def first(self):
            return None

    class _Connection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, statement, params=None):
            return _RowsResult()

    class _Engine:
        def connect(self):
            return _Connection()

    class _FixtureResponse:
        def model_dump(self, mode="json"):
            return {
                "data": {
                    "id": 77,
                    "participants": [
                        {"id": 1, "name": "H", "meta": {"location": "home"}},
                        {"id": 2, "name": "A", "meta": {"location": "away"}},
                    ],
                    "odds": [],
                }
            }

    class _FakeClient:
        def __init__(self, **kwargs):
            pass

        def get_fixture(self, fixture_id, includes=None):
            assert fixture_id == 77
            return _FixtureResponse()

    monkeypatch.setattr(main, "create_engine", lambda db_url: _Engine())
    monkeypatch.setattr(main, "SportMonksClient", _FakeClient)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None)
    payload, source = main._load_fixture_payload_for_markets(settings, fixture_id=77)

    assert source == "sportmonks"
    assert payload["data"]["id"] == 77
