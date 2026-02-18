from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import create_engine, text

from app.config import Settings
from app.fixture_board import FIXTURE_BOARD_CACHE_TABLE, ensure_fixture_board_tables

AI_CHAT_THREADS_TABLE = "ai_chat_threads"
AI_CHAT_MESSAGES_TABLE = "ai_chat_messages"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text_value = str(value).strip()
    return text_value or None


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_load(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        text_value = value.strip()
        if not text_value:
            return fallback
        try:
            return json.loads(text_value)
        except Exception:
            return fallback
    return fallback


def ensure_ai_chat_tables(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {AI_CHAT_THREADS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    fixture_id BIGINT NOT NULL,
                    home_team_name TEXT,
                    away_team_name TEXT,
                    match_label TEXT NOT NULL,
                    last_message_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {AI_CHAT_MESSAGES_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    thread_id BIGINT NOT NULL REFERENCES {AI_CHAT_THREADS_TABLE}(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                    content_markdown TEXT NOT NULL,
                    meta_json JSONB,
                    credit_charged INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_user_last_message
                ON {AI_CHAT_THREADS_TABLE} (user_id, last_message_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_user_fixture_last_message
                ON {AI_CHAT_THREADS_TABLE} (user_id, fixture_id, last_message_at DESC, id DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread_created
                ON {AI_CHAT_MESSAGES_TABLE} (thread_id, created_at ASC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user_created
                ON {AI_CHAT_MESSAGES_TABLE} (user_id, created_at DESC)
                """
            )
        )


def _thread_row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row.get("id") or 0),
        "user_id": int(row.get("user_id") or 0),
        "fixture_id": int(row.get("fixture_id") or 0),
        "home_team_name": row.get("home_team_name"),
        "away_team_name": row.get("away_team_name"),
        "home_team_logo": row.get("home_team_logo"),
        "away_team_logo": row.get("away_team_logo"),
        "league_id": row.get("league_id"),
        "league_name": row.get("league_name"),
        "starting_at": _to_iso(row.get("starting_at")),
        "event_date": _to_iso(row.get("event_date")),
        "match_label": str(row.get("match_label") or ""),
        "last_message_at": _to_iso(row.get("last_message_at")),
        "created_at": _to_iso(row.get("created_at")),
        "updated_at": _to_iso(row.get("updated_at")),
        "last_message_role": row.get("last_message_role"),
        "last_message_content": row.get("last_message_content"),
    }


def _message_row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row.get("id") or 0),
        "thread_id": int(row.get("thread_id") or 0),
        "user_id": int(row.get("user_id") or 0),
        "role": str(row.get("role") or ""),
        "content_markdown": str(row.get("content_markdown") or ""),
        "meta": _json_load(row.get("meta_json"), None),
        "credit_charged": int(row.get("credit_charged") or 0),
        "created_at": _to_iso(row.get("created_at")),
    }


def upsert_chat_thread(
    settings: Settings,
    *,
    user_id: int,
    fixture_id: int,
    home_team_name: Optional[str] = None,
    away_team_name: Optional[str] = None,
    match_label: Optional[str] = None,
    last_message_at: Optional[datetime] = None,
) -> dict:
    engine = create_engine(settings.db_url)
    ensure_ai_chat_tables(engine)
    now_utc = _now_utc()
    safe_home = str(home_team_name or "").strip() or None
    safe_away = str(away_team_name or "").strip() or None
    safe_label = str(match_label or "").strip() or f"Fixture {int(fixture_id)}"
    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                INSERT INTO {AI_CHAT_THREADS_TABLE} (
                    user_id, fixture_id, home_team_name, away_team_name, match_label,
                    last_message_at, created_at, updated_at
                ) VALUES (
                    :user_id, :fixture_id, :home_team_name, :away_team_name, :match_label,
                    :last_message_at, :created_at, :updated_at
                )
                RETURNING id, user_id, fixture_id, home_team_name, away_team_name, match_label,
                          last_message_at, created_at, updated_at
                """
            ),
            {
                "user_id": int(user_id),
                "fixture_id": int(fixture_id),
                "home_team_name": safe_home,
                "away_team_name": safe_away,
                "match_label": safe_label,
                "last_message_at": last_message_at or now_utc,
                "created_at": now_utc,
                "updated_at": now_utc,
            },
        ).mappings().first()
    return _thread_row_to_payload(dict(row)) if row else {}


def get_latest_chat_thread_by_fixture(
    settings: Settings,
    *,
    user_id: int,
    fixture_id: int,
) -> Optional[dict]:
    engine = create_engine(settings.db_url)
    ensure_ai_chat_tables(engine)
    ensure_fixture_board_tables(engine)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                f"""
                SELECT t.id, t.user_id, t.fixture_id,
                       COALESCE(NULLIF(t.home_team_name, ''), f.home_team_name) AS home_team_name,
                       COALESCE(NULLIF(t.away_team_name, ''), f.away_team_name) AS away_team_name,
                       f.home_team_logo, f.away_team_logo,
                       f.league_id, f.league_name, f.starting_at, f.event_date,
                       t.match_label, t.last_message_at, t.created_at, t.updated_at
                FROM {AI_CHAT_THREADS_TABLE} t
                LEFT JOIN {FIXTURE_BOARD_CACHE_TABLE} f ON f.fixture_id = t.fixture_id
                WHERE t.user_id = :user_id
                  AND t.fixture_id = :fixture_id
                ORDER BY t.last_message_at DESC, t.id DESC
                LIMIT 1
                """
            ),
            {"user_id": int(user_id), "fixture_id": int(fixture_id)},
        ).mappings().first()
    if not row:
        return None
    return _thread_row_to_payload(dict(row))


def get_chat_thread_by_id(
    settings: Settings,
    *,
    thread_id: int,
    user_id: int,
) -> Optional[dict]:
    engine = create_engine(settings.db_url)
    ensure_ai_chat_tables(engine)
    ensure_fixture_board_tables(engine)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                f"""
                SELECT t.id, t.user_id, t.fixture_id,
                       COALESCE(NULLIF(t.home_team_name, ''), f.home_team_name) AS home_team_name,
                       COALESCE(NULLIF(t.away_team_name, ''), f.away_team_name) AS away_team_name,
                       f.home_team_logo, f.away_team_logo,
                       f.league_id, f.league_name, f.starting_at, f.event_date,
                       t.match_label, t.last_message_at, t.created_at, t.updated_at
                FROM {AI_CHAT_THREADS_TABLE} t
                LEFT JOIN {FIXTURE_BOARD_CACHE_TABLE} f ON f.fixture_id = t.fixture_id
                WHERE t.id = :thread_id
                  AND t.user_id = :user_id
                LIMIT 1
                """
            ),
            {"thread_id": int(thread_id), "user_id": int(user_id)},
        ).mappings().first()
    if not row:
        return None
    return _thread_row_to_payload(dict(row))


def list_chat_threads(
    settings: Settings,
    *,
    user_id: int,
    limit: int = 50,
) -> list[dict]:
    engine = create_engine(settings.db_url)
    ensure_ai_chat_tables(engine)
    ensure_fixture_board_tables(engine)
    safe_limit = max(1, min(int(limit), 200))
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT t.id, t.user_id, t.fixture_id,
                       COALESCE(NULLIF(t.home_team_name, ''), f.home_team_name) AS home_team_name,
                       COALESCE(NULLIF(t.away_team_name, ''), f.away_team_name) AS away_team_name,
                       f.home_team_logo, f.away_team_logo,
                       f.league_id, f.league_name, f.starting_at, f.event_date,
                       t.match_label, t.last_message_at, t.created_at, t.updated_at,
                       lm.role AS last_message_role,
                       lm.content_markdown AS last_message_content
                FROM {AI_CHAT_THREADS_TABLE} t
                LEFT JOIN {FIXTURE_BOARD_CACHE_TABLE} f ON f.fixture_id = t.fixture_id
                LEFT JOIN LATERAL (
                    SELECT role, content_markdown
                    FROM {AI_CHAT_MESSAGES_TABLE}
                    WHERE thread_id = t.id
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) lm ON TRUE
                WHERE t.user_id = :user_id
                ORDER BY t.last_message_at DESC, t.id DESC
                LIMIT :limit
                """
            ),
            {"user_id": int(user_id), "limit": safe_limit},
        ).mappings().all()
    return [_thread_row_to_payload(dict(row)) for row in rows]


def update_chat_thread_last_message(
    settings: Settings,
    *,
    thread_id: int,
    user_id: int,
    last_message_at: Optional[datetime] = None,
) -> bool:
    engine = create_engine(settings.db_url)
    ensure_ai_chat_tables(engine)
    now_utc = last_message_at or _now_utc()
    with engine.begin() as conn:
        result = conn.execute(
            text(
                f"""
                UPDATE {AI_CHAT_THREADS_TABLE}
                SET last_message_at = :last_message_at,
                    updated_at = :updated_at
                WHERE id = :thread_id
                  AND user_id = :user_id
                """
            ),
            {
                "thread_id": int(thread_id),
                "user_id": int(user_id),
                "last_message_at": now_utc,
                "updated_at": now_utc,
            },
        )
    return bool(result.rowcount)


def create_chat_message(
    settings: Settings,
    *,
    thread_id: int,
    user_id: int,
    role: str,
    content_markdown: str,
    meta: Optional[dict] = None,
    credit_charged: int = 0,
    created_at: Optional[datetime] = None,
) -> dict:
    safe_role = str(role or "").strip().lower()
    if safe_role not in {"user", "assistant"}:
        raise ValueError("role must be 'user' or 'assistant'")
    safe_content = str(content_markdown or "").strip()
    if not safe_content:
        raise ValueError("content_markdown is required")

    engine = create_engine(settings.db_url)
    ensure_ai_chat_tables(engine)
    now_utc = created_at or _now_utc()
    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                INSERT INTO {AI_CHAT_MESSAGES_TABLE} (
                    thread_id, user_id, role, content_markdown, meta_json, credit_charged, created_at
                ) VALUES (
                    :thread_id, :user_id, :role, :content_markdown, CAST(:meta_json AS JSONB), :credit_charged, :created_at
                )
                RETURNING id, thread_id, user_id, role, content_markdown, meta_json, credit_charged, created_at
                """
            ),
            {
                "thread_id": int(thread_id),
                "user_id": int(user_id),
                "role": safe_role,
                "content_markdown": safe_content,
                "meta_json": _json_dump(meta) if meta is not None else None,
                "credit_charged": max(0, int(credit_charged or 0)),
                "created_at": now_utc,
            },
        ).mappings().first()
    return _message_row_to_payload(dict(row)) if row else {}


