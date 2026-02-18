import pytest

import app.coupons as coupons
from app.auth import AuthUser
from app.config import Settings


def _user(user_id: int = 8) -> AuthUser:
    return AuthUser(id=user_id, username=f"user-{user_id}", role="user", credits=120, is_active=True)


def test_get_chat_threads_returns_payload(monkeypatch):
    monkeypatch.setattr(
        coupons,
        "list_chat_threads",
        lambda settings, user_id, limit: [
            {
                "id": 11,
                "fixture_id": 901,
                "home_team_logo": "https://cdn.example.com/a.png",
                "away_team_logo": "https://cdn.example.com/b.png",
                "league_name": "Super Lig",
                "starting_at": "2026-02-15T16:20:00+00:00",
                "match_label": "A - B",
                "last_message_at": "2026-02-15T16:20:00+00:00",
            },
            {
                "id": 9,
                "fixture_id": 777,
                "match_label": "C - D",
                "last_message_at": "2026-02-14T11:00:00+00:00",
            },
        ],
    )

    payload = coupons.get_chat_threads(
        limit=50,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(),
    )

    assert payload["total"] == 2
    assert payload["items"][0]["id"] == 11
    assert payload["items"][0]["home_team_logo"] == "https://cdn.example.com/a.png"
    assert payload["items"][0]["league_name"] == "Super Lig"
    assert payload["items"][1]["id"] == 9


def test_get_chat_thread_messages_checks_owner(monkeypatch):
    monkeypatch.setattr(coupons, "get_chat_thread_by_id", lambda settings, thread_id, user_id: None)

    with pytest.raises(coupons.HTTPException) as exc:
        coupons.get_chat_thread_messages(
            thread_id=15,
            limit=100,
            before_id=None,
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=_user(3),
        )

    assert exc.value.status_code == 404


def test_get_chat_thread_messages_returns_enriched_thread(monkeypatch):
    monkeypatch.setattr(
        coupons,
        "get_chat_thread_by_id",
        lambda settings, thread_id, user_id: {
            "id": thread_id,
            "fixture_id": 901,
            "match_label": "A - B",
            "home_team_logo": "https://cdn.example.com/a.png",
            "away_team_logo": "https://cdn.example.com/b.png",
            "league_name": "Super Lig",
            "starting_at": "2026-02-15T16:20:00+00:00",
        },
    )
    monkeypatch.setattr(
        coupons,
        "list_chat_messages",
        lambda settings, thread_id, user_id, limit, before_id: [
            {
                "id": 1,
                "thread_id": thread_id,
                "user_id": user_id,
                "role": "assistant",
                "content_markdown": "Merhaba",
                "created_at": "2026-02-15T16:22:00+00:00",
            }
        ],
    )

    payload = coupons.get_chat_thread_messages(
        thread_id=11,
        limit=100,
        before_id=None,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(3),
    )

    assert payload["thread"]["id"] == 11
    assert payload["thread"]["home_team_logo"] == "https://cdn.example.com/a.png"
    assert payload["thread"]["league_name"] == "Super Lig"
    assert payload["total"] == 1
    assert payload["items"][0]["role"] == "assistant"


def test_get_chat_fixture_search_returns_items(monkeypatch):
    monkeypatch.setattr(
        coupons,
        "search_chat_fixtures",
        lambda settings, q, limit: [
            {
                "fixture_id": 501,
                "match_label": "Fenerbahce - Galatasaray",
                "home_team_name": "Fenerbahce",
                "away_team_name": "Galatasaray",
                "home_team_logo": "https://cdn.example.com/fb.png",
                "away_team_logo": "https://cdn.example.com/gs.png",
            }
        ],
    )

    payload = coupons.get_chat_fixture_search(
        q="fener",
        limit=20,
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(4),
    )

    assert payload["q"] == "fener"
    assert payload["total"] == 1
    assert payload["items"][0]["fixture_id"] == 501
    assert payload["items"][0]["home_team_logo"] == "https://cdn.example.com/fb.png"
    assert payload["items"][0]["away_team_logo"] == "https://cdn.example.com/gs.png"


