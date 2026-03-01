from datetime import date, datetime, timezone

from app.config import Settings
import app.coupon_builder as builder


def _fixture_row(fixture_id: int, odd_1: float, odd_0: float, odd_2: float, league_id: int = 600) -> dict:
    return {
        "fixture_id": fixture_id,
        "league_id": league_id,
        "league_name": "League",
        "event_date": "2026-02-13",
        "starting_at": "2026-02-13T17:00:00+00:00",
        "home_team_id": fixture_id + 10,
        "away_team_id": fixture_id + 20,
        "home_team_name": f"Home {fixture_id}",
        "away_team_name": f"Away {fixture_id}",
        "home_team_logo": None,
        "away_team_logo": None,
        "market_match_result_json": {"1": odd_1, "0": odd_0, "2": odd_2},
    }


def _simulation_payload(fixture_id: int, home_win: float, draw: float, away_win: float) -> dict:
    return {
        "fixture_id": fixture_id,
        "match": {
            "home_team_id": fixture_id + 10,
            "away_team_id": fixture_id + 20,
            "home_team_name": f"Home {fixture_id}",
            "away_team_name": f"Away {fixture_id}",
            "starting_at": "2026-02-13T17:00:00+00:00",
            "league_id": 600,
        },
        "model": {"model_id": "m1"},
        "lambda_home": 1.5,
        "lambda_away": 1.1,
        "outcomes": {
            "home_win": home_win,
            "draw": draw,
            "away_win": away_win,
        },
        "top_scorelines": [{"score": "1-0", "probability": 0.11}],
        "key_drivers": ["form"],
    }


def test_generate_coupon_payload_no_duplicate_across_risk_levels(monkeypatch):
    rows = []
    for fid in (1001, 1002, 1003, 1004):
        rows.append(_fixture_row(fid, 1.40, 4.80, 7.20))
    for fid in (2001, 2002, 2003, 2004):
        rows.append(_fixture_row(fid, 2.10, 3.30, 3.40))
    for fid in (3001, 3002, 3003, 3004):
        rows.append(_fixture_row(fid, 3.20, 3.10, 2.20))

    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)

    def _simulate_fixture(fixture_id: int, settings: Settings, model_id=None):
        if fixture_id < 2000:
            return _simulation_payload(fixture_id, home_win=0.72, draw=0.18, away_win=0.10)
        if fixture_id < 3000:
            return _simulation_payload(fixture_id, home_win=0.52, draw=0.26, away_win=0.22)
        return _simulation_payload(fixture_id, home_win=0.36, draw=0.30, away_win=0.34)

    monkeypatch.setattr(builder, "simulate_fixture", _simulate_fixture)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
    )

    assert payload["simulated_count"] >= 9
    assert payload["coupons"]["low"]["unavailable"] is False
    assert payload["coupons"]["medium"]["unavailable"] is False
    assert payload["coupons"]["high"]["unavailable"] is False

    all_ids = []
    for risk_key in ("low", "medium", "high"):
        matches = payload["coupons"][risk_key]["matches"]
        assert len(matches) == 3
        all_ids.extend([item["fixture_id"] for item in matches])

    assert len(all_ids) == len(set(all_ids))


def test_generate_coupon_payload_marks_unavailable_when_candidates_missing(monkeypatch):
    rows = [_fixture_row(1001, 1.70, 4.80, 7.20), _fixture_row(1002, 1.72, 4.60, 7.10), _fixture_row(1003, 1.68, 4.90, 7.30)]
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)
    monkeypatch.setattr(
        builder,
        "simulate_fixture",
        lambda fixture_id, settings, model_id=None: _simulation_payload(fixture_id, home_win=0.70, draw=0.19, away_win=0.11),
    )

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
    )

    assert payload["coupons"]["low"]["unavailable"] is False
    assert payload["coupons"]["medium"]["unavailable"] is True
    assert payload["coupons"]["high"]["unavailable"] is True


def test_generated_insight_helpers():
    result_json = {
        "coupons": {
            "low": {
                "matches": [
                    {"fixture_id": 55, "selection": "1", "simulation_summary": {"fixture_id": 55}},
                ]
            }
        },
        "insights": {
            "55:1": {"commentary": "cached insight"},
        },
    }

    match = builder.find_generated_coupon_match(result_json, fixture_id=55, selection="1")
    assert match is not None
    assert match["fixture_id"] == 55

    cached = builder.get_cached_generated_insight(result_json, fixture_id=55, selection="1")
    assert cached is not None
    assert cached["commentary"] == "cached insight"


