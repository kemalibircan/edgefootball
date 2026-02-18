from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Callable, Dict, Iterable, Optional

from loguru import logger

from app.config import Settings
from app.fixture_board import DEFAULT_LEAGUE_NAMES
from app.league_model_routing import (
    get_league_default_model,
    load_league_default_models,
    mark_model_as_system_managed,
    parse_league_model_ids,
    upsert_league_default_model,
    validate_league_default_mapping,
)
from data.features import build_and_persist_features
from data.ingest import get_league_data_pool_status, ingest_league_history
from modeling.registry import get_model, list_models
from modeling.train import get_data_source_catalog, run_training

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


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _serialize_status(payload: dict) -> dict:
    out = {}
    for key, value in (payload or {}).items():
        out[key] = _serialize_value(value)
    return out


def _league_name(league_id: int) -> str:
    return str(DEFAULT_LEAGUE_NAMES.get(int(league_id)) or f"League {league_id}")


def _resolve_pro_training_sources(settings: Settings) -> list[str]:
    raw = str(getattr(settings, "pro_training_data_sources", "") or "").strip()
    requested = [item.strip() for item in raw.split(",") if item.strip()] if raw else [
        "team_form",
        "elo",
        "injuries",
        "lineup_strength",
        "weather",
        "referee",
        "market_odds",
    ]

    catalog_keys = {str(item.get("key") or "").strip() for item in get_data_source_catalog()}
    resolved: list[str] = []
    seen: set[str] = set()
    for key in requested:
        normalized = str(key or "").strip()
        if not normalized or normalized in seen:
            continue
        if normalized not in catalog_keys:
            continue
        seen.add(normalized)
        resolved.append(normalized)

    if resolved:
        return resolved
    return ["team_form", "elo", "injuries", "lineup_strength", "weather", "referee", "market_odds"]


def _model_scope(item: dict[str, Any]) -> str:
    raw = str(item.get("model_scope") or (item.get("meta") or {}).get("model_scope") or "").strip().lower()
    if raw in {"ready", "user"}:
        return raw
    return "ready"


def _model_league_id(item: dict[str, Any]) -> Optional[int]:
    return _safe_int((item.get("meta") or {}).get("league_id"))


def _latest_ready_by_league() -> dict[int, dict]:
    out: dict[int, dict] = {}
    for item in list_models(limit=5000):
        if _model_scope(item) != "ready":
            continue
        league_id = _model_league_id(item)
        if league_id is None:
            continue
        if league_id not in out:
            out[league_id] = item
    return out


