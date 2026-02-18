from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import create_engine, text

from app.config import Settings
from app.fixture_board import parse_fixture_cache_league_ids
from modeling.registry import get_active_model, get_model, list_models, register_model

LEAGUE_DEFAULT_MODELS_TABLE = "league_default_models"
LEAGUE_MODEL_ROLLOUT_TABLE = "league_model_rollout"
_MANAGER_ROLES = {"admin", "superadmin"}


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_model_scope(item: dict[str, Any]) -> str:
    meta = item.get("meta") or {}
    raw_scope = str(item.get("model_scope") or meta.get("model_scope") or "").strip().lower()
    if raw_scope in {"ready", "user"}:
        return raw_scope

    owner_role = str(item.get("created_by_role") or meta.get("created_by_role") or "").strip().lower()
    if owner_role in _MANAGER_ROLES:
        return "ready"

    owner_id = item.get("created_by_user_id")
    if owner_id is None:
        owner_id = meta.get("created_by_user_id")
    if owner_id is None:
        return "ready"

    return "user"


def _extract_model_league_id(item: dict[str, Any]) -> Optional[int]:
    meta = item.get("meta") or {}
    return _safe_int(meta.get("league_id"))


def _is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value or "").strip().lower()
    return normalized in {"1", "true", "yes", "y", "on"}


def _is_system_managed_model(item: dict[str, Any]) -> bool:
    meta = item.get("meta") or {}
    if _is_truthy(meta.get("system_managed")):
        return True
    return _safe_int(meta.get("system_league_id")) is not None


def ensure_league_default_models_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {LEAGUE_DEFAULT_MODELS_TABLE} (
                    league_id BIGINT PRIMARY KEY,
                    model_id TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    rows_used INT,
                    is_degraded BOOLEAN NOT NULL DEFAULT FALSE,
                    last_trained_at TIMESTAMPTZ,
                    notes TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_league_default_models_status
                ON {LEAGUE_DEFAULT_MODELS_TABLE} (status)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_league_default_models_updated
                ON {LEAGUE_DEFAULT_MODELS_TABLE} (updated_at DESC)
                """
            )
        )


def parse_league_model_ids(settings: Settings, league_ids: Optional[Iterable[int]] = None) -> list[int]:
    raw = list(league_ids) if league_ids is not None else settings.league_model_league_ids
    return parse_fixture_cache_league_ids(raw)


def load_league_default_models(settings: Settings) -> dict[int, dict]:
    try:
        engine = create_engine(settings.db_url)
        ensure_league_default_models_table(engine)
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    f"""
                    SELECT league_id, model_id, status, rows_used, is_degraded, last_trained_at, notes, created_at, updated_at
                    FROM {LEAGUE_DEFAULT_MODELS_TABLE}
                    ORDER BY league_id ASC
                    """
                )
            ).mappings().all()
    except Exception:
        return {}
    out: dict[int, dict] = {}
    for row in rows:
        league_id = _safe_int(row.get("league_id"))
        if league_id is None:
            continue
        out[league_id] = dict(row)
    return out


def get_league_default_model(settings: Settings, *, league_id: int) -> Optional[dict]:
    try:
        engine = create_engine(settings.db_url)
        ensure_league_default_models_table(engine)
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    f"""
                    SELECT league_id, model_id, status, rows_used, is_degraded, last_trained_at, notes, created_at, updated_at
                    FROM {LEAGUE_DEFAULT_MODELS_TABLE}
                    WHERE league_id = :league_id
                    LIMIT 1
                    """
                ),
                {"league_id": int(league_id)},
            ).mappings().first()
    except Exception:
        return None
    return dict(row) if row else None


def upsert_league_default_model(
    settings: Settings,
    *,
    league_id: int,
    model_id: Optional[str],
    status: str,
    rows_used: Optional[int],
    is_degraded: bool,
    last_trained_at: Optional[datetime],
    notes: Optional[str],
) -> None:
    engine = create_engine(settings.db_url)
    ensure_league_default_models_table(engine)
    now_utc = _now_utc()

    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                INSERT INTO {LEAGUE_DEFAULT_MODELS_TABLE} (
                    league_id, model_id, status, rows_used, is_degraded, last_trained_at, notes, created_at, updated_at
                )
                VALUES (
                    :league_id, :model_id, :status, :rows_used, :is_degraded, :last_trained_at, :notes, :created_at, :updated_at
                )
                ON CONFLICT (league_id)
                DO UPDATE SET
                    model_id = :model_id,
                    status = :status,
                    rows_used = :rows_used,
                    is_degraded = :is_degraded,
                    last_trained_at = :last_trained_at,
                    notes = :notes,
                    updated_at = :updated_at
                """
            ),
            {
                "league_id": int(league_id),
                "model_id": model_id,
                "status": str(status),
                "rows_used": int(rows_used) if rows_used is not None else None,
                "is_degraded": bool(is_degraded),
                "last_trained_at": last_trained_at,
                "notes": notes,
                "created_at": now_utc,
                "updated_at": now_utc,
            },
        )