def test_generate_coupon_payload_includes_league_specific_model_metadata(monkeypatch):
    rows = []
    for fid in (1001, 1002, 1003):
        rows.append(_fixture_row(fid, 1.40, 4.80, 7.20, league_id=600))
    for fid in (2001, 2002, 2003):
        rows.append(_fixture_row(fid, 2.10, 3.30, 3.40, league_id=564))
    for fid in (3001, 3002, 3003):
        rows.append(_fixture_row(fid, 3.10, 3.20, 2.20, league_id=8))

    league_by_fixture = {int(row["fixture_id"]): int(row["league_id"]) for row in rows}
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)

    def _simulate_fixture(fixture_id: int, settings: Settings, model_id=None):
        league_id = league_by_fixture[int(fixture_id)]
        if league_id == 600:
            outcomes = {"home_win": 0.72, "draw": 0.18, "away_win": 0.10}
        elif league_id == 564:
            outcomes = {"home_win": 0.52, "draw": 0.26, "away_win": 0.22}
        else:
            outcomes = {"home_win": 0.36, "draw": 0.30, "away_win": 0.34}
        payload = _simulation_payload(fixture_id, outcomes["home_win"], outcomes["draw"], outcomes["away_win"])
        payload["model"] = {
            "model_id": f"system-{league_id}",
            "model_name": f"System {league_id}",
            "selection_mode": "league_default",
        }
        payload["match"]["league_id"] = league_id
        return payload

    monkeypatch.setattr(builder, "simulate_fixture", _simulate_fixture)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600, 564, 8],
    )

    all_matches = []
    for risk_key in ("low", "medium", "high"):
        all_matches.extend(payload["coupons"][risk_key]["matches"])

    assert all_matches
    assert all(item.get("model_id") for item in all_matches)
    assert all(item.get("model_selection_mode") == "league_default" for item in all_matches)
    assert len({item.get("model_id") for item in all_matches}) >= 2


def test_low_coupon_uses_safety_fallback_when_strict_candidates_insufficient(monkeypatch):
    rows = [
        _fixture_row(1001, 1.94, 3.30, 4.10),
        _fixture_row(1002, 1.58, 4.40, 6.40),
        _fixture_row(1003, 1.84, 3.70, 4.80),
        _fixture_row(1004, 2.08, 3.40, 3.70),
    ]
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)

    simulation_by_fixture = {
        1001: (0.53, 0.25, 0.22),
        1002: (0.525, 0.25, 0.225),
        1003: (0.50, 0.28, 0.22),
        1004: (0.47, 0.28, 0.25),
    }

    def _simulate_fixture(fixture_id: int, settings: Settings, model_id=None):
        home_win, draw, away_win = simulation_by_fixture[int(fixture_id)]
        return _simulation_payload(fixture_id, home_win=home_win, draw=draw, away_win=away_win)

    monkeypatch.setattr(builder, "simulate_fixture", _simulate_fixture)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
    )

    low_coupon = payload["coupons"]["low"]
    assert low_coupon["unavailable"] is False
    assert low_coupon["selection_policy"] == "safety_fallback"
    assert low_coupon["safety_level_used"] == 0
    assert low_coupon["candidate_counts"]["strict_count"] < 3
    assert low_coupon["candidate_counts"]["safety_count"] >= 3
    assert len(low_coupon["matches"]) >= 3


def test_low_coupon_safety_fallback_respects_no_duplicate_rule(monkeypatch):
    rows = [
        _fixture_row(1101, 1.94, 3.30, 4.10),
        _fixture_row(1102, 1.58, 4.40, 6.40),
        _fixture_row(1103, 1.84, 3.70, 4.80),
        _fixture_row(1104, 2.08, 3.40, 3.70),
        _fixture_row(2101, 2.30, 3.30, 3.40),
        _fixture_row(2102, 2.25, 3.25, 3.50),
        _fixture_row(2103, 2.40, 3.20, 3.10),
        _fixture_row(2104, 2.45, 3.10, 3.00),
        _fixture_row(3101, 3.20, 3.00, 2.20),
        _fixture_row(3102, 3.40, 3.10, 2.10),
        _fixture_row(3103, 3.10, 3.20, 2.30),
        _fixture_row(3104, 3.30, 3.00, 2.25),
    ]
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)

    def _simulate_fixture(fixture_id: int, settings: Settings, model_id=None):
        if fixture_id < 2000:
            mapping = {
                1101: (0.53, 0.25, 0.22),
                1102: (0.525, 0.25, 0.225),
                1103: (0.50, 0.28, 0.22),
                1104: (0.47, 0.28, 0.25),
            }
            home_win, draw, away_win = mapping[int(fixture_id)]
            return _simulation_payload(fixture_id, home_win=home_win, draw=draw, away_win=away_win)
        if fixture_id < 3000:
            return _simulation_payload(fixture_id, home_win=0.54, draw=0.24, away_win=0.22)
        return _simulation_payload(fixture_id, home_win=0.43, draw=0.30, away_win=0.27)

    monkeypatch.setattr(builder, "simulate_fixture", _simulate_fixture)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
    )

    assert payload["coupons"]["low"]["unavailable"] is False
    assert payload["coupons"]["low"]["selection_policy"] == "safety_fallback"
    assert payload["coupons"]["medium"]["unavailable"] is False
    assert payload["coupons"]["high"]["unavailable"] is False

    all_ids = []
    for risk_key in ("low", "medium", "high"):
        all_ids.extend([item["fixture_id"] for item in payload["coupons"][risk_key]["matches"]])
    assert len(all_ids) == len(set(all_ids))


