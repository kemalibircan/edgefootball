from datetime import datetime, timezone
from types import SimpleNamespace

import app.coupons as coupons
from app.auth import AuthUser
from app.config import Settings



def test_coupon_generate_uses_coupon_generate_credit_reason(monkeypatch):
    captured = {}

    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(coupons, "resolve_credit_cost", lambda settings, reason: 15)

    def _consume(settings, user_id, reason):
        captured["reason"] = reason
        return 60

    monkeypatch.setattr(coupons, "consume_ai_credits", _consume)
    monkeypatch.setattr(
        coupons,
        "create_coupon_run",
        lambda settings, user_id, request_payload, credit_charged: {
            "id": 5,
            "status": "queued",
            "expires_at": datetime(2026, 2, 14, 9, 0, tzinfo=timezone.utc),
        },
    )
    monkeypatch.setattr(coupons, "generate_coupons_task", SimpleNamespace(delay=lambda run_id: SimpleNamespace(id="task-5")))
    monkeypatch.setattr(coupons, "set_coupon_run_task_id", lambda settings, run_id, task_id: None)

    payload = coupons.generate_coupons(
        request=coupons.CouponGenerateRequest(days_window=3, matches_per_coupon=3),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=4, username="u", role="user", credits=80, is_active=True),
    )

    assert payload["credit_charged"] == 15
    assert captured["reason"] == "coupon_generate"



def test_generated_insight_does_not_consume_extra_credit(monkeypatch):
    run_result = {
        "coupons": {
            "low": {
                "matches": [
                    {
                        "fixture_id": 701,
                        "selection": "1",
                        "simulation_summary": {
                            "fixture_id": 701,
                            "outcomes": {"home_win": 0.55, "draw": 0.23, "away_win": 0.22},
                            "top_scorelines": [{"score": "1-0", "probability": 0.14}],
                        },
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
            "id": 17,
            "status": "completed",
            "result_json": run_result,
        },
    )
    monkeypatch.setattr(coupons, "append_generated_insight", lambda *args, **kwargs: run_result)

    def _should_not_charge(*args, **kwargs):
        raise AssertionError("generated insight ek kredi dusmemeli")

    monkeypatch.setattr(coupons, "consume_ai_credits", _should_not_charge)
    monkeypatch.setattr(
        coupons,
        "generate_match_commentary",
        lambda **kwargs: {
            "commentary": "generated-insight",
            "provider": "openai",
            "provider_error": None,
            "analysis_table": [],
            "odds_summary": {},
        },
    )

    payload = coupons.get_coupon_match_insight(
        request=coupons.CouponMatchInsightRequest(source="generated", task_id="task-17", fixture_id=701, selection="1"),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=4, username="u", role="user", credits=80, is_active=True),
    )

    assert payload["source"] == "generated"
    assert payload["commentary"] == "generated-insight"



def test_manual_insight_consumes_ai_commentary_credit(monkeypatch):
    captured = {}

    monkeypatch.setattr(
        coupons,
        "simulate_fixture",
        lambda fixture_id, settings, model_id=None: {
            "fixture_id": fixture_id,
            "outcomes": {"home_win": 0.51, "draw": 0.24, "away_win": 0.25},
            "top_scorelines": [{"score": "1-0", "probability": 0.12}],
        },
    )
    monkeypatch.setattr(
        coupons,
        "generate_match_commentary",
        lambda **kwargs: {
            "commentary": "manual-insight",
            "provider": "openai",
            "provider_error": None,
            "analysis_table": [],
            "odds_summary": {},
        },
    )

    def _consume(settings, user_id, reason):
        captured["reason"] = reason
        return 44

    monkeypatch.setattr(coupons, "consume_ai_credits", _consume)

    payload = coupons.get_coupon_match_insight(
        request=coupons.CouponMatchInsightRequest(source="manual", fixture_id=901, language="tr"),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=11, username="manual", role="user", credits=90, is_active=True),
    )

    assert payload["source"] == "manual"
    assert payload["credits_remaining"] == 44
    assert captured["reason"] == "ai_commentary"
