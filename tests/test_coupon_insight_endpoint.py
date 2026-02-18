import pytest

import app.coupons as coupons
from app.auth import AuthUser
from app.config import Settings



def test_generated_insight_returns_cached_payload(monkeypatch):
    run_result = {
        "coupons": {
            "low": {
                "matches": [
                    {
                        "fixture_id": 55,
                        "selection": "1",
                        "simulation_summary": {
                            "fixture_id": 55,
                            "outcomes": {"home_win": 0.58, "draw": 0.22, "away_win": 0.20},
                        },
                    }
                ]
            }
        },
        "insights": {
            "55:1": {
                "commentary": "cached insight",
                "provider": "cache",
            }
        },
    }

    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(
        coupons,
        "load_coupon_run_by_task",
        lambda settings, task_id, user_id: {
            "id": 3,
            "status": "completed",
            "result_json": run_result,
        },
    )

    def _should_not_call_commentary(*args, **kwargs):
        raise AssertionError("cached insight'ta commentary cagrilmamali")

    monkeypatch.setattr(coupons, "generate_match_commentary", _should_not_call_commentary)

    payload = coupons.get_coupon_match_insight(
        request=coupons.CouponMatchInsightRequest(source="generated", task_id="task-3", fixture_id=55, selection="1"),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=1, username="u", role="user", credits=50, is_active=True),
    )

    assert payload["commentary"] == "cached insight"
    assert payload["cached"] is True



def test_generated_insight_rejects_missing_fixture(monkeypatch):
    run_result = {
        "coupons": {
            "low": {
                "matches": [
                    {
                        "fixture_id": 66,
                        "selection": "1",
                        "simulation_summary": {"fixture_id": 66, "outcomes": {"home_win": 0.5}},
                    }
                ]
            }
        }
    }

    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(
        coupons,
        "load_coupon_run_by_task",
        lambda settings, task_id, user_id: {
            "id": 4,
            "status": "completed",
            "result_json": run_result,
        },
    )

    with pytest.raises(coupons.HTTPException) as exc:
        coupons.get_coupon_match_insight(
            request=coupons.CouponMatchInsightRequest(source="generated", task_id="task-4", fixture_id=77, selection="1"),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(id=1, username="u", role="user", credits=50, is_active=True),
        )

    assert exc.value.status_code == 404



def test_generated_insight_rejects_unknown_task(monkeypatch):
    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(coupons, "load_coupon_run_by_task", lambda settings, task_id, user_id: None)

    with pytest.raises(coupons.HTTPException) as exc:
        coupons.get_coupon_match_insight(
            request=coupons.CouponMatchInsightRequest(source="generated", task_id="missing", fixture_id=88, selection="1"),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(id=1, username="u", role="user", credits=50, is_active=True),
        )

    assert exc.value.status_code == 404