def test_medium_coupon_uses_risk_relax_fallback_when_strict_candidates_insufficient(monkeypatch):
    rows = [
        _fixture_row(1201, 2.80, 5.40, 6.10),
        _fixture_row(1202, 2.90, 5.30, 6.00),
        _fixture_row(1203, 3.00, 5.20, 5.90),
        _fixture_row(1204, 3.10, 5.10, 5.80),
    ]
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)
    monkeypatch.setattr(
        builder,
        "simulate_fixture",
        lambda fixture_id, settings, model_id=None: _simulation_payload(fixture_id, home_win=0.50, draw=0.28, away_win=0.22),
    )

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
    )

    medium_coupon = payload["coupons"]["medium"]
    assert medium_coupon["unavailable"] is False
    assert medium_coupon["selection_policy"] == "risk_relax_fallback"
    assert medium_coupon["safety_level_used"] == 0
    assert medium_coupon["candidate_counts"]["strict_count"] < 3
    assert medium_coupon["candidate_counts"]["safety_count"] >= 3
    assert len(medium_coupon["matches"]) >= 3


def test_high_coupon_risk_relax_fallback_respects_no_duplicate_rule(monkeypatch):
    rows = []
    for fid in (1301, 1302, 1303, 1304):
        rows.append(_fixture_row(fid, 1.42, 4.80, 7.10))
    for fid in (2301, 2302, 2303, 2304):
        rows.append(_fixture_row(fid, 2.20, 3.60, 3.70))
    for fid in (3301, 3302, 3303, 3304):
        rows.append(_fixture_row(fid, 2.60, 3.20, 6.80))

    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)

    def _simulate_fixture(fixture_id: int, settings: Settings, model_id=None):
        if fixture_id < 2000:
            return _simulation_payload(fixture_id, home_win=0.72, draw=0.18, away_win=0.10)
        if fixture_id < 3000:
            return _simulation_payload(fixture_id, home_win=0.50, draw=0.28, away_win=0.22)
        return _simulation_payload(fixture_id, home_win=0.33, draw=0.29, away_win=0.38)

    monkeypatch.setattr(builder, "simulate_fixture", _simulate_fixture)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
    )

    assert payload["coupons"]["low"]["unavailable"] is False
    assert payload["coupons"]["medium"]["unavailable"] is False
    high_coupon = payload["coupons"]["high"]
    assert high_coupon["unavailable"] is False
    assert high_coupon["selection_policy"] == "risk_relax_fallback"
    assert high_coupon["safety_level_used"] == 0
    assert high_coupon["candidate_counts"]["strict_count"] < 3
    assert high_coupon["candidate_counts"]["safety_count"] >= 3

    all_ids = []
    for risk_key in ("low", "medium", "high"):
        all_ids.extend([item["fixture_id"] for item in payload["coupons"][risk_key]["matches"]])
    assert len(all_ids) == len(set(all_ids))


def test_generate_coupon_payload_builds_math_coupons_with_valid_ranges(monkeypatch):
    rows = [
        _fixture_row(4001, 1.40, 4.80, 7.20),
        _fixture_row(4002, 1.48, 4.60, 7.10),
        _fixture_row(4003, 1.55, 4.40, 6.80),
        _fixture_row(4004, 1.62, 4.20, 6.60),
    ]
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)
    monkeypatch.setattr(
        builder,
        "simulate_fixture",
        lambda fixture_id, settings, model_id=None: _simulation_payload(fixture_id, home_win=0.72, draw=0.18, away_win=0.10),
    )

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
        bankroll_tl=1000,
        include_math_coupons=True,
    )

    math_payload = payload["math_coupons"]
    assert math_payload["summary"]["bankroll_tl"] == 1000

    single_items = math_payload["single_low_mid"]["items"]
    assert single_items
    for coupon in single_items:
        assert len(coupon["matches"]) == 1
        assert 1.35 <= float(coupon["total_odds"]) <= 1.65
        assert float(coupon["edge_sum"]) > 0.0

    double_items = math_payload["double_system"]["items"]
    assert double_items
    for coupon in double_items:
        assert len(coupon["matches"]) == 2
        assert 1.90 <= float(coupon["total_odds"]) <= 2.40
        assert float(coupon["edge_sum"]) > 0.0


