from __future__ import annotations

import json
import time
from datetime import date, datetime, timedelta, timezone
from itertools import combinations
from math import prod
from typing import Any, Callable, Dict, Iterable, Optional

from loguru import logger
from sqlalchemy import create_engine, text

from app.config import Settings, get_settings
from app.fixture_board import (
    FIXTURE_BOARD_CACHE_TABLE,
    ensure_fixture_board_tables,
    parse_fixture_cache_league_ids,
)
from modeling.simulate import simulate_fixture

COUPON_GENERATION_RUNS_TABLE = "coupon_generation_runs"
COUPON_LIBRARY_TABLE = "coupon_library"
DEFAULT_LANGUAGE = "tr"
MIN_COUPON_MATCHES = 3
MAX_SWAP_ATTEMPTS = 20

RISK_PROFILES: dict[str, dict[str, Any]] = {
    "low": {
        "label": "Dusuk Riskli Kupon",
        "odd_min": 1.15,
        "odd_max": 1.75,
        "prob_min": 0.52,
        "edge_min": 0.04,
        "target_total_min": 2.0,
        "target_total_max": 4.0,
    },
    "medium": {
        "label": "Orta Riskli Kupon",
        "odd_min": 1.65,
        "odd_max": 2.70,
        "prob_min": 0.43,
        "edge_min": 0.02,
        "target_total_min": 4.0,
        "target_total_max": 8.0,
    },
    "high": {
        "label": "Cok Riskli Kupon",
        "odd_min": 2.40,
        "odd_max": 6.00,
        "prob_min": 0.32,
        "edge_min": -0.01,
        "target_total_min": 8.0,
        "target_total_max": 20.0,
    },
}

FALLBACK_LEVELS = (
    {"odd_expand": 0.0, "prob_drop": 0.0},
    {"odd_expand": 0.20, "prob_drop": 0.03},
    {"odd_expand": 0.40, "prob_drop": 0.06},
)

LOW_SAFETY_LEVELS = (
    {"odd_min": 1.10, "odd_max": 2.15, "prob_min": 0.46, "edge_min": -0.10},
    {"odd_min": 1.10, "odd_max": 2.30, "prob_min": 0.44, "edge_min": -0.20},
    {"odd_min": 1.10, "odd_max": 2.40, "prob_min": 0.42, "edge_min": -1.00},
)

MATH_SINGLE_RANGE = (1.35, 1.65)
MATH_DOUBLE_RANGE = (1.90, 2.40)
MATH_MIX_SINGLE_RANGE = (1.35, 1.60)
MATH_MIX_DOUBLE_RANGE = (1.90, 2.30)
MATH_MIX_SHOT_RANGE = (3.00, 4.00)
MATH_SINGLE_FALLBACK_RANGE = (1.80, 3.20)
MATH_DOUBLE_FALLBACK_RANGE = (3.20, 8.00)
MATH_MIX_SINGLE_FALLBACK_RANGE = (1.80, 3.20)
MATH_MIX_DOUBLE_FALLBACK_RANGE = (3.20, 8.00)
MATH_MIX_SHOT_FALLBACK_RANGE = (6.00, 14.00)
MATH_EDGE_MIN = 0.00
MIN_BANKROLL_TL = 100.0
DEFAULT_BANKROLL_TL = 1000.0
MIX_STAKE_PCT = 0.05

ProgressCallback = Optional[Callable[[int, str, Dict[str, object]], None]]


def _emit_progress(
    progress_cb: ProgressCallback,
    progress: float,
    stage: str,
    extra: Optional[Dict[str, object]] = None,
) -> None:
    if progress_cb is None:
        return
    payload: Dict[str, object] = {"progress": max(0, min(100, int(progress))), "stage": stage}
    if extra:
        payload.update(extra)
    progress_cb(int(payload["progress"]), stage, payload)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip().replace(",", ".")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    text_value = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text_value)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def ensure_coupon_generation_runs_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {COUPON_GENERATION_RUNS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    task_id TEXT UNIQUE,
                    user_id BIGINT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'queued',
                    request_json JSONB NOT NULL,
                    result_json JSONB,
                    credit_charged INT NOT NULL DEFAULT 0,
                    credit_refunded BOOLEAN NOT NULL DEFAULT FALSE,
                    error TEXT,
                    started_at TIMESTAMPTZ,
                    finished_at TIMESTAMPTZ,
                    expires_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_coupon_runs_user_created
                ON {COUPON_GENERATION_RUNS_TABLE} (user_id, created_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_coupon_runs_task_id
                ON {COUPON_GENERATION_RUNS_TABLE} (task_id)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_coupon_runs_expires_at
                ON {COUPON_GENERATION_RUNS_TABLE} (expires_at)
                """
            )
        )


def ensure_coupon_library_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {COUPON_LIBRARY_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    risk_level TEXT,
                    source_task_id TEXT,
                    items_json JSONB NOT NULL,
                    summary_json JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    archived_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_coupon_library_user_status_created
                ON {COUPON_LIBRARY_TABLE} (user_id, status, created_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_coupon_library_user_created
                ON {COUPON_LIBRARY_TABLE} (user_id, created_at DESC)
                """
            )
        )


def cleanup_expired_coupon_runs(settings: Settings) -> int:
    engine = create_engine(settings.db_url)
    ensure_coupon_generation_runs_table(engine)
    with engine.begin() as conn:
        deleted = conn.execute(
            text(
                f"""
                DELETE FROM {COUPON_GENERATION_RUNS_TABLE}
                WHERE expires_at < :now_utc
                """
            ),
            {"now_utc": _now_utc()},
        )
    return int(deleted.rowcount or 0)


def create_saved_coupon(
    settings: Settings,
    *,
    user_id: int,
    name: str,
    items: list[dict],
    summary: dict,
    risk_level: Optional[str] = None,
    source_task_id: Optional[str] = None,
) -> dict:
    engine = create_engine(settings.db_url)
    ensure_coupon_library_table(engine)
    now_utc = _now_utc()
    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                INSERT INTO {COUPON_LIBRARY_TABLE} (
                    user_id, name, status, risk_level, source_task_id,
                    items_json, summary_json, created_at, updated_at, archived_at
                ) VALUES (
                    :user_id, :name, 'active', :risk_level, :source_task_id,
                    CAST(:items_json AS JSONB), CAST(:summary_json AS JSONB), :created_at, :updated_at, NULL
                )
                RETURNING id, user_id, name, status, risk_level, source_task_id,
                          items_json, summary_json, created_at, updated_at, archived_at
                """
            ),
            {
                "user_id": int(user_id),
                "name": str(name or "").strip() or "Kupon",
                "risk_level": (str(risk_level).strip().lower() if risk_level is not None else None),
                "source_task_id": (str(source_task_id).strip() if source_task_id else None),
                "items_json": _json_dump(items),
                "summary_json": _json_dump(summary),
                "created_at": now_utc,
                "updated_at": now_utc,
            },
        ).mappings().first()
    return dict(row) if row else {}


def list_saved_coupons(
    settings: Settings,
    *,
    user_id: int,
    status: str = "active",
    limit: int = 50,
) -> list[dict]:
    engine = create_engine(settings.db_url)
    ensure_coupon_library_table(engine)
    safe_status = "archived" if str(status or "").strip().lower() == "archived" else "active"
    safe_limit = max(1, min(int(limit), 200))
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT id, user_id, name, status, risk_level, source_task_id,
                       items_json, summary_json, created_at, updated_at, archived_at
                FROM {COUPON_LIBRARY_TABLE}
                WHERE user_id = :user_id
                  AND status = :status
                ORDER BY created_at DESC, id DESC
                LIMIT :limit
                """
            ),
            {"user_id": int(user_id), "status": safe_status, "limit": safe_limit},
        ).mappings().all()
    return [dict(row) for row in rows]