def _selection_payload(model: dict, *, selection_mode: str, league_id: Optional[int]) -> dict:
    meta = model.get("meta") or {}
    return {
        "league_id": league_id,
        "selection_mode": selection_mode,
        "model_id": model.get("model_id"),
        "model_name": model.get("model_name"),
        "model_version": model.get("version") or meta.get("model_version"),
        "trained_at": model.get("trained_at") or meta.get("trained_at"),
        "artifact_dir": model.get("artifact_dir"),
    }


def ensure_league_model_rollout_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {LEAGUE_MODEL_ROLLOUT_TABLE} (
                    league_id BIGINT PRIMARY KEY,
                    active_model_id TEXT,
                    shadow_model_id TEXT,
                    shadow_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    rollout_percent INT NOT NULL DEFAULT 100,
                    rollback_model_id TEXT,
                    notes TEXT,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )


def _get_league_rollout_policy(settings: Settings, *, league_id: int) -> Optional[dict]:
    try:
        engine = create_engine(settings.db_url)
        ensure_league_model_rollout_table(engine)
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    f"""
                    SELECT league_id, active_model_id, shadow_model_id, shadow_enabled, rollout_percent, rollback_model_id
                    FROM {LEAGUE_MODEL_ROLLOUT_TABLE}
                    WHERE league_id = :league_id
                    LIMIT 1
                    """
                ),
                {"league_id": int(league_id)},
            ).mappings().first()
    except Exception:
        return None
    return dict(row) if row else None


def _stable_rollout_bucket(*, league_id: int, routing_key: Optional[int]) -> int:
    fingerprint = f"{int(league_id)}:{int(routing_key or 0)}"
    digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _resolve_rollout_override(
    settings: Settings,
    *,
    league_id: int,
    routing_key: Optional[int],
) -> Optional[dict]:
    policy = _get_league_rollout_policy(settings, league_id=int(league_id))
    if not policy:
        return None

    rollback_model_id = str(policy.get("rollback_model_id") or "").strip()
    if rollback_model_id:
        rollback_model = get_model(rollback_model_id)
        if rollback_model:
            payload = _selection_payload(rollback_model, selection_mode="league_rollback", league_id=league_id)
            payload["rollout_percent"] = 0
            payload["rollout_bucket"] = None
            return payload

    if not bool(policy.get("shadow_enabled")):
        return None

    shadow_model_id = str(policy.get("shadow_model_id") or "").strip()
    if not shadow_model_id:
        return None

    shadow_model = get_model(shadow_model_id)
    if not shadow_model:
        return None

    rollout_percent = max(0, min(100, int(policy.get("rollout_percent") or 0)))
    if rollout_percent <= 0:
        return None

    bucket = _stable_rollout_bucket(league_id=int(league_id), routing_key=routing_key)
    if rollout_percent < 100 and bucket >= rollout_percent:
        return None

    payload = _selection_payload(shadow_model, selection_mode="shadow_rollout", league_id=league_id)
    payload["rollout_percent"] = rollout_percent
    payload["rollout_bucket"] = bucket
    return payload