def test_generate_coupon_payload_mix_warns_when_candidates_insufficient(monkeypatch):
    rows = [
        _fixture_row(5001, 1.44, 4.60, 7.00),
        _fixture_row(5002, 1.51, 4.40, 6.80),
    ]
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)
    monkeypatch.setattr(
        builder,
        "simulate_fixture",
        lambda fixture_id, settings, model_id=None: _simulation_payload(fixture_id, home_win=0.70, draw=0.20, away_win=0.10),
    )

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
        bankroll_tl=1000,
        include_math_coupons=True,
    )

    mix_payload = payload["math_coupons"]["mix_portfolio"]
    single_basket = mix_payload["baskets"]["single"]
    double_basket = mix_payload["baskets"]["double"]
    shot_basket = mix_payload["baskets"]["shot"]

    assert single_basket["planned_count"] > single_basket["generated_count"]
    assert double_basket["planned_count"] > double_basket["generated_count"]
    assert shot_basket["planned_count"] == 1
    assert shot_basket["generated_count"] == 0
    assert mix_payload["warnings"]


def test_generate_coupon_payload_adds_partial_warning_when_time_budget_exceeded(monkeypatch):
    rows = [
        _fixture_row(6001, 1.40, 4.80, 7.20),
        _fixture_row(6002, 1.44, 4.70, 7.10),
        _fixture_row(6003, 1.46, 4.60, 7.00),
        _fixture_row(6004, 1.48, 4.50, 6.90),
        _fixture_row(6005, 1.50, 4.40, 6.80),
        _fixture_row(6006, 1.52, 4.30, 6.70),
    ]
    monkeypatch.setattr(builder, "_load_fixture_candidates", lambda *args, **kwargs: rows)
    monkeypatch.setattr(
        builder,
        "simulate_fixture",
        lambda fixture_id, settings, model_id=None: _simulation_payload(fixture_id, home_win=0.71, draw=0.19, away_win=0.10),
    )
    ticker = {"value": 0.0}

    def _fake_monotonic():
        ticker["value"] += 2.2
        return ticker["value"]

    monkeypatch.setattr(builder.time, "monotonic", _fake_monotonic)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None, coupon_generation_max_simulations=90)
    payload = builder.generate_coupon_payload(
        settings,
        days_window=3,
        matches_per_coupon=3,
        league_ids=[600],
        bankroll_tl=1000,
        include_math_coupons=True,
    )

    warnings = [str(item) for item in payload.get("warnings") or []]
    math_warnings = [str(item) for item in payload["math_coupons"]["summary"].get("warnings") or []]
    joined = " ".join(warnings + math_warnings).lower()
    assert "kismi" in joined


def test_find_generated_coupon_match_searches_math_coupons():
    result_json = {
        "coupons": {
            "low": {"matches": []},
            "medium": {"matches": []},
            "high": {"matches": []},
        },
        "math_coupons": {
            "single_low_mid": {
                "items": [
                    {
                        "coupon_id": "single-1",
                        "matches": [{"fixture_id": 77, "selection": "1"}],
                    }
                ]
            },
            "double_system": {"items": []},
            "mix_portfolio": {
                "baskets": {
                    "single": {"items": []},
                    "double": {"items": []},
                    "shot": {"items": []},
                }
            },
        },
    }

    match = builder.find_generated_coupon_match(result_json, fixture_id=77, selection="1")
    assert match is not None
    assert match["fixture_id"] == 77


def test_load_fixture_candidates_applies_upcoming_time_guard(monkeypatch):
    captured: dict = {}

    class _FakeResult:
        def mappings(self):
            return self

        def all(self):
            return []

    class _FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params):
            captured["sql"] = str(query)
            captured["params"] = dict(params)
            return _FakeResult()

    class _FakeEngine:
        def connect(self):
            return _FakeConn()

    now_utc = datetime(2026, 2, 15, 10, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(builder, "create_engine", lambda *args, **kwargs: _FakeEngine())
    monkeypatch.setattr(builder, "ensure_fixture_board_tables", lambda engine: None)
    monkeypatch.setattr(builder, "_now_utc", lambda: now_utc)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None)
    rows = builder._load_fixture_candidates(
        settings,
        date_from=date(2026, 2, 15),
        date_to=date(2026, 2, 17),
        league_ids=[600, 564],
    )

    assert rows == []
    assert "starting_at >= :now_utc" in str(captured["sql"])
    assert captured["params"]["now_utc"] == now_utc