def update_saved_coupon_name(
    settings: Settings,
    *,
    user_id: int,
    coupon_id: int,
    name: str,
) -> dict:
    engine = create_engine(settings.db_url)
    ensure_coupon_library_table(engine)
    now_utc = _now_utc()
    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE {COUPON_LIBRARY_TABLE}
                SET name = :name,
                    updated_at = :updated_at
                WHERE id = :coupon_id
                  AND user_id = :user_id
                RETURNING id, user_id, name, status, risk_level, source_task_id,
                          items_json, summary_json, created_at, updated_at, archived_at
                """
            ),
            {
                "name": str(name or "").strip() or "Kupon",
                "updated_at": now_utc,
                "coupon_id": int(coupon_id),
                "user_id": int(user_id),
            },
        ).mappings().first()
    return dict(row) if row else {}


def set_saved_coupon_status(
    settings: Settings,
    *,
    user_id: int,
    coupon_id: int,
    status: str,
) -> bool:
    engine = create_engine(settings.db_url)
    ensure_coupon_library_table(engine)
    target = "archived" if str(status or "").strip().lower() == "archived" else "active"
    now_utc = _now_utc()
    if target == "archived":
        query = text(
            f"""
            UPDATE {COUPON_LIBRARY_TABLE}
            SET status = :status,
                archived_at = :archived_at,
                updated_at = :updated_at
            WHERE id = :coupon_id
              AND user_id = :user_id
            """
        )
        params = {
            "status": target,
            "archived_at": now_utc,
            "updated_at": now_utc,
            "coupon_id": int(coupon_id),
            "user_id": int(user_id),
        }
    else:
        query = text(
            f"""
            UPDATE {COUPON_LIBRARY_TABLE}
            SET status = :status,
                archived_at = NULL,
                updated_at = :updated_at
            WHERE id = :coupon_id
              AND user_id = :user_id
            """
        )
        params = {
            "status": target,
            "updated_at": now_utc,
            "coupon_id": int(coupon_id),
            "user_id": int(user_id),
        }
    with engine.begin() as conn:
        result = conn.execute(query, params)
    return bool(result.rowcount)


def delete_saved_coupon(settings: Settings, *, user_id: int, coupon_id: int) -> bool:
    engine = create_engine(settings.db_url)
    ensure_coupon_library_table(engine)
    with engine.begin() as conn:
        result = conn.execute(
            text(
                f"""
                DELETE FROM {COUPON_LIBRARY_TABLE}
                WHERE id = :coupon_id
                  AND user_id = :user_id
                """
            ),
            {"coupon_id": int(coupon_id), "user_id": int(user_id)},
        )
    return bool(result.rowcount)


def create_coupon_run(
    settings: Settings,
    *,
    user_id: int,
    request_payload: dict,
    credit_charged: int,
) -> dict:
    engine = create_engine(settings.db_url)
    ensure_coupon_generation_runs_table(engine)
    now_utc = _now_utc()
    expires_at = now_utc + timedelta(hours=max(1, int(settings.coupon_generation_run_ttl_hours)))
    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                INSERT INTO {COUPON_GENERATION_RUNS_TABLE} (
                    user_id, status, request_json, credit_charged, expires_at, created_at, updated_at
                ) VALUES (
                    :user_id, 'queued', CAST(:request_json AS JSONB), :credit_charged, :expires_at, :created_at, :updated_at
                )
                RETURNING id, status, expires_at
                """
            ),
            {
                "user_id": int(user_id),
                "request_json": _json_dump(request_payload),
                "credit_charged": int(credit_charged),
                "expires_at": expires_at,
                "created_at": now_utc,
                "updated_at": now_utc,
            },
        ).mappings().first()
    return dict(row) if row else {}


def set_coupon_run_task_id(settings: Settings, *, run_id: int, task_id: str) -> None:
    engine = create_engine(settings.db_url)
    ensure_coupon_generation_runs_table(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                UPDATE {COUPON_GENERATION_RUNS_TABLE}
                SET task_id = :task_id,
                    updated_at = :updated_at
                WHERE id = :run_id
                """
            ),
            {"run_id": int(run_id), "task_id": str(task_id), "updated_at": _now_utc()},
        )


def load_coupon_run_by_task(settings: Settings, *, task_id: str, user_id: Optional[int] = None) -> Optional[dict]:
    engine = create_engine(settings.db_url)
    ensure_coupon_generation_runs_table(engine)
    where = "task_id = :task_id"
    params: dict[str, Any] = {"task_id": str(task_id)}
    if user_id is not None:
        where += " AND user_id = :user_id"
        params["user_id"] = int(user_id)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                f"""
                SELECT id, task_id, user_id, status, request_json, result_json, credit_charged, credit_refunded,
                       error, started_at, finished_at, expires_at, created_at, updated_at
                FROM {COUPON_GENERATION_RUNS_TABLE}
                WHERE {where}
                LIMIT 1
                """
            ),
            params,
        ).mappings().first()
    return dict(row) if row else None


def load_coupon_run_by_id(settings: Settings, *, run_id: int) -> Optional[dict]:
    engine = create_engine(settings.db_url)
    ensure_coupon_generation_runs_table(engine)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                f"""
                SELECT id, task_id, user_id, status, request_json, result_json, credit_charged, credit_refunded,
                       error, started_at, finished_at, expires_at, created_at, updated_at
                FROM {COUPON_GENERATION_RUNS_TABLE}
                WHERE id = :run_id
                LIMIT 1
                """
            ),
            {"run_id": int(run_id)},
        ).mappings().first()
    return dict(row) if row else None


def set_coupon_run_status(
    settings: Settings,
    *,
    run_id: int,
    status: str,
    result_json: Optional[dict] = None,
    error: Optional[str] = None,
    started_at: Optional[datetime] = None,
    finished_at: Optional[datetime] = None,
) -> None:
    engine = create_engine(settings.db_url)
    ensure_coupon_generation_runs_table(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                UPDATE {COUPON_GENERATION_RUNS_TABLE}
                SET status = :status,
                    result_json = CASE
                        WHEN :result_json IS NULL THEN result_json
                        ELSE CAST(:result_json AS JSONB)
                    END,
                    error = :error,
                    started_at = COALESCE(:started_at, started_at),
                    finished_at = :finished_at,
                    updated_at = :updated_at
                WHERE id = :run_id
                """
            ),
            {
                "run_id": int(run_id),
                "status": str(status),
                "result_json": _json_dump(result_json) if result_json is not None else None,
                "error": error,
                "started_at": started_at,
                "finished_at": finished_at,
                "updated_at": _now_utc(),
            },
        )


def _outcomes_to_selection(outcomes: dict[str, Any]) -> tuple[Optional[str], float]:
    mapping = {
        "1": _safe_float(outcomes.get("home_win")) or 0.0,
        "0": _safe_float(outcomes.get("draw")) or 0.0,
        "2": _safe_float(outcomes.get("away_win")) or 0.0,
    }
    if not mapping:
        return None, 0.0
    selection = max(mapping, key=lambda key: mapping[key])
    return selection, float(mapping.get(selection) or 0.0)