def list_chat_messages(
    settings: Settings,
    *,
    thread_id: int,
    user_id: int,
    limit: int = 100,
    before_id: Optional[int] = None,
) -> list[dict]:
    engine = create_engine(settings.db_url)
    ensure_ai_chat_tables(engine)
    safe_limit = max(1, min(int(limit), 300))
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT m.id, m.thread_id, m.user_id, m.role, m.content_markdown, m.meta_json, m.credit_charged, m.created_at
                FROM {AI_CHAT_MESSAGES_TABLE} m
                INNER JOIN {AI_CHAT_THREADS_TABLE} t ON t.id = m.thread_id
                WHERE m.thread_id = :thread_id
                  AND t.user_id = :user_id
                  AND (:before_id IS NULL OR m.id < :before_id)
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT :limit
                """
            ),
            {
                "thread_id": int(thread_id),
                "user_id": int(user_id),
                "before_id": int(before_id) if before_id is not None else None,
                "limit": safe_limit,
            },
        ).mappings().all()
    payload = [_message_row_to_payload(dict(row)) for row in rows]
    payload.reverse()
    return payload


def search_chat_fixtures(
    settings: Settings,
    *,
    q: str = "",
    limit: int = 20,
) -> list[dict]:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)
    safe_limit = max(1, min(int(limit), 100))
    needle = str(q or "").strip().lower()
    like_value = f"%{needle}%"
    min_date = _now_utc().date() - timedelta(days=2)

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT fixture_id, league_id, league_name, event_date, starting_at, status, is_live,
                       home_team_name, away_team_name, home_team_logo, away_team_logo
                FROM {FIXTURE_BOARD_CACHE_TABLE}
                WHERE event_date >= :min_date
                  AND (
                    :needle = ''
                    OR LOWER(COALESCE(home_team_name, '')) LIKE :like_value
                    OR LOWER(COALESCE(away_team_name, '')) LIKE :like_value
                    OR LOWER(COALESCE(league_name, '')) LIKE :like_value
                  )
                ORDER BY event_date ASC, starting_at ASC, fixture_id ASC
                LIMIT :limit
                """
            ),
            {
                "min_date": min_date,
                "needle": needle,
                "like_value": like_value,
                "limit": safe_limit,
            },
        ).mappings().all()

    out: list[dict] = []
    for row in rows:
        home_name = str(row.get("home_team_name") or "").strip()
        away_name = str(row.get("away_team_name") or "").strip()
        out.append(
            {
                "fixture_id": int(row.get("fixture_id") or 0),
                "league_id": row.get("league_id"),
                "league_name": row.get("league_name"),
                "event_date": _to_iso(row.get("event_date")),
                "starting_at": _to_iso(row.get("starting_at")),
                "status": row.get("status"),
                "is_live": bool(row.get("is_live")),
                "home_team_name": home_name,
                "away_team_name": away_name,
                "home_team_logo": row.get("home_team_logo"),
                "away_team_logo": row.get("away_team_logo"),
                "match_label": f"{home_name} - {away_name}".strip(" -"),
            }
        )
    return out
