from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

import app.coupons as coupons
from app.main import app
from app.auth import AuthUser
from app.config import Settings


class _DummyAsyncResult:
    def __init__(self, state: str, info=None, ready: bool = False):
        self.state = state
        self.info = info or {}
        self._ready = ready

    def ready(self) -> bool:
        return self._ready



def test_generate_coupons_enqueues_task(monkeypatch):
    captured = {}

    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(coupons, "resolve_credit_cost", lambda settings, reason: 15)
    monkeypatch.setattr(coupons, "consume_ai_credits", lambda settings, user_id, reason: 85)

    def _create_run(settings, *, user_id, request_payload, credit_charged):
        captured["request_payload"] = request_payload
        captured["credit_charged"] = credit_charged
        return {
            "id": 14,
            "status": "queued",
            "expires_at": datetime(2026, 2, 14, 12, 0, tzinfo=timezone.utc),
        }

    monkeypatch.setattr(coupons, "create_coupon_run", _create_run)

    class _Task:
        id = "coupon-task-14"

    monkeypatch.setattr(coupons, "generate_coupons_task", SimpleNamespace(delay=lambda run_id: _Task()))

    def _set_task_id(settings, *, run_id, task_id):
        captured["run_id"] = run_id
        captured["task_id"] = task_id

    monkeypatch.setattr(coupons, "set_coupon_run_task_id", _set_task_id)

    payload = coupons.generate_coupons(
        request=coupons.CouponGenerateRequest(
            days_window=3,
            matches_per_coupon=4,
            league_ids=[600, 564],
            model_id="m1",
            bankroll_tl=2500,
            include_math_coupons=True,
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )

    assert payload["run_id"] == 14
    assert payload["task_id"] == "coupon-task-14"
    assert payload["credit_charged"] == 15
    assert captured["run_id"] == 14
    assert captured["task_id"] == "coupon-task-14"
    assert captured["request_payload"]["league_ids"] == [600, 564]
    assert captured["request_payload"]["bankroll_tl"] == 2500.0
    assert captured["request_payload"]["include_math_coupons"] is True



def test_get_coupon_task_returns_completed_result(monkeypatch):
    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(
        coupons,
        "load_coupon_run_by_task",
        lambda settings, task_id, user_id: {
            "id": 14,
            "task_id": task_id,
            "user_id": user_id,
            "status": "completed",
            "result_json": {"coupons": {"low": {"matches": []}}, "math_coupons": {"summary": {"generated_counts": {}}}},
        },
    )
    monkeypatch.setattr(coupons, "AsyncResult", lambda task_id, app=None: _DummyAsyncResult("SUCCESS", {"progress": 100, "stage": "done"}, True))

    payload = coupons.get_coupon_task(
        task_id="coupon-task-14",
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )

    assert payload.task_id == "coupon-task-14"
    assert payload.state == "SUCCESS"
    assert payload.progress == 100
    assert payload.result["coupons"]["low"]["matches"] == []
    assert "math_coupons" in payload.result



def test_get_coupon_task_owner_check(monkeypatch):
    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(coupons, "load_coupon_run_by_task", lambda settings, task_id, user_id: None)

    with pytest.raises(coupons.HTTPException) as exc:
        coupons.get_coupon_task(
            task_id="missing-task",
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(id=99, username="x", role="user", credits=10, is_active=True),
        )

    assert exc.value.status_code == 404


def test_save_coupon_creates_library_record(monkeypatch):
    captured = {}

    def _create_saved_coupon(settings, *, user_id, name, items, summary, risk_level, source_task_id):
        captured["user_id"] = user_id
        captured["name"] = name
        captured["items"] = items
        captured["summary"] = summary
        captured["risk_level"] = risk_level
        captured["source_task_id"] = source_task_id
        return {
            "id": 44,
            "name": name,
            "status": "active",
            "risk_level": risk_level,
            "source_task_id": source_task_id,
            "items_json": items,
            "summary_json": summary,
            "created_at": datetime(2026, 2, 13, 14, 0, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 2, 13, 14, 0, tzinfo=timezone.utc),
            "archived_at": None,
        }

    monkeypatch.setattr(coupons, "create_saved_coupon", _create_saved_coupon)
    payload = coupons.save_coupon(
        request=coupons.CouponSaveRequest(
            name="Test Kupon",
            risk_level="low",
            source_task_id="task-1",
            items=[
                coupons.CouponSavedItem(
                    fixture_id=1,
                    home_team_name="A",
                    away_team_name="B",
                    home_team_logo="https://cdn.example.com/a.png",
                    away_team_logo="https://cdn.example.com/b.png",
                    selection="1",
                    odd=1.55,
                ),
                coupons.CouponSavedItem(
                    fixture_id=2,
                    home_team_name="C",
                    away_team_name="D",
                    selection="1",
                    odd=1.45,
                ),
                coupons.CouponSavedItem(
                    fixture_id=3,
                    home_team_name="E",
                    away_team_name="F",
                    selection="2",
                    odd=1.70,
                ),
            ],
            summary=coupons.CouponSavedSummary(
                coupon_count=1,
                stake=50,
                total_odds=3.82,
                coupon_amount=50,
                max_win=191,
            ),
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )
    assert payload["id"] == 44
    assert payload["status"] == "active"
    assert captured["risk_level"] == "low"
    assert len(captured["items"]) == 3
    assert captured["items"][0]["home_team_logo"] == "https://cdn.example.com/a.png"
    assert captured["items"][0]["away_team_logo"] == "https://cdn.example.com/b.png"


def test_get_saved_coupons_lists_by_status(monkeypatch):
    monkeypatch.setattr(
        coupons,
        "list_saved_coupons",
        lambda settings, user_id, status, limit: [
            {
                "id": 91,
                "name": "Kupon 91",
                "status": status,
                "risk_level": "medium",
                "source_task_id": "task-11",
                "items_json": [{"fixture_id": 5}],
                "summary_json": {"total_odds": 4.5},
                "created_at": datetime(2026, 2, 13, 14, 0, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 2, 13, 14, 0, tzinfo=timezone.utc),
                "archived_at": None,
            }
        ],
    )
    payload = coupons.get_saved_coupons(
        archived=True,
        limit=30,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )
    assert payload["status"] == "archived"
    assert payload["total"] == 1
    assert payload["items"][0]["id"] == 91


def test_rename_saved_coupon_updates_name(monkeypatch):
    monkeypatch.setattr(
        coupons,
        "update_saved_coupon_name",
        lambda settings, user_id, coupon_id, name: {
            "id": coupon_id,
            "name": name,
            "status": "active",
            "risk_level": "manual",
            "source_task_id": None,
            "items_json": [{"fixture_id": 9}],
            "summary_json": {"total_odds": 3.1},
            "created_at": datetime(2026, 2, 13, 14, 0, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 2, 13, 14, 5, tzinfo=timezone.utc),
            "archived_at": None,
        },
    )

    payload = coupons.rename_saved_coupon(
        coupon_id=55,
        request=coupons.CouponRenameRequest(name="  Yeni Kupon Adi  "),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )

    assert payload["id"] == 55
    assert payload["name"] == "Yeni Kupon Adi"
    assert payload["status"] == "active"


def test_rename_saved_coupon_rejects_blank_name():
    with pytest.raises(coupons.HTTPException) as exc:
        coupons.rename_saved_coupon(
            coupon_id=55,
            request=coupons.CouponRenameRequest(name="   "),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
        )
    assert exc.value.status_code == 400


def test_rename_saved_coupon_returns_404_when_missing(monkeypatch):
    monkeypatch.setattr(coupons, "update_saved_coupon_name", lambda settings, user_id, coupon_id, name: {})

    with pytest.raises(coupons.HTTPException) as exc:
        coupons.rename_saved_coupon(
            coupon_id=55,
            request=coupons.CouponRenameRequest(name="Yeni"),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
        )
    assert exc.value.status_code == 404


def test_saved_coupon_archive_restore_delete(monkeypatch):
    monkeypatch.setattr(coupons, "set_saved_coupon_status", lambda settings, user_id, coupon_id, status: True)
    monkeypatch.setattr(coupons, "delete_saved_coupon", lambda settings, user_id, coupon_id: True)

    archived = coupons.archive_saved_coupon_endpoint(
        coupon_id=12,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )
    assert archived.status == "archived"

    restored = coupons.restore_saved_coupon_endpoint(
        coupon_id=12,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )
    assert restored.status == "active"

    deleted = coupons.delete_saved_coupon_endpoint(
        coupon_id=12,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=AuthUser(id=8, username="ali", role="user", credits=120, is_active=True),
    )
    assert deleted.status == "deleted"


def test_coupon_admin_alias_routes_registered():
    paths = {getattr(route, "path", "") for route in app.routes}
    assert "/coupons/generate" in paths
    assert "/admin/coupons/generate" in paths
    assert "/admin/coupons/tasks/{task_id}" in paths
    assert "/admin/coupons/match-insight" in paths
    assert "/coupons/chat/threads" in paths
    assert "/admin/coupons/chat/threads" in paths
    assert "/coupons/chat/threads/{thread_id}/messages" in paths
    assert "/admin/coupons/chat/threads/{thread_id}/messages" in paths
    assert "/coupons/chat/fixtures/search" in paths
    assert "/admin/coupons/chat/fixtures/search" in paths
    assert "/coupons/chat/messages" in paths
    assert "/admin/coupons/chat/messages" in paths
    assert "/coupons/saved" in paths
    assert "/admin/coupons/saved" in paths
    assert "/coupons/saved/{coupon_id}/archive" in paths
    assert "/coupons/saved/{coupon_id}/restore" in paths
    assert "/coupons/saved/{coupon_id}" in paths
    assert "/admin/coupons/saved/{coupon_id}" in paths

    saved_methods = [set(getattr(route, "methods", set())) for route in app.routes if getattr(route, "path", "") == "/coupons/saved/{coupon_id}"]
    admin_saved_methods = [
        set(getattr(route, "methods", set()))
        for route in app.routes
        if getattr(route, "path", "") == "/admin/coupons/saved/{coupon_id}"
    ]
    assert any("PATCH" in methods for methods in saved_methods)
    assert any("PATCH" in methods for methods in admin_saved_methods)


def test_coupon_save_request_allows_1_to_20_items():
    one_item_request = coupons.CouponSaveRequest(
        items=[
            coupons.CouponSavedItem(
                fixture_id=11,
                home_team_name="A",
                away_team_name="B",
                selection="1",
                odd=1.55,
            )
        ],
        summary=coupons.CouponSavedSummary(
            coupon_count=1,
            stake=50,
            total_odds=1.55,
            coupon_amount=50,
            max_win=77.5,
        ),
    )
    assert len(one_item_request.items) == 1

    twenty_items = [
        coupons.CouponSavedItem(
            fixture_id=1000 + index,
            home_team_name=f"H{index}",
            away_team_name=f"A{index}",
            selection="1",
            odd=1.40,
        )
        for index in range(20)
    ]
    twenty_item_request = coupons.CouponSaveRequest(
        items=twenty_items,
        summary=coupons.CouponSavedSummary(
            coupon_count=1,
            stake=50,
            total_odds=2.10,
            coupon_amount=50,
            max_win=105,
        ),
    )
    assert len(twenty_item_request.items) == 20


def test_coupon_saved_item_allows_extended_market_selection_codes():
    first_half_item = coupons.CouponSavedItem(
        fixture_id=301,
        home_team_name="H1",
        away_team_name="A1",
        selection="IY-1",
        selection_display="IY 1",
        market_key="first_half",
        market_label="Ilk Yari Sonucu",
        odd=2.15,
    )
    handicap_item = coupons.CouponSavedItem(
        fixture_id=302,
        home_team_name="H2",
        away_team_name="A2",
        selection="HCP(+1)-2",
        selection_display="HCP +1 2",
        market_key="handicap",
        market_label="Handikapli Mac Sonucu",
        line="+1",
        odd=3.05,
    )
    over_item = coupons.CouponSavedItem(
        fixture_id=303,
        home_team_name="H3",
        away_team_name="A3",
        selection="ALT-2.5",
        selection_display="ALT 2.5",
        market_key="over_under_25",
        market_label="Alt/Ust 2.5",
        line="2.5",
        odd=1.87,
    )
    btts_item = coupons.CouponSavedItem(
        fixture_id=304,
        home_team_name="H4",
        away_team_name="A4",
        selection="KG-VAR",
        selection_display="KG Var",
        market_key="btts",
        market_label="Karsilikli Gol",
        odd=1.94,
    )

    assert first_half_item.selection == "IY-1"
    assert handicap_item.market_key == "handicap"
    assert over_item.line == "2.5"
    assert btts_item.selection == "KG-VAR"


def test_coupon_saved_item_allows_optional_team_logo_fields():
    item = coupons.CouponSavedItem(
        fixture_id=401,
        home_team_name="Home",
        away_team_name="Away",
        home_team_logo="https://cdn.example.com/home.png",
        away_team_logo="https://cdn.example.com/away.png",
        selection="1",
        odd=1.9,
    )

    assert item.home_team_logo == "https://cdn.example.com/home.png"
    assert item.away_team_logo == "https://cdn.example.com/away.png"


def test_coupon_save_request_rejects_more_than_20_items():
    too_many_items = [
        coupons.CouponSavedItem(
            fixture_id=2000 + index,
            home_team_name=f"H{index}",
            away_team_name=f"A{index}",
            selection="1",
            odd=1.35,
        )
        for index in range(21)
    ]
    with pytest.raises(ValidationError):
        coupons.CouponSaveRequest(
            items=too_many_items,
            summary=coupons.CouponSavedSummary(
                coupon_count=1,
                stake=50,
                total_odds=2.0,
                coupon_amount=50,
                max_win=100,
            ),
        )