def _selection_model_prob(outcomes: dict[str, Any], selection: str) -> float:
    if selection == "1":
        return float(_safe_float(outcomes.get("home_win")) or 0.0)
    if selection == "0":
        return float(_safe_float(outcomes.get("draw")) or 0.0)
    if selection == "2":
        return float(_safe_float(outcomes.get("away_win")) or 0.0)
    return 0.0


def _normalize_market_implied(market: dict[str, Any]) -> Optional[dict[str, float]]:
    odd_1 = _safe_float(market.get("1"))
    odd_0 = _safe_float(market.get("0"))
    odd_2 = _safe_float(market.get("2"))
    if not odd_1 or not odd_0 or not odd_2:
        return None
    if odd_1 <= 1.0 or odd_0 <= 1.0 or odd_2 <= 1.0:
        return None
    raw_1 = 1.0 / odd_1
    raw_0 = 1.0 / odd_0
    raw_2 = 1.0 / odd_2
    total = raw_1 + raw_0 + raw_2
    if total <= 0:
        return None
    return {
        "1": raw_1 / total,
        "0": raw_0 / total,
        "2": raw_2 / total,
    }


def _parse_match_result_market(value: Any) -> Optional[dict[str, float]]:
    payload = _json_load(value, {})
    if not isinstance(payload, dict):
        return None
    out = {
        "1": _safe_float(payload.get("1")),
        "0": _safe_float(payload.get("0")),
        "2": _safe_float(payload.get("2")),
    }
    if not out["1"] or not out["0"] or not out["2"]:
        return None
    if out["1"] <= 1.0 or out["0"] <= 1.0 or out["2"] <= 1.0:
        return None
    return {key: float(val) for key, val in out.items() if val is not None}


