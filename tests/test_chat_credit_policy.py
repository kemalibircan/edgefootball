import pytest

import app.coupons as coupons
from app.auth import AuthUser
from app.config import Settings


def _user(user_id: int = 22) -> AuthUser:
    return AuthUser(id=user_id, username=f"u-{user_id}", role="user", credits=100, is_active=True)


def test_chat_message_charges_credit_once_per_assistant_reply(monkeypatch):
    captured = {"consume_calls": 0, "consume_reason": None}

    monkeypatch.setattr(coupons, "get_chat_thread_by_id", lambda settings, thread_id, user_id: None)
    monkeypatch.setattr(coupons, "get_latest_chat_thread_by_fixture", lambda settings, user_id, fixture_id: None)
    monkeypatch.setattr(
        coupons,
        "upsert_chat_thread",
        lambda settings, user_id, fixture_id, home_team_name, away_team_name, match_label, last_message_at: {
            "id": 71,
            "fixture_id": fixture_id,
            "match_label": match_label or "A - B",
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
            "commentary": "chat insight",
            "analysis_table": [],
            "odds_summary": {},
            "provider": "openai",
            "provider_error": None,
            "cached": False,
        },
    )

    def _consume(settings, user_id, reason):
        captured["consume_calls"] += 1
        captured["consume_reason"] = reason
        return 63

    monkeypatch.setattr(coupons, "consume_ai_credits", _consume)
    monkeypatch.setattr(coupons, "resolve_credit_cost", lambda settings, reason: 10)
    monkeypatch.setattr(
        coupons,
        "get_chat_thread_by_id",
        lambda settings, thread_id, user_id: {"id": 71, "fixture_id": 321, "match_label": "A - B"},
    )

    payload = coupons.create_chat_message_endpoint(
        request=coupons.ChatMessageCreateRequest(
            fixture_id=321,
            home_team_name="A",
            away_team_name="B",
            match_label="A - B",
            source="generated",
            task_id="task-1",
            selection="1",
            question="Bu secim neden guclu?",
            language="tr",
        ),
        settings=Settings(dummy_mode=True, sportmonks_api_token=None),
        current_user=_user(),
    )

    assert payload["credits_remaining"] == 63
    assert captured["consume_calls"] == 1
    assert captured["consume_reason"] == "ai_commentary"


def test_chat_message_does_not_charge_when_insight_fails(monkeypatch):
    captured = {"consume_calls": 0}

    monkeypatch.setattr(coupons, "get_chat_thread_by_id", lambda settings, thread_id, user_id: None)
    monkeypatch.setattr(coupons, "get_latest_chat_thread_by_fixture", lambda settings, user_id, fixture_id: None)
    monkeypatch.setattr(
        coupons,
        "upsert_chat_thread",
        lambda settings, user_id, fixture_id, home_team_name, away_team_name, match_label, last_message_at: {
            "id": 91,
            "fixture_id": fixture_id,
            "match_label": match_label or "A - B",
        },
    )
    monkeypatch.setattr(
        coupons,
        "create_chat_message",
        lambda settings, thread_id, user_id, role, content_markdown, meta, credit_charged: {
            "id": 1,
            "thread_id": thread_id,
            "user_id": user_id,
            "role": role,
            "content_markdown": content_markdown,
            "credit_charged": credit_charged,
        },
    )
    monkeypatch.setattr(coupons, "update_chat_thread_last_message", lambda settings, thread_id, user_id, last_message_at: True)

    def _raise_insight(*args, **kwargs):
        raise coupons.HTTPException(status_code=404, detail="fixture bulunamadi")

    monkeypatch.setattr(coupons, "_resolve_coupon_match_insight", _raise_insight)

    def _consume(settings, user_id, reason):
        captured["consume_calls"] += 1
        return 50

    monkeypatch.setattr(coupons, "consume_ai_credits", _consume)

    with pytest.raises(coupons.HTTPException) as exc:
        coupons.create_chat_message_endpoint(
            request=coupons.ChatMessageCreateRequest(
                fixture_id=333,
                home_team_name="A",
                away_team_name="B",
                match_label="A - B",
                source="generated",
                task_id="task-2",
                selection="1",
                question="Hata denemesi",
                language="tr",
            ),
            settings=Settings(dummy_mode=True, sportmonks_api_token=None),
            current_user=_user(99),
        )

    assert exc.value.status_code == 404
    assert captured["consume_calls"] == 0