def _latest_ready_model_for_league(league_id: int, *, system_managed_only: bool = False) -> Optional[dict]:
    models = list_models(limit=5000)
    for item in models:
        if _normalize_model_scope(item) != "ready":
            continue
        if _extract_model_league_id(item) != int(league_id):
            continue
        if system_managed_only and not _is_system_managed_model(item):
            continue
        return item
    return None


def resolve_model_for_league(
    settings: Settings,
    *,
    league_id: Optional[int],
    requested_model_id: Optional[str] = None,
    routing_key: Optional[int] = None,
) -> dict:
    if requested_model_id:
        explicit = get_model(str(requested_model_id))
        if not explicit:
            raise FileNotFoundError(f"Model '{requested_model_id}' not found")
        return _selection_payload(explicit, selection_mode="explicit", league_id=league_id)

    resolved_league = _safe_int(league_id)
    if resolved_league is not None:
        rollout_override = _resolve_rollout_override(settings, league_id=resolved_league, routing_key=routing_key)
        if rollout_override:
            return rollout_override

        default_row = get_league_default_model(settings, league_id=resolved_league)
        default_model_id = str((default_row or {}).get("model_id") or "").strip()
        if default_model_id:
            default_model = get_model(default_model_id)
            if default_model:
                return _selection_payload(default_model, selection_mode="league_default", league_id=resolved_league)

        latest_system_ready = _latest_ready_model_for_league(resolved_league, system_managed_only=True)
        if latest_system_ready:
            return _selection_payload(latest_system_ready, selection_mode="league_ready_latest", league_id=resolved_league)

        latest_same_league = _latest_ready_model_for_league(resolved_league)
        if latest_same_league:
            return _selection_payload(latest_same_league, selection_mode="league_ready_latest", league_id=resolved_league)

        strict_mode = bool(getattr(settings, "strict_league_model_routing", True))
        if strict_mode:
            raise FileNotFoundError(
                f"No ready/default model found for league {resolved_league}. "
                "Run bootstrap-league-models or train a ready model for this league."
            )

    if resolved_league is not None and not bool(getattr(settings, "allow_global_fallback_model", False)):
        raise FileNotFoundError("Global fallback model is disabled by configuration.")

    active = get_active_model()
    if active:
        return _selection_payload(active, selection_mode="global_fallback", league_id=resolved_league)

    raise FileNotFoundError("No trained models available for requested league and no global fallback exists.")


def validate_league_default_mapping(settings: Settings, *, league_ids: Optional[Iterable[int]] = None) -> dict:
    target_leagues = parse_league_model_ids(settings, league_ids=league_ids)
    defaults = load_league_default_models(settings)
    missing: list[int] = []
    unresolved: list[int] = []

    for league_id in target_leagues:
        row = defaults.get(int(league_id)) or {}
        model_id = str(row.get("model_id") or "").strip()
        if not model_id:
            missing.append(int(league_id))
            unresolved.append(int(league_id))
            continue
        if not get_model(model_id):
            unresolved.append(int(league_id))

    return {
        "league_ids": target_leagues,
        "missing": missing,
        "unresolved": unresolved,
        "is_complete": not unresolved,
    }


def mark_model_as_system_managed(model_id: str, *, league_id: Optional[int] = None) -> bool:
    model = get_model(model_id)
    if not model:
        return False

    updated = dict(model)
    meta = dict(updated.get("meta") or {})
    meta["system_managed"] = True
    if league_id is not None:
        meta["league_id"] = int(league_id)
        meta["system_league_id"] = int(league_id)
    updated["meta"] = meta
    updated["model_scope"] = "ready"
    register_model(updated, set_active=False)
    return True