def _load_fixture_candidates(
    settings: Settings,
    *,
    date_from: date,
    date_to: date,
    league_ids: list[int],
) -> list[dict]:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)
    now_utc = _now_utc()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT fixture_id, league_id, league_name, event_date, starting_at,
                       home_team_id, away_team_id, home_team_name, away_team_name,
                       home_team_logo, away_team_logo, market_match_result_json
                FROM {FIXTURE_BOARD_CACHE_TABLE}
                WHERE event_date >= :date_from
                  AND event_date <= :date_to
                  AND league_id = ANY(:league_ids)
                  AND starting_at >= :now_utc
                ORDER BY event_date ASC, starting_at ASC, fixture_id ASC
                """
            ),
            {"date_from": date_from, "date_to": date_to, "league_ids": league_ids, "now_utc": now_utc},
        ).mappings().all()
    return [dict(row) for row in rows]


def _range_distance(value: float, min_value: float, max_value: float) -> float:
    if min_value <= value <= max_value:
        return 0.0
    if value < min_value:
        return min_value - value
    return value - max_value


def _coupon_total(matches: list[dict]) -> float:
    odds = [float(item.get("odd") or 1.0) for item in matches]
    if not odds:
        return 0.0
    return float(prod(odds))


def _build_simulation_summary(simulation: dict[str, Any], selection: str, odd: float, edge: float, market_prob: float, model_prob: float) -> dict:
    return {
        "fixture_id": int(simulation.get("fixture_id")),
        "selection": selection,
        "odd": float(round(odd, 2)),
        "edge": float(round(edge, 4)),
        "market_prob": float(round(market_prob, 4)),
        "model_prob": float(round(model_prob, 4)),
        "match": simulation.get("match"),
        "model": simulation.get("model"),
        "lambda_home": simulation.get("lambda_home"),
        "lambda_away": simulation.get("lambda_away"),
        "outcomes": simulation.get("outcomes") or {},
        "top_scorelines": (simulation.get("top_scorelines") or [])[:5],
        "key_drivers": simulation.get("key_drivers") or [],
    }


def _candidate_sort_key(profile_name: str, row: dict) -> tuple:
    start_dt = _parse_datetime(row.get("starting_at")) or datetime(2100, 1, 1, tzinfo=timezone.utc)
    odd_value = float(row.get("odd") or 1.0)
    model_prob = float(row.get("model_prob") or 0.0)
    edge = float(row.get("edge") or 0.0)
    if profile_name == "low":
        return (-model_prob, -edge, odd_value, start_dt)
    if profile_name == "medium":
        return (-edge, -model_prob, abs(odd_value - 2.2), start_dt)
    return (-odd_value, -edge, -model_prob, start_dt)


def _low_safety_sort_key(row: dict) -> tuple:
    start_dt = _parse_datetime(row.get("starting_at")) or datetime(2100, 1, 1, tzinfo=timezone.utc)
    odd_value = float(row.get("odd") or 1.0)
    model_prob = float(row.get("model_prob") or 0.0)
    edge = float(row.get("edge") or 0.0)
    return (abs(odd_value - 1.45), -model_prob, -edge, start_dt)


def _selection_is_market_favorite_or_close(
    market_match_result: Any,
    selection: str,
    *,
    tolerance: float = 0.12,
) -> bool:
    if selection not in {"1", "0", "2"}:
        return False
    market = _json_load(market_match_result, {})
    if not isinstance(market, dict):
        return False
    odds: dict[str, float] = {}
    for key in ("1", "0", "2"):
        odd = _safe_float(market.get(key))
        if not odd or odd <= 1.0:
            return False
        odds[key] = float(odd)
    selected_odd = odds.get(selection)
    if not selected_odd:
        return False
    favorite_odd = min(odds.values())
    if selected_odd <= favorite_odd + 1e-9:
        return True
    rel_gap = (selected_odd - favorite_odd) / favorite_odd
    return rel_gap <= max(0.0, float(tolerance))


def _select_coupon_for_profile(
    *,
    profile_name: str,
    candidates: list[dict],
    used_fixture_ids: set[int],
    matches_per_coupon: int,
) -> dict:
    profile = RISK_PROFILES[profile_name]
    warnings: list[str] = []
    filtered: list[dict] = []
    fallback_used = 0
    selection_policy = "strict"
    safety_level_used: Optional[int] = None
    strict_candidate_count = 0
    safety_candidate_count = 0

    for idx, level in enumerate(FALLBACK_LEVELS):
        fallback_used = idx
        odd_min = profile["odd_min"] - level["odd_expand"]
        odd_max = profile["odd_max"] + level["odd_expand"]
        prob_min = profile["prob_min"] - level["prob_drop"]
        edge_min = profile["edge_min"]
        filtered = [
            item
            for item in candidates
            if int(item["fixture_id"]) not in used_fixture_ids
            and odd_min <= float(item["odd"]) <= odd_max
            and float(item["model_prob"]) >= prob_min
            and float(item["edge"]) >= edge_min
        ]
        if len(filtered) >= MIN_COUPON_MATCHES:
            break
    strict_candidate_count = len(filtered)

    if fallback_used > 0:
        warnings.append(f"Risk filtresi fallback turu kullanildi (tur {fallback_used}).")

    filtered.sort(key=lambda item: _candidate_sort_key(profile_name, item))
    picks = filtered[: max(MIN_COUPON_MATCHES, int(matches_per_coupon))]
    picks = picks[: int(matches_per_coupon)]

    if len(picks) < MIN_COUPON_MATCHES and profile_name == "low":
        safety_filtered: list[dict] = []
        for idx, level in enumerate(LOW_SAFETY_LEVELS):
            safety_filtered = [
                item
                for item in candidates
                if int(item["fixture_id"]) not in used_fixture_ids
                and float(level["odd_min"]) <= float(item["odd"]) <= float(level["odd_max"])
                and float(item["model_prob"]) >= float(level["prob_min"])
                and float(item["edge"]) >= float(level["edge_min"])
                and _selection_is_market_favorite_or_close(
                    item.get("market_match_result"),
                    str(item.get("selection") or ""),
                    tolerance=0.12,
                )
            ]
            safety_candidate_count = len(safety_filtered)
            if safety_candidate_count >= MIN_COUPON_MATCHES:
                safety_level_used = idx
                selection_policy = "safety_fallback"
                warnings.append("Dusuk risk kuponu guvenli fallback ile tamamlandi.")
                break
        if selection_policy == "safety_fallback":
            safety_filtered.sort(key=_low_safety_sort_key)
            picks = safety_filtered[: max(MIN_COUPON_MATCHES, int(matches_per_coupon))]
            picks = picks[: int(matches_per_coupon)]

    if len(picks) < MIN_COUPON_MATCHES:
        return {
            "risk": profile_name,
            "label": profile["label"],
            "target_total_odds": {"min": profile["target_total_min"], "max": profile["target_total_max"]},
            "total_odds": None,
            "within_target": False,
            "unavailable": True,
            "selection_policy": selection_policy,
            "safety_level_used": safety_level_used,
            "candidate_counts": {
                "strict_count": int(strict_candidate_count),
                "safety_count": int(safety_candidate_count),
            },
            "warnings": warnings + ["Yeterli aday mac bulunamadi."],
            "matches": [],
        }

    def _try_swap(picks_rows: list[dict], pool_rows: list[dict]) -> list[dict]:
        current = list(picks_rows)
        for _ in range(MAX_SWAP_ATTEMPTS):
            current_total = _coupon_total(current)
            current_distance = _range_distance(
                current_total,
                float(profile["target_total_min"]),
                float(profile["target_total_max"]),
            )
            if current_distance <= 0.0001:
                break
            best = None
            best_distance = current_distance
            current_ids = {int(item["fixture_id"]) for item in current}
            for idx_pick, pick_item in enumerate(current):
                for cand in pool_rows:
                    cand_id = int(cand["fixture_id"])
                    if cand_id in current_ids:
                        continue
                    next_total = current_total / float(pick_item["odd"]) * float(cand["odd"])
                    next_distance = _range_distance(
                        next_total,
                        float(profile["target_total_min"]),
                        float(profile["target_total_max"]),
                    )
                    if next_distance + 1e-9 < best_distance:
                        best_distance = next_distance
                        best = (idx_pick, cand)
            if best is None:
                break
            idx_pick, cand = best
            current[idx_pick] = cand
        return current

    picks = _try_swap(picks, filtered)
    total_odds = round(_coupon_total(picks), 2)
    within_target = profile["target_total_min"] <= total_odds <= profile["target_total_max"]
    if not within_target:
        warnings.append("Hedef toplam oran araligina tam oturmedi.")

    used_fixture_ids.update(int(item["fixture_id"]) for item in picks)
    return {
        "risk": profile_name,
        "label": profile["label"],
        "target_total_odds": {"min": profile["target_total_min"], "max": profile["target_total_max"]},
        "total_odds": total_odds,
        "within_target": within_target,
        "unavailable": False,
        "selection_policy": selection_policy,
        "safety_level_used": safety_level_used,
        "candidate_counts": {
            "strict_count": int(strict_candidate_count),
            "safety_count": int(safety_candidate_count),
        },
        "warnings": warnings,
        "matches": picks,
    }


def _round_to_step(value: float, *, step: float = 10.0, minimum: float = 10.0) -> float:
    safe_step = max(1.0, float(step))
    rounded = round(max(0.0, float(value)) / safe_step) * safe_step
    return float(round(max(float(minimum), rounded), 2))


def _normalize_bankroll_tl(value: Any) -> float:
    parsed = _safe_float(value)
    if parsed is None or parsed < MIN_BANKROLL_TL:
        return DEFAULT_BANKROLL_TL
    return float(parsed)


def _math_time_budget_exceeded(started_monotonic: float, time_budget_seconds: float) -> bool:
    if time_budget_seconds <= 0:
        return False
    return (time.monotonic() - started_monotonic) >= time_budget_seconds


def _compact_coupon_match(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "fixture_id": int(_safe_int(row.get("fixture_id")) or 0),
        "league_id": _safe_int(row.get("league_id")),
        "league_name": row.get("league_name"),
        "starting_at": row.get("starting_at"),
        "home_team_name": row.get("home_team_name"),
        "away_team_name": row.get("away_team_name"),
        "selection": str(row.get("selection") or ""),
        "odd": float(round(float(row.get("odd") or 1.0), 2)),
        "edge": float(round(float(row.get("edge") or 0.0), 4)),
        "market_prob": float(round(float(row.get("market_prob") or 0.0), 4)),
        "model_prob": float(round(float(row.get("model_prob") or 0.0), 4)),
        "model_id": row.get("model_id"),
        "model_name": row.get("model_name"),
        "model_selection_mode": row.get("model_selection_mode"),
        "home_team_logo": row.get("home_team_logo"),
        "away_team_logo": row.get("away_team_logo"),
    }


def _build_math_coupon_item(
    *,
    coupon_id: str,
    matches: list[dict[str, Any]],
    suggested_stake_tl: float,
) -> dict[str, Any]:
    compact_matches = [_compact_coupon_match(match) for match in matches]
    total_odds = float(round(_coupon_total(compact_matches), 2))
    edge_sum = float(round(sum(float(item.get("edge") or 0.0) for item in compact_matches), 4))
    expected_value_score = float(round(float(suggested_stake_tl) * edge_sum, 4))
    return {
        "coupon_id": str(coupon_id),
        "matches": compact_matches,
        "total_odds": total_odds,
        "edge_sum": edge_sum,
        "suggested_stake_tl": float(round(float(suggested_stake_tl), 2)),
        "expected_value_score": expected_value_score,
    }


def _empty_math_coupons_payload(bankroll_tl: float, *, include_math_coupons: bool = True, warning: Optional[str] = None) -> dict:
    single_stake_min = float(round(bankroll_tl * 0.03, 2))
    single_stake_max = float(round(bankroll_tl * 0.06, 2))
    double_stake_min = float(round(bankroll_tl * 0.04, 2))
    double_stake_max = float(round(bankroll_tl * 0.07, 2))
    default_stake = _round_to_step(bankroll_tl * MIX_STAKE_PCT, step=10.0, minimum=10.0)
    warnings = [warning] if warning else []
    if not include_math_coupons:
        warnings.append("Matematiksel kupon uretimi devre disi birakildi.")
    return {
        "summary": {
            "bankroll_tl": float(round(bankroll_tl, 2)),
            "include_math_coupons": bool(include_math_coupons),
            "generated_counts": {
                "single_low_mid": 0,
                "double_system": 0,
                "mix_single": 0,
                "mix_double": 0,
                "mix_shot": 0,
            },
            "warnings": warnings,
        },
        "single_low_mid": {
            "target_odds_range": {"min": MATH_SINGLE_RANGE[0], "max": MATH_SINGLE_RANGE[1]},
            "stake_pct_range": {"min": 0.03, "max": 0.06},
            "stake_tl_range": {"min": single_stake_min, "max": single_stake_max},
            "suggested_stake_tl": default_stake,
            "items": [],
            "warnings": [],
        },
        "double_system": {
            "target_odds_range": {"min": MATH_DOUBLE_RANGE[0], "max": MATH_DOUBLE_RANGE[1]},
            "stake_pct_range": {"min": 0.04, "max": 0.07},
            "stake_tl_range": {"min": double_stake_min, "max": double_stake_max},
            "suggested_stake_tl": default_stake,
            "items": [],
            "warnings": [],
        },
        "mix_portfolio": {
            "allocation": {"single_pct": 0.70, "double_pct": 0.25, "shot_pct": 0.05},
            "bankroll_tl": float(round(bankroll_tl, 2)),
            "warnings": [],
            "baskets": {
                "single": {
                    "target_odds_range": {"min": MATH_MIX_SINGLE_RANGE[0], "max": MATH_MIX_SINGLE_RANGE[1]},
                    "allocation_tl": float(round(bankroll_tl * 0.70, 2)),
                    "stake_tl": default_stake,
                    "planned_count": 0,
                    "generated_count": 0,
                    "items": [],
                },
                "double": {
                    "target_odds_range": {"min": MATH_MIX_DOUBLE_RANGE[0], "max": MATH_MIX_DOUBLE_RANGE[1]},
                    "allocation_tl": float(round(bankroll_tl * 0.25, 2)),
                    "stake_tl": default_stake,
                    "planned_count": 0,
                    "generated_count": 0,
                    "items": [],
                },
                "shot": {
                    "target_odds_range": {"min": MATH_MIX_SHOT_RANGE[0], "max": MATH_MIX_SHOT_RANGE[1]},
                    "allocation_tl": float(round(bankroll_tl * 0.05, 2)),
                    "stake_tl": default_stake,
                    "planned_count": 0,
                    "generated_count": 0,
                    "items": [],
                },
            },
        },
    }


def _math_candidate_sort_key(row: dict[str, Any]) -> tuple:
    start_dt = _parse_datetime(row.get("starting_at")) or datetime(2100, 1, 1, tzinfo=timezone.utc)
    return (
        -float(row.get("edge") or 0.0),
        -float(row.get("model_prob") or 0.0),
        float(row.get("odd") or 10.0),
        start_dt,
    )


def _collect_double_rows(
    *,
    pool: list[dict[str, Any]],
    min_total_odds: float,
    max_total_odds: float,
    target_total_odds: float,
    started_monotonic: float,
    time_budget_seconds: float,
) -> tuple[list[tuple[float, float, list[dict[str, Any]]]], bool]:
    rows: list[tuple[float, float, list[dict[str, Any]]]] = []
    timed_out = False
    for left, right in combinations(pool, 2):
        if _math_time_budget_exceeded(started_monotonic, time_budget_seconds):
            timed_out = True
            break
        total_odds = float(left.get("odd") or 1.0) * float(right.get("odd") or 1.0)
        if not (float(min_total_odds) <= total_odds <= float(max_total_odds)):
            continue
        edge_sum = float(left.get("edge") or 0.0) + float(right.get("edge") or 0.0)
        if edge_sum <= 0.0:
            continue
        rows.append((edge_sum, abs(total_odds - float(target_total_odds)), [left, right]))
    rows.sort(key=lambda row: (-row[0], row[1]))
    return rows, timed_out


def _build_math_coupons(
    *,
    candidates: list[dict[str, Any]],
    bankroll_tl: float,
    include_math_coupons: bool,
    started_monotonic: float,
    time_budget_seconds: float,
) -> dict:
    payload = _empty_math_coupons_payload(bankroll_tl, include_math_coupons=include_math_coupons)
    if not include_math_coupons:
        return payload

    positive_candidates = [
        row
        for row in candidates
        if float(row.get("edge") or 0.0) > MATH_EDGE_MIN and float(row.get("odd") or 1.0) > 1.0
    ]
    positive_candidates.sort(key=_math_candidate_sort_key)
    if not positive_candidates:
        payload["summary"]["warnings"].append("edge > 0 kosulunu saglayan aday bulunamadi.")
        return payload

    single_stake = _round_to_step(bankroll_tl * MIX_STAKE_PCT, step=10.0, minimum=10.0)
    double_stake = _round_to_step(bankroll_tl * MIX_STAKE_PCT, step=10.0, minimum=10.0)
    shot_stake = _round_to_step(bankroll_tl * MIX_STAKE_PCT, step=10.0, minimum=10.0)
    payload["single_low_mid"]["suggested_stake_tl"] = single_stake
    payload["double_system"]["suggested_stake_tl"] = double_stake

    single_candidates = [
        row
        for row in positive_candidates
        if MATH_SINGLE_RANGE[0] <= float(row.get("odd") or 0.0) <= MATH_SINGLE_RANGE[1]
    ]
    if not single_candidates:
        single_candidates = [
            row
            for row in positive_candidates
            if MATH_SINGLE_FALLBACK_RANGE[0] <= float(row.get("odd") or 0.0) <= MATH_SINGLE_FALLBACK_RANGE[1]
        ]
        if single_candidates:
            payload["single_low_mid"]["warnings"].append(
                "Tekli stratejide hedef oran araliginda aday yok; esnek +EV araligi kullanildi."
            )
    single_items: list[dict[str, Any]] = []
    for index, row in enumerate(single_candidates, start=1):
        if _math_time_budget_exceeded(started_monotonic, time_budget_seconds):
            payload["single_low_mid"]["warnings"].append(
                "Sure limitine yaklasildigi icin tekli kuponlar kismi olarak donduruldu."
            )
            break
        single_items.append(
            _build_math_coupon_item(
                coupon_id=f"single-{index}",
                matches=[row],
                suggested_stake_tl=single_stake,
            )
        )
    payload["single_low_mid"]["items"] = single_items
    if not single_items:
        payload["single_low_mid"]["warnings"].append("Tekli strateji icin uygun aday bulunamadi.")

    double_pool = [
        row
        for row in positive_candidates
        if 1.05 <= float(row.get("odd") or 0.0) <= 4.50
    ]
    double_rows, double_timed_out = _collect_double_rows(
        pool=double_pool,
        min_total_odds=MATH_DOUBLE_RANGE[0],
        max_total_odds=MATH_DOUBLE_RANGE[1],
        target_total_odds=2.15,
        started_monotonic=started_monotonic,
        time_budget_seconds=time_budget_seconds,
    )
    if double_timed_out:
        payload["double_system"]["warnings"].append("Sure limitine yaklasildigi icin 2'li sistem kismi olarak donduruldu.")
    if not double_rows:
        double_rows, double_timed_out_fallback = _collect_double_rows(
            pool=double_pool,
            min_total_odds=MATH_DOUBLE_FALLBACK_RANGE[0],
            max_total_odds=MATH_DOUBLE_FALLBACK_RANGE[1],
            target_total_odds=4.80,
            started_monotonic=started_monotonic,
            time_budget_seconds=time_budget_seconds,
        )
        if double_timed_out_fallback:
            payload["double_system"]["warnings"].append("Sure limitine yaklasildigi icin 2'li sistem fallback kismi donduruldu.")
        if double_rows:
            payload["double_system"]["warnings"].append(
                "2'li sistemde hedef oran araliginda aday yok; esnek +EV toplam oran araligi kullanildi."
            )
    payload["double_system"]["items"] = [
        _build_math_coupon_item(coupon_id=f"double-{index}", matches=row[2], suggested_stake_tl=double_stake)
        for index, row in enumerate(double_rows, start=1)
    ]
    if not payload["double_system"]["items"]:
        payload["double_system"]["warnings"].append("2'li sistem strateji icin uygun aday bulunamadi.")

    mix_warnings: list[str] = []
    mix_single_allocation = float(round(bankroll_tl * 0.70, 2))
    mix_double_allocation = float(round(bankroll_tl * 0.25, 2))
    mix_shot_allocation = float(round(bankroll_tl * 0.05, 2))

    mix_single_count = int(mix_single_allocation // max(1.0, single_stake))
    mix_double_count = int(mix_double_allocation // max(1.0, double_stake))
    mix_shot_count = 1 if mix_shot_allocation >= shot_stake else 0

    mix_single_candidates = [
        row
        for row in positive_candidates
        if MATH_MIX_SINGLE_RANGE[0] <= float(row.get("odd") or 0.0) <= MATH_MIX_SINGLE_RANGE[1]
    ]
    if not mix_single_candidates:
        mix_single_candidates = [
            row
            for row in positive_candidates
            if MATH_MIX_SINGLE_FALLBACK_RANGE[0] <= float(row.get("odd") or 0.0) <= MATH_MIX_SINGLE_FALLBACK_RANGE[1]
        ]
        if mix_single_candidates:
            mix_warnings.append("Mix tekli sepetinde hedef oran yok; esnek +EV araligi kullanildi.")
    mix_single_items: list[dict[str, Any]] = []
    for index, row in enumerate(mix_single_candidates, start=1):
        if len(mix_single_items) >= mix_single_count:
            break
        if _math_time_budget_exceeded(started_monotonic, time_budget_seconds):
            mix_warnings.append("Mix tekli sepeti sure limiti nedeniyle kismi olusturuldu.")
            break
        mix_single_items.append(
            _build_math_coupon_item(coupon_id=f"mix-single-{index}", matches=[row], suggested_stake_tl=single_stake)
        )
    if mix_single_count > len(mix_single_items):
        mix_warnings.append("Mix tekli sepetinde yetersiz aday nedeniyle hedef adet saglanamadi.")

    mix_double_rows, mix_double_timed_out = _collect_double_rows(
        pool=double_pool,
        min_total_odds=MATH_MIX_DOUBLE_RANGE[0],
        max_total_odds=MATH_MIX_DOUBLE_RANGE[1],
        target_total_odds=2.10,
        started_monotonic=started_monotonic,
        time_budget_seconds=time_budget_seconds,
    )
    if mix_double_timed_out:
        mix_warnings.append("Mix 2'li sepeti sure limiti nedeniyle kismi olusturuldu.")
    if not mix_double_rows:
        mix_double_rows, mix_double_timed_out_fallback = _collect_double_rows(
            pool=double_pool,
            min_total_odds=MATH_MIX_DOUBLE_FALLBACK_RANGE[0],
            max_total_odds=MATH_MIX_DOUBLE_FALLBACK_RANGE[1],
            target_total_odds=4.80,
            started_monotonic=started_monotonic,
            time_budget_seconds=time_budget_seconds,
        )
        if mix_double_timed_out_fallback:
            mix_warnings.append("Mix 2'li fallback sepeti sure limiti nedeniyle kismi olusturuldu.")
        if mix_double_rows:
            mix_warnings.append("Mix 2'li sepetinde hedef oran yok; esnek +EV toplam oran araligi kullanildi.")
    mix_double_items = [
        _build_math_coupon_item(coupon_id=f"mix-double-{index}", matches=row[2], suggested_stake_tl=double_stake)
        for index, row in enumerate(mix_double_rows[:mix_double_count], start=1)
    ]
    if mix_double_count > len(mix_double_items):
        mix_warnings.append("Mix 2'li sepetinde yetersiz aday nedeniyle hedef adet saglanamadi.")

    shot_candidates = [
        row
        for row in positive_candidates
        if 1.10 <= float(row.get("odd") or 0.0) <= 4.00
    ]
    shot_item: list[dict[str, Any]] = []
    if mix_shot_count > 0:
        best_shot: Optional[tuple[float, float, list[dict[str, Any]]]] = None
        shot_min, shot_max = MATH_MIX_SHOT_RANGE
        shot_target = 3.50
        for first, second, third in combinations(shot_candidates, 3):
            if _math_time_budget_exceeded(started_monotonic, time_budget_seconds):
                mix_warnings.append("Mix 3'lu shot sepeti sure limiti nedeniyle kismi olusturuldu.")
                break
            total_odds = float(first.get("odd") or 1.0) * float(second.get("odd") or 1.0) * float(third.get("odd") or 1.0)
            if not (shot_min <= total_odds <= shot_max):
                continue
            edge_sum = float(first.get("edge") or 0.0) + float(second.get("edge") or 0.0) + float(third.get("edge") or 0.0)
            if edge_sum <= 0.0:
                continue
            candidate_row = (edge_sum, abs(total_odds - shot_target), [first, second, third])
            if best_shot is None or candidate_row[0] > best_shot[0] or (
                abs(candidate_row[0] - best_shot[0]) < 1e-9 and candidate_row[1] < best_shot[1]
            ):
                best_shot = candidate_row
        if best_shot is None:
            shot_min, shot_max = MATH_MIX_SHOT_FALLBACK_RANGE
            shot_target = 9.0
            for first, second, third in combinations(shot_candidates, 3):
                if _math_time_budget_exceeded(started_monotonic, time_budget_seconds):
                    mix_warnings.append("Mix 3'lu shot fallback sepeti sure limiti nedeniyle kismi olusturuldu.")
                    break
                total_odds = float(first.get("odd") or 1.0) * float(second.get("odd") or 1.0) * float(third.get("odd") or 1.0)
                if not (shot_min <= total_odds <= shot_max):
                    continue
                edge_sum = float(first.get("edge") or 0.0) + float(second.get("edge") or 0.0) + float(third.get("edge") or 0.0)
                if edge_sum <= 0.0:
                    continue
                candidate_row = (edge_sum, abs(total_odds - shot_target), [first, second, third])
                if best_shot is None or candidate_row[0] > best_shot[0] or (
                    abs(candidate_row[0] - best_shot[0]) < 1e-9 and candidate_row[1] < best_shot[1]
                ):
                    best_shot = candidate_row
            if best_shot is not None:
                mix_warnings.append("Mix 3'lu shot sepetinde hedef oran yok; esnek +EV toplam oran araligi kullanildi.")
        if best_shot is not None:
            shot_item = [
                _build_math_coupon_item(
                    coupon_id="mix-shot-1",
                    matches=best_shot[2],
                    suggested_stake_tl=shot_stake,
                )
            ]
        else:
            mix_warnings.append("Mix 3'lu shot sepeti icin uygun aday bulunamadi.")

    payload["mix_portfolio"]["baskets"]["single"] = {
        "target_odds_range": {"min": MATH_MIX_SINGLE_RANGE[0], "max": MATH_MIX_SINGLE_RANGE[1]},
        "allocation_tl": mix_single_allocation,
        "stake_tl": single_stake,
        "planned_count": int(mix_single_count),
        "generated_count": int(len(mix_single_items)),
        "items": mix_single_items,
    }
    payload["mix_portfolio"]["baskets"]["double"] = {
        "target_odds_range": {"min": MATH_MIX_DOUBLE_RANGE[0], "max": MATH_MIX_DOUBLE_RANGE[1]},
        "allocation_tl": mix_double_allocation,
        "stake_tl": double_stake,
        "planned_count": int(mix_double_count),
        "generated_count": int(len(mix_double_items)),
        "items": mix_double_items,
    }
    payload["mix_portfolio"]["baskets"]["shot"] = {
        "target_odds_range": {"min": MATH_MIX_SHOT_RANGE[0], "max": MATH_MIX_SHOT_RANGE[1]},
        "allocation_tl": mix_shot_allocation,
        "stake_tl": shot_stake,
        "planned_count": int(mix_shot_count),
        "generated_count": int(len(shot_item)),
        "items": shot_item,
    }
    payload["mix_portfolio"]["warnings"] = mix_warnings

    payload["summary"]["generated_counts"] = {
        "single_low_mid": int(len(payload["single_low_mid"]["items"])),
        "double_system": int(len(payload["double_system"]["items"])),
        "mix_single": int(len(mix_single_items)),
        "mix_double": int(len(mix_double_items)),
        "mix_shot": int(len(shot_item)),
    }
    combined_warnings = []
    combined_warnings.extend(payload["single_low_mid"].get("warnings") or [])
    combined_warnings.extend(payload["double_system"].get("warnings") or [])
    combined_warnings.extend(payload["mix_portfolio"].get("warnings") or [])
    payload["summary"]["warnings"] = combined_warnings
    return payload


def generate_coupon_payload(
    settings: Settings,
    *,
    days_window: int = 3,
    matches_per_coupon: int = 3,
    league_ids: Optional[Iterable[int]] = None,
    model_id: Optional[str] = None,
    bankroll_tl: float = DEFAULT_BANKROLL_TL,
    include_math_coupons: bool = True,
    progress_cb: ProgressCallback = None,
) -> dict:
    safe_days = 2 if int(days_window) <= 2 else 3
    safe_matches = 4 if int(matches_per_coupon) >= 4 else 3
    safe_bankroll = _normalize_bankroll_tl(bankroll_tl)
    safe_include_math = bool(include_math_coupons)
    target_leagues = parse_fixture_cache_league_ids(
        list(league_ids) if league_ids is not None else settings.fixture_cache_league_ids
    )
    today_utc = _now_utc().date()
    date_from = today_utc
    date_to = today_utc + timedelta(days=safe_days - 1)
    started_monotonic = time.monotonic()
    soft_limit_seconds = max(10.0, float(settings.coupon_generation_soft_time_limit_seconds))
    time_budget_seconds = max(5.0, soft_limit_seconds - 5.0)

    _emit_progress(progress_cb, 5, "Kupon adaylari DB cache'den cekiliyor")
    fixture_rows = _load_fixture_candidates(
        settings,
        date_from=date_from,
        date_to=date_to,
        league_ids=target_leagues,
    )

    warnings: list[str] = []
    if not fixture_rows:
        empty_coupon = {
            "risk": "none",
            "label": "Kupon",
            "target_total_odds": {"min": 0, "max": 0},
            "total_odds": None,
            "within_target": False,
            "unavailable": True,
            "selection_policy": "strict",
            "safety_level_used": None,
            "candidate_counts": {"strict_count": 0, "safety_count": 0},
            "warnings": ["Secilen aralikta uygun mac bulunamadi."],
            "matches": [],
        }
        return {
            "generated_at": _now_utc().isoformat(),
            "request": {
                "days_window": safe_days,
                "matches_per_coupon": safe_matches,
                "league_ids": target_leagues,
                "model_id": model_id,
                "bankroll_tl": safe_bankroll,
                "include_math_coupons": safe_include_math,
                "date_from": date_from.isoformat(),
                "date_to": date_to.isoformat(),
            },
            "simulated_count": 0,
            "fixtures_total": 0,
            "warnings": ["Secilen aralikta fixture bulunamadi."],
            "coupons": {
                "low": {**empty_coupon, "risk": "low", "label": RISK_PROFILES["low"]["label"]},
                "medium": {**empty_coupon, "risk": "medium", "label": RISK_PROFILES["medium"]["label"]},
                "high": {**empty_coupon, "risk": "high", "label": RISK_PROFILES["high"]["label"]},
            },
            "math_coupons": _empty_math_coupons_payload(
                safe_bankroll,
                include_math_coupons=safe_include_math,
                warning="Secilen aralikta fixture bulunamadi.",
            ),
        }

    _emit_progress(progress_cb, 16, "Aday maclar model simulasyonuna aliniyor")
    candidates: list[dict] = []
    math_candidates: list[dict] = []
    simulated = 0
    failed = 0

    for idx, row in enumerate(fixture_rows):
        if _math_time_budget_exceeded(started_monotonic, time_budget_seconds):
            warnings.append("Sure limitine yaklasildigi icin simulasyonlar kismi olarak tamamlandi.")
            break
        market = _parse_match_result_market(row.get("market_match_result_json"))
        if market is None:
            continue

        fixture_id = _safe_int(row.get("fixture_id"))
        if fixture_id is None:
            continue

        try:
            simulation = simulate_fixture(fixture_id=fixture_id, settings=settings, model_id=model_id)
        except Exception as exc:
            failed += 1
            logger.warning("Coupon generation simulate failed fixture_id={} err={}", fixture_id, exc)
            continue

        outcomes = simulation.get("outcomes") or {}
        selection, model_prob = _outcomes_to_selection(outcomes)
        if selection not in {"1", "0", "2"}:
            continue
        market_implied = _normalize_market_implied(market)
        if market_implied is None:
            continue
        selected_odd = _safe_float(market.get(selection))
        if not selected_odd or selected_odd <= 1.0:
            continue
        market_prob = float(market_implied.get(selection) or 0.0)
        edge = float(model_prob - market_prob)
        simulated += 1

        candidate_common = {
            "fixture_id": fixture_id,
            "league_id": _safe_int(row.get("league_id")),
            "league_name": row.get("league_name"),
            "event_date": str(row.get("event_date") or ""),
            "starting_at": (_parse_datetime(row.get("starting_at")) or _now_utc()).isoformat(),
            "home_team_id": _safe_int(row.get("home_team_id")),
            "away_team_id": _safe_int(row.get("away_team_id")),
            "home_team_name": row.get("home_team_name"),
            "away_team_name": row.get("away_team_name"),
            "home_team_logo": row.get("home_team_logo"),
            "away_team_logo": row.get("away_team_logo"),
            "model_id": ((simulation.get("model") or {}).get("model_id")),
            "model_name": ((simulation.get("model") or {}).get("model_name")),
            "model_selection_mode": ((simulation.get("model") or {}).get("selection_mode")),
            "market_match_result": {
                "1": round(float(market["1"]), 2),
                "0": round(float(market["0"]), 2),
                "2": round(float(market["2"]), 2),
            },
        }
        candidate = {
            **candidate_common,
            "selection": selection,
            "odd": round(float(selected_odd), 2),
            "model_prob": round(float(model_prob), 4),
            "market_prob": round(float(market_prob), 4),
            "edge": round(float(edge), 4),
            "simulation_summary": _build_simulation_summary(
                simulation,
                selection=selection,
                odd=float(selected_odd),
                edge=edge,
                market_prob=market_prob,
                model_prob=model_prob,
            ),
        }
        candidates.append(candidate)

        # Math coupons can use all +EV result outcomes from the same fixture.
        for option_selection in ("1", "0", "2"):
            option_odd = _safe_float(market.get(option_selection))
            if not option_odd or option_odd <= 1.0:
                continue
            option_model_prob = _selection_model_prob(outcomes, option_selection)
            option_market_prob = float(market_implied.get(option_selection) or 0.0)
            option_edge = float(option_model_prob - option_market_prob)
            if option_edge <= 0.0:
                continue
            math_candidates.append(
                {
                    **candidate_common,
                    "selection": option_selection,
                    "odd": round(float(option_odd), 2),
                    "model_prob": round(float(option_model_prob), 4),
                    "market_prob": round(float(option_market_prob), 4),
                    "edge": round(float(option_edge), 4),
                    "simulation_summary": _build_simulation_summary(
                        simulation,
                        selection=option_selection,
                        odd=float(option_odd),
                        edge=option_edge,
                        market_prob=option_market_prob,
                        model_prob=option_model_prob,
                    ),
                }
            )

        if idx % 4 == 0:
            ratio = (idx + 1) / max(1, len(fixture_rows))
            _emit_progress(
                progress_cb,
                16 + ratio * 54,
                "Model simulasyonlari devam ediyor",
                {"simulated": simulated, "failed": failed},
            )

    if not candidates:
        warnings.append("Model filtresinden gecen aday bulunamadi.")

    _emit_progress(progress_cb, 74, "Risk kuponlari olusturuluyor")
    used_fixture_ids: set[int] = set()
    low_coupon = _select_coupon_for_profile(
        profile_name="low",
        candidates=candidates,
        used_fixture_ids=used_fixture_ids,
        matches_per_coupon=safe_matches,
    )
    medium_coupon = _select_coupon_for_profile(
        profile_name="medium",
        candidates=candidates,
        used_fixture_ids=used_fixture_ids,
        matches_per_coupon=safe_matches,
    )
    high_coupon = _select_coupon_for_profile(
        profile_name="high",
        candidates=candidates,
        used_fixture_ids=used_fixture_ids,
        matches_per_coupon=safe_matches,
    )
    _emit_progress(progress_cb, 86, "Matematiksel +EV kuponlar olusturuluyor")
    math_coupons = _build_math_coupons(
        candidates=math_candidates if math_candidates else candidates,
        bankroll_tl=safe_bankroll,
        include_math_coupons=safe_include_math,
        started_monotonic=started_monotonic,
        time_budget_seconds=time_budget_seconds,
    )

    payload = {
        "generated_at": _now_utc().isoformat(),
        "request": {
            "days_window": safe_days,
            "matches_per_coupon": safe_matches,
            "league_ids": target_leagues,
            "model_id": model_id,
            "bankroll_tl": safe_bankroll,
            "include_math_coupons": safe_include_math,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
        },
        "fixtures_total": len(fixture_rows),
        "simulated_count": simulated,
        "simulation_failed_count": failed,
        "warnings": warnings,
        "coupons": {
            "low": low_coupon,
            "medium": medium_coupon,
            "high": high_coupon,
        },
        "math_coupons": math_coupons,
    }
    _emit_progress(progress_cb, 100, "Kupon uretimi tamamlandi", {"simulated": simulated, "failed": failed})
    return payload


def process_coupon_generation_run(
    *,
    run_id: int,
    settings: Optional[Settings] = None,
    progress_cb: ProgressCallback = None,
) -> dict:
    resolved_settings = settings or get_settings()
    run = load_coupon_run_by_id(resolved_settings, run_id=int(run_id))
    if not run:
        raise ValueError(f"coupon run not found: {run_id}")

    request_payload = _json_load(run.get("request_json"), {})
    if not isinstance(request_payload, dict):
        request_payload = {}
    include_math_value = request_payload.get("include_math_coupons", True)
    if isinstance(include_math_value, str):
        include_math = include_math_value.strip().lower() not in {"0", "false", "no"}
    else:
        include_math = bool(include_math_value)
    bankroll_value = _safe_float(request_payload.get("bankroll_tl"))
    if bankroll_value is None:
        bankroll_value = DEFAULT_BANKROLL_TL

    started_at = _now_utc()
    set_coupon_run_status(
        resolved_settings,
        run_id=int(run_id),
        status="running",
        started_at=started_at,
        finished_at=None,
        error=None,
    )
    try:
        payload = generate_coupon_payload(
            resolved_settings,
            days_window=int(request_payload.get("days_window") or 3),
            matches_per_coupon=int(request_payload.get("matches_per_coupon") or 3),
            league_ids=request_payload.get("league_ids"),
            model_id=request_payload.get("model_id"),
            bankroll_tl=float(bankroll_value),
            include_math_coupons=include_math,
            progress_cb=progress_cb,
        )
        set_coupon_run_status(
            resolved_settings,
            run_id=int(run_id),
            status="completed",
            result_json=payload,
            finished_at=_now_utc(),
            error=None,
        )
        return payload
    except Exception as exc:
        set_coupon_run_status(
            resolved_settings,
            run_id=int(run_id),
            status="failed",
            finished_at=_now_utc(),
            error=f"{exc.__class__.__name__}: {exc}",
        )
        raise


def _insight_key(fixture_id: int, selection: Optional[str]) -> str:
    safe_selection = selection if selection in {"1", "0", "2"} else "any"
    return f"{int(fixture_id)}:{safe_selection}"


def get_cached_generated_insight(
    run_result_json: Any,
    *,
    fixture_id: int,
    selection: Optional[str],
) -> Optional[dict]:
    payload = _json_load(run_result_json, {})
    insights = payload.get("insights") if isinstance(payload, dict) else None
    if not isinstance(insights, dict):
        return None
    return insights.get(_insight_key(fixture_id, selection))


def append_generated_insight(
    settings: Settings,
    *,
    run_id: int,
    fixture_id: int,
    selection: Optional[str],
    insight_payload: dict,
) -> dict:
    run = load_coupon_run_by_id(settings, run_id=int(run_id))
    if not run:
        raise ValueError(f"coupon run not found: {run_id}")
    result_payload = _json_load(run.get("result_json"), {})
    if not isinstance(result_payload, dict):
        result_payload = {}
    insights = result_payload.get("insights")
    if not isinstance(insights, dict):
        insights = {}
    insights[_insight_key(fixture_id, selection)] = insight_payload
    result_payload["insights"] = insights
    set_coupon_run_status(
        settings,
        run_id=int(run_id),
        status=str(run.get("status") or "completed"),
        result_json=result_payload,
        error=run.get("error"),
        started_at=run.get("started_at"),
        finished_at=run.get("finished_at"),
    )
    return result_payload


def find_generated_coupon_match(
    run_result_json: Any,
    *,
    fixture_id: int,
    selection: Optional[str] = None,
) -> Optional[dict]:
    payload = _json_load(run_result_json, {})
    if not isinstance(payload, dict):
        return None
    match_lists: list[list[dict]] = []

    coupons = payload.get("coupons")
    if isinstance(coupons, dict):
        for coupon in coupons.values():
            if not isinstance(coupon, dict):
                continue
            matches = coupon.get("matches")
            if isinstance(matches, list):
                match_lists.append(matches)

    math_coupons = payload.get("math_coupons")
    if isinstance(math_coupons, dict):
        for strategy_key in ("single_low_mid", "double_system"):
            strategy = math_coupons.get(strategy_key)
            if not isinstance(strategy, dict):
                continue
            items = strategy.get("items")
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                matches = item.get("matches")
                if isinstance(matches, list):
                    match_lists.append(matches)
        mix_portfolio = math_coupons.get("mix_portfolio")
        baskets = mix_portfolio.get("baskets") if isinstance(mix_portfolio, dict) else None
        if isinstance(baskets, dict):
            for basket in baskets.values():
                if not isinstance(basket, dict):
                    continue
                items = basket.get("items")
                if not isinstance(items, list):
                    continue
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    matches = item.get("matches")
                    if isinstance(matches, list):
                        match_lists.append(matches)

    target_selection = selection if selection in {"1", "0", "2"} else None
    for matches in match_lists:
        for match in matches:
            if not isinstance(match, dict):
                continue
            if _safe_int(match.get("fixture_id")) != int(fixture_id):
                continue
            if target_selection and str(match.get("selection")) != target_selection:
                continue
            return match
    return None
