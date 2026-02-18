import pytest

import app.coupon_builder as builder
from app.config import Settings



def test_process_coupon_generation_run_success(monkeypatch):
    status_calls = []

    monkeypatch.setattr(
        builder,
        "load_coupon_run_by_id",
        lambda settings, run_id: {
            "id": run_id,
            "request_json": {
                "days_window": 3,
                "matches_per_coupon": 3,
                "league_ids": [600, 564],
                "model_id": "m1",
                "bankroll_tl": 1500,
                "include_math_coupons": True,
            },
        },
    )

    def _set_status(settings, *, run_id, status, **kwargs):
        status_calls.append((status, kwargs))

    monkeypatch.setattr(builder, "set_coupon_run_status", _set_status)
    monkeypatch.setattr(
        builder,
        "generate_coupon_payload",
        lambda settings, days_window, matches_per_coupon, league_ids, model_id, bankroll_tl, include_math_coupons, progress_cb=None: {
            "generated_at": "2026-02-13T10:00:00+00:00",
            "request": {
                "days_window": days_window,
                "matches_per_coupon": matches_per_coupon,
                "league_ids": league_ids,
                "model_id": model_id,
                "bankroll_tl": bankroll_tl,
                "include_math_coupons": include_math_coupons,
            },
            "coupons": {"low": {}, "medium": {}, "high": {}},
            "math_coupons": {"summary": {"generated_counts": {}}},
        },
    )

    payload = builder.process_coupon_generation_run(run_id=21, settings=Settings(dummy_mode=True, sportmonks_api_token=None))

    assert payload["request"]["days_window"] == 3
    assert payload["request"]["bankroll_tl"] == 1500
    assert payload["request"]["include_math_coupons"] is True
    assert status_calls[0][0] == "running"
    assert status_calls[-1][0] == "completed"
    assert status_calls[-1][1]["result_json"]["coupons"].keys() == {"low", "medium", "high"}



def test_process_coupon_generation_run_failed(monkeypatch):
    status_calls = []

    monkeypatch.setattr(
        builder,
        "load_coupon_run_by_id",
        lambda settings, run_id: {
            "id": run_id,
            "request_json": {
                "days_window": 3,
                "matches_per_coupon": 3,
                "league_ids": [600],
            },
        },
    )

    def _set_status(settings, *, run_id, status, **kwargs):
        status_calls.append((status, kwargs))

    monkeypatch.setattr(builder, "set_coupon_run_status", _set_status)

    def _boom(*args, **kwargs):
        raise RuntimeError("sim failure")

    monkeypatch.setattr(builder, "generate_coupon_payload", _boom)

    with pytest.raises(RuntimeError):
        builder.process_coupon_generation_run(run_id=22, settings=Settings(dummy_mode=True, sportmonks_api_token=None))

    assert status_calls[0][0] == "running"
    assert status_calls[-1][0] == "failed"
    assert "RuntimeError" in str(status_calls[-1][1]["error"])