def test_create_chat_message_creates_thread_and_messages(monkeypatch):
    captured = {"messages": []}

    monkeypatch.setattr(coupons, "get_chat_thread_by_id", lambda settings, thread_id, user_id: None)
    monkeypatch.setattr(coupons, "get_latest_chat_thread_by_fixture", lambda settings, user_id, fixture_id: None)
    monkeypatch.setattr(
        coupons,
        "upsert_chat_thread",
        lambda settings, user_id, fixture_id, home_team_name, away_team_name, match_label, last_message_at: {
            "id": 45,
            "fixture_id": fixture_id,
            "home_team_name": home_team_name,
            "away_team_name": away_team_name,
            "match_label": match_label,
            "last_message_at": "2026-02-15T17:00:00+00:00",
        },
    )

    def _create_chat_message(settings, thread_id, user_id, role, content_markdown, meta, credit_charged):
        message_id = 100 + len(captured["messages"])
        row = {
            "id": message_id,
            "thread_id": thread_id,
            "user_id": user_id,
            "role": role,
            "content_markdown": content_markdown,
            "meta": meta,
            "credit_charged": credit_charged,
            "created_at": "2026-02-15T17:00:00+00:00",
        }
        captured["messages"].append(row)
        return row

    monkeypatch.setattr(coupons, "create_chat_message", _create_chat_message)
    monkeypatch.setattr(coupons, "update_chat_thread_last_message", lambda settings, thread_id, user_id, last_message_at: True)
    monkeypatch.setattr(
        coupons,
        "_resolve_coupon_match_insight",
        lambda request, settings, current_user, consume_manual_credit, user_question: {
            "source": request.source,
            "fixture_id": request.fixture_id,
            "selection": request.selection,
            "model_id": "m1",
            "model_name": "Model 1",
            "model_selection_mode": "active",
            "simulation_summary": {"outcomes": {"home_win": 0.55, "draw": 0.23, "away_win": 0.22}},
            "commentary": "AI aciklamasi",
            "provider": "openai",
            "provider_error": None,
            "analysis_table": [],
            "odds_summary": {},
            "cached": False,
        },
    )
    monkeypatch.setattr(coupons, "consume_ai_credits", lambda settings, user_id, reason: 77)
    monkeypatch.setattr(coupons, "resolve_credit_cost", lambda settings, reason: 10)
    monkeypatch.setattr(
        coupons,
        "get_chat_thread_by_id",
        lambda settings, thread_id, user_id: {
            "id": thread_id,
            "fixture_id": 901,
            "match_label": "A - B",
            "last_message_at": "2026-02-15T17:00:00+00:00",
        },
    )

    payload = coupons.create_chat_message_endpoint(
        request=coupons.ChatMessageCreateRequest(
            fixture_id=901,
            home_team_name="A",
            away_team_name="B",
            match_label="A - B",
            source="manual",
            question="Bu mac nasil biter?",
            language="tr",
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(5),
    )

    assert payload["thread"]["id"] == 45
    assert payload["assistant_message"]["role"] == "assistant"
    assert payload["insight"]["commentary"] == "AI aciklamasi"
    assert payload["credits_remaining"] == 77
    assert len(captured["messages"]) == 2
    assert captured["messages"][0]["role"] == "user"
    assert captured["messages"][1]["credit_charged"] == 10


def test_create_chat_message_new_session_creates_new_thread_every_time(monkeypatch):
    captured = {"thread_id_seq": 50}

    def _upsert_chat_thread(settings, user_id, fixture_id, home_team_name, away_team_name, match_label, last_message_at):
        captured["thread_id_seq"] += 1
        thread_id = captured["thread_id_seq"]
        return {
            "id": thread_id,
            "fixture_id": fixture_id,
            "home_team_name": home_team_name,
            "away_team_name": away_team_name,
            "match_label": match_label,
            "last_message_at": "2026-02-15T17:00:00+00:00",
        }

    monkeypatch.setattr(coupons, "upsert_chat_thread", _upsert_chat_thread)
    monkeypatch.setattr(coupons, "get_latest_chat_thread_by_fixture", lambda settings, user_id, fixture_id: None)
    monkeypatch.setattr(
        coupons,
        "get_chat_thread_by_id",
        lambda settings, thread_id, user_id: {
            "id": thread_id,
            "fixture_id": 901,
            "home_team_name": "A",
            "away_team_name": "B",
            "match_label": "A - B",
            "last_message_at": "2026-02-15T17:00:00+00:00",
        },
    )
    monkeypatch.setattr(
        coupons,
        "create_chat_message",
        lambda settings, thread_id, user_id, role, content_markdown, meta, credit_charged: {
            "id": 1 if role == "user" else 2,
            "thread_id": thread_id,
            "user_id": user_id,
            "role": role,
            "content_markdown": content_markdown,
            "credit_charged": credit_charged,
        },
    )
    monkeypatch.setattr(coupons, "update_chat_thread_last_message", lambda settings, thread_id, user_id, last_message_at: True)
    monkeypatch.setattr(
        coupons,
        "_resolve_coupon_match_insight",
        lambda request, settings, current_user, consume_manual_credit, user_question: {
            "source": request.source,
            "fixture_id": request.fixture_id,
            "commentary": "AI",
            "analysis_table": [],
            "odds_summary": {},
            "provider": "openai",
            "provider_error": None,
            "cached": False,
        },
    )
    monkeypatch.setattr(coupons, "consume_ai_credits", lambda settings, user_id, reason: 90)
    monkeypatch.setattr(coupons, "resolve_credit_cost", lambda settings, reason: 10)

    first = coupons.create_chat_message_endpoint(
        request=coupons.ChatMessageCreateRequest(
            fixture_id=901,
            home_team_name="A",
            away_team_name="B",
            match_label="A - B",
            source="manual",
            question="ilk soru",
            language="tr",
            new_session=True,
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(6),
    )
    second = coupons.create_chat_message_endpoint(
        request=coupons.ChatMessageCreateRequest(
            fixture_id=901,
            home_team_name="A",
            away_team_name="B",
            match_label="A - B",
            source="manual",
            question="ikinci soru",
            language="tr",
            new_session=True,
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(6),
    )

    assert first["thread"]["id"] != second["thread"]["id"]


def test_create_chat_message_new_session_can_clone_fixture_from_thread(monkeypatch):
    captured = {"upsert_fixture_id": None, "upsert_count": 0}

    def _get_chat_thread_by_id(settings, thread_id, user_id):
        if int(thread_id) == 15:
            return {
                "id": 15,
                "fixture_id": 903,
                "home_team_name": "X",
                "away_team_name": "Y",
                "match_label": "X - Y",
            }
        return {
            "id": thread_id,
            "fixture_id": 903,
            "home_team_name": "X",
            "away_team_name": "Y",
            "match_label": "X - Y",
        }

    def _upsert_chat_thread(settings, user_id, fixture_id, home_team_name, away_team_name, match_label, last_message_at):
        captured["upsert_count"] += 1
        captured["upsert_fixture_id"] = fixture_id
        return {
            "id": 99,
            "fixture_id": fixture_id,
            "home_team_name": home_team_name,
            "away_team_name": away_team_name,
            "match_label": match_label,
        }

    monkeypatch.setattr(coupons, "get_chat_thread_by_id", _get_chat_thread_by_id)
    monkeypatch.setattr(coupons, "get_latest_chat_thread_by_fixture", lambda settings, user_id, fixture_id: None)
    monkeypatch.setattr(coupons, "upsert_chat_thread", _upsert_chat_thread)
    monkeypatch.setattr(
        coupons,
        "create_chat_message",
        lambda settings, thread_id, user_id, role, content_markdown, meta, credit_charged: {
            "id": 1 if role == "user" else 2,
            "thread_id": thread_id,
            "user_id": user_id,
            "role": role,
            "content_markdown": content_markdown,
            "credit_charged": credit_charged,
        },
    )
    monkeypatch.setattr(coupons, "update_chat_thread_last_message", lambda settings, thread_id, user_id, last_message_at: True)
    monkeypatch.setattr(
        coupons,
        "_resolve_coupon_match_insight",
        lambda request, settings, current_user, consume_manual_credit, user_question: {
            "source": request.source,
            "fixture_id": request.fixture_id,
            "commentary": "AI",
            "analysis_table": [],
            "odds_summary": {},
            "provider": "openai",
            "provider_error": None,
            "cached": False,
        },
    )
    monkeypatch.setattr(coupons, "consume_ai_credits", lambda settings, user_id, reason: 90)
    monkeypatch.setattr(coupons, "resolve_credit_cost", lambda settings, reason: 10)

    payload = coupons.create_chat_message_endpoint(
        request=coupons.ChatMessageCreateRequest(
            thread_id=15,
            source="manual",
            question="bu fixture icin yeni session ac",
            language="tr",
            new_session=True,
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(6),
    )

    assert captured["upsert_count"] == 1
    assert captured["upsert_fixture_id"] == 903
    assert payload["thread"]["id"] == 99


def test_create_chat_message_without_new_session_uses_latest_fixture_thread(monkeypatch):
    monkeypatch.setattr(coupons, "get_chat_thread_by_id", lambda settings, thread_id, user_id: None)
    monkeypatch.setattr(
        coupons,
        "get_latest_chat_thread_by_fixture",
        lambda settings, user_id, fixture_id: {
            "id": 444,
            "fixture_id": fixture_id,
            "home_team_name": "A",
            "away_team_name": "B",
            "match_label": "A - B",
        },
    )
    monkeypatch.setattr(coupons, "upsert_chat_thread", lambda *args, **kwargs: pytest.fail("upsert_chat_thread should not be called"))
    monkeypatch.setattr(
        coupons,
        "create_chat_message",
        lambda settings, thread_id, user_id, role, content_markdown, meta, credit_charged: {
            "id": 1 if role == "user" else 2,
            "thread_id": thread_id,
            "user_id": user_id,
            "role": role,
            "content_markdown": content_markdown,
            "credit_charged": credit_charged,
        },
    )
    monkeypatch.setattr(coupons, "update_chat_thread_last_message", lambda settings, thread_id, user_id, last_message_at: True)
    monkeypatch.setattr(
        coupons,
        "_resolve_coupon_match_insight",
        lambda request, settings, current_user, consume_manual_credit, user_question: {
            "source": request.source,
            "fixture_id": request.fixture_id,
            "commentary": "AI",
            "analysis_table": [],
            "odds_summary": {},
            "provider": "openai",
            "provider_error": None,
            "cached": False,
        },
    )
    monkeypatch.setattr(coupons, "consume_ai_credits", lambda settings, user_id, reason: 90)
    monkeypatch.setattr(coupons, "resolve_credit_cost", lambda settings, reason: 10)
    monkeypatch.setattr(
        coupons,
        "get_chat_thread_by_id",
        lambda settings, thread_id, user_id: {
            "id": thread_id,
            "fixture_id": 901,
            "match_label": "A - B",
        },
    )

    payload = coupons.create_chat_message_endpoint(
        request=coupons.ChatMessageCreateRequest(
            fixture_id=901,
            source="manual",
            question="devam",
            language="tr",
            new_session=False,
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(6),
    )

    assert payload["thread"]["id"] == 444


def test_generated_chat_question_bypasses_cached_commentary(monkeypatch):
    run_result = {
        "coupons": {
            "low": {
                "matches": [
                    {
                        "fixture_id": 701,
                        "selection": "1",
                        "simulation_summary": {
                            "fixture_id": 701,
                            "outcomes": {"home_win": 0.55, "draw": 0.22, "away_win": 0.23},
                        },
                    }
                ]
            }
        },
        "insights": {
            "701:1": {
                "commentary": "cached commentary",
                "simulation_summary": {"fixture_id": 701, "outcomes": {"home_win": 0.55, "draw": 0.22, "away_win": 0.23}},
            }
        },
    }
    captured = {"append_called": False}

    monkeypatch.setattr(coupons, "cleanup_expired_coupon_runs", lambda settings: 0)
    monkeypatch.setattr(
        coupons,
        "load_coupon_run_by_task",
        lambda settings, task_id, user_id: {"id": 17, "status": "completed", "result_json": run_result},
    )
    monkeypatch.setattr(
        coupons,
        "generate_match_commentary",
        lambda **kwargs: {
            "commentary": "fresh-answer",
            "provider": "openai",
            "provider_error": None,
            "analysis_table": [],
            "odds_summary": {},
        },
    )
    monkeypatch.setattr(
        coupons,
        "append_generated_insight",
        lambda *args, **kwargs: captured.update({"append_called": True}),
    )

    payload = coupons._resolve_coupon_match_insight(
        request=coupons.CouponMatchInsightRequest(source="generated", task_id="task-17", fixture_id=701, selection="1"),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(17),
        consume_manual_credit=False,
        user_question="Bu secim neden daha iyi?",
    )

    assert payload["commentary"] == "fresh-answer"
    assert payload["cached"] is False
    assert captured["append_called"] is False