def get_league_model_status(settings: Settings) -> dict:
    target_leagues = parse_league_model_ids(settings)
    defaults = load_league_default_models(settings)
    latest_ready = _latest_ready_by_league()

    items: list[dict] = []
    for league_id in target_leagues:
        default_row = defaults.get(int(league_id)) or {}
        default_model_id = str(default_row.get("model_id") or "").strip() or None
        default_model = get_model(default_model_id) if default_model_id else None
        latest_model = latest_ready.get(int(league_id))
        pool_status = get_league_data_pool_status(league_id=int(league_id), settings=settings)

        items.append(
            {
                "league_id": int(league_id),
                "league_name": _league_name(int(league_id)),
                "status": default_row.get("status") or "pending",
                "rows_used": _safe_int(default_row.get("rows_used")),
                "is_degraded": bool(default_row.get("is_degraded") or False),
                "last_trained_at": _serialize_value(default_row.get("last_trained_at")),
                "notes": default_row.get("notes"),
                "default_model_id": default_model_id,
                "default_model_name": (default_model or {}).get("model_name") if isinstance(default_model, dict) else None,
                "latest_ready_model_id": (latest_model or {}).get("model_id") if isinstance(latest_model, dict) else None,
                "latest_ready_model_name": (latest_model or {}).get("model_name") if isinstance(latest_model, dict) else None,
                "data_pool": _serialize_status(pool_status),
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target_rows": int(settings.league_model_target_rows),
        "min_rows": int(settings.league_model_min_rows),
        "league_ids": target_leagues,
        "items": items,
    }


def _persist_league_default_with_retention(
    settings: Settings,
    *,
    league_id: int,
    model_id: Optional[str],
    status: str,
    rows_used: Optional[int],
    is_degraded: bool,
    trained_at: Optional[datetime],
    notes: Optional[str],
) -> str:
    existing = get_league_default_model(settings, league_id=int(league_id)) or {}
    effective_model_id = model_id
    notes_out = str(notes or "").strip()

    if not effective_model_id:
        existing_model_id = str(existing.get("model_id") or "").strip() or None
        if existing_model_id:
            effective_model_id = existing_model_id
            notes_out = f"{notes_out} | Onceki default model korundu." if notes_out else "Onceki default model korundu."

    upsert_league_default_model(
        settings,
        league_id=int(league_id),
        model_id=effective_model_id,
        status=status,
        rows_used=rows_used,
        is_degraded=bool(is_degraded),
        last_trained_at=trained_at,
        notes=notes_out or None,
    )
    return effective_model_id or ""


def bootstrap_league_models(
    *,
    settings: Settings,
    trigger_type: str = "manual",
    requested_by: Optional[int] = None,
    league_ids: Optional[Iterable[int]] = None,
    progress_cb: ProgressCallback = None,
) -> dict:
    target_leagues = parse_league_model_ids(settings, league_ids=league_ids)
    target_rows = max(100, int(settings.league_model_target_rows))
    min_rows = max(100, int(settings.league_model_min_rows))
    if min_rows > target_rows:
        min_rows = target_rows

    ingest_target_count = max(int(target_rows * 2), 2000)
    results: list[dict] = []

    _emit_progress(
        progress_cb,
        1,
        "Lig bazli model bootstrap basladi",
        {
            "trigger_type": trigger_type,
            "requested_by": requested_by,
            "target_rows": target_rows,
            "min_rows": min_rows,
            "league_ids": target_leagues,
        },
    )

    ingest_report: dict[int, dict] = {}
    for idx, league_id in enumerate(target_leagues, start=1):
        base = 3 + ((idx - 1) / max(1, len(target_leagues))) * 22
        _emit_progress(
            progress_cb,
            base,
            f"Lig gecmis verisi cekiliyor ({_league_name(league_id)})",
            {"league_id": league_id, "league_index": idx, "league_total": len(target_leagues)},
        )
        try:
            ingested = ingest_league_history(
                league_id=int(league_id),
                target_count=ingest_target_count,
                progress_cb=None,
            )
            ingest_report[int(league_id)] = {"ingested_count": len(ingested), "error": None}
        except Exception as exc:  # pragma: no cover
            logger.warning("bootstrap ingest failed league_id={} err={}", league_id, exc)
            ingest_report[int(league_id)] = {"ingested_count": 0, "error": f"{exc.__class__.__name__}: {exc}"}

    _emit_progress(progress_cb, 28, "Feature havuzu guncelleniyor")
    feature_count = int(build_and_persist_features(progress_cb=None))

    training_mode = str(settings.league_model_training_mode or "latest").strip().lower() or "latest"
    pro_data_sources = _resolve_pro_training_sources(settings)
    _emit_progress(progress_cb, 44, "Lig modelleri egitilmeye baslaniyor")

    for idx, league_id in enumerate(target_leagues, start=1):
        ratio = (idx - 1) / max(1, len(target_leagues))
        progress = 44 + ratio * 52
        league_name = _league_name(league_id)
        _emit_progress(
            progress_cb,
            progress,
            f"Model egitimi: {league_name}",
            {"league_id": league_id, "league_index": idx, "league_total": len(target_leagues)},
        )

        ingest_info = ingest_report.get(int(league_id)) or {"ingested_count": 0, "error": None}
        trained_model_id: Optional[str] = None
        trained_at: Optional[datetime] = None
        rows_used: Optional[int] = None
        is_degraded = False
        status = "failed"
        notes = None

        try:
            meta = run_training(
                limit=target_rows,
                league_id=int(league_id),
                model_name=f"System {league_name} {target_rows}",
                description="System-managed league default model",
                data_sources=pro_data_sources,
                set_active=False,
                created_by_user_id=int(requested_by) if requested_by is not None else None,
                created_by_username="system",
                created_by_role="superadmin",
                model_scope="ready",
                training_mode=training_mode,
                training_date_from=None,
                training_date_to=None,
            )
            trained_model_id = str(meta.get("model_id") or "").strip() or None
            trained_at = _parse_datetime(meta.get("trained_at"))
            rows_used = _safe_int(meta.get("rows_used"))
            rows_used_safe = int(rows_used or 0)

            if trained_model_id:
                mark_model_as_system_managed(trained_model_id, league_id=int(league_id))

            if rows_used_safe >= target_rows:
                status = "ready"
                is_degraded = False
                notes = "Target rows achieved."
            elif rows_used_safe >= min_rows:
                status = "ready"
                is_degraded = True
                notes = f"Target rows under limit ({rows_used_safe}/{target_rows}), degraded accepted."
            else:
                status = "insufficient_data"
                is_degraded = True
                trained_model_id = None
                notes = f"Rows below minimum threshold ({rows_used_safe}/{min_rows})."
        except Exception as exc:
            status = "failed"
            is_degraded = True
            notes = f"Training failed: {exc.__class__.__name__}: {exc}"
            logger.warning("bootstrap training failed league_id={} err={}", league_id, exc)

        effective_model_id = _persist_league_default_with_retention(
            settings,
            league_id=int(league_id),
            model_id=trained_model_id,
            status=status,
            rows_used=rows_used,
            is_degraded=is_degraded,
            trained_at=trained_at,
            notes=notes,
        )

        pool_status = get_league_data_pool_status(league_id=int(league_id), settings=settings)
        results.append(
            {
                "league_id": int(league_id),
                "league_name": league_name,
                "status": status,
                "rows_used": int(rows_used or 0),
                "is_degraded": bool(is_degraded),
                "model_id": effective_model_id or None,
                "trained_model_id": trained_model_id,
                "last_trained_at": _serialize_value(trained_at),
                "notes": notes,
                "ingested_count": int(ingest_info.get("ingested_count") or 0),
                "ingest_error": ingest_info.get("error"),
                "data_pool": _serialize_status(pool_status),
            }
        )

    _emit_progress(progress_cb, 100, "Lig bazli model bootstrap tamamlandi")

    strict_mode = bool(getattr(settings, "strict_league_model_routing", True))
    mapping_check = validate_league_default_mapping(settings, league_ids=target_leagues)
    if strict_mode and not bool(mapping_check.get("is_complete")):
        unresolved = mapping_check.get("unresolved") or []
        raise RuntimeError(
            "Strict league mapping check failed. Missing default model mapping for leagues: "
            + ", ".join(str(item) for item in unresolved)
        )

    return {
        "trigger_type": trigger_type,
        "requested_by": requested_by,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target_rows": target_rows,
        "min_rows": min_rows,
        "training_mode": training_mode,
        "pro_data_sources": pro_data_sources,
        "feature_count": feature_count,
        "league_ids": target_leagues,
        "strict_mapping": {
            "enabled": strict_mode,
            **mapping_check,
        },
        "results": results,
    }
