from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Dict, List, Optional

from celery import Celery
from celery.schedules import crontab
from celery.signals import beat_init, worker_ready
from loguru import logger
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.db_migrations import run_startup_migrations
from app.coupon_builder import process_coupon_generation_run
from app.fixture_board import refresh_fixture_board_cache
from app.league_model_bootstrap import bootstrap_league_models
from app.league_model_routing import (
    LEAGUE_DEFAULT_MODELS_TABLE,
    LEAGUE_MODEL_ROLLOUT_TABLE,
    ensure_league_default_models_table,
    ensure_league_model_rollout_table,
    parse_league_model_ids,
    validate_league_default_mapping,
)

from data.ingest import DEFAULT_SUPERLIG_LEAGUE_ID as INGEST_SUPERLIG_LEAGUE_ID
from data.ingest import ingest_league_history, ingest_range, resolve_incremental_ingest_range
from data.features import build_and_persist_features
from modeling.registry import purge_registered_models
from modeling.train import DEFAULT_SUPERLIG_LEAGUE_ID as TRAIN_SUPERLIG_LEAGUE_ID
from modeling.train import run_training

settings = get_settings()

celery_app = Celery(
    "football_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.timezone = "UTC"
celery_app.conf.beat_schedule = {
    "refresh-fixture-board-cache-daily": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(
            hour=max(0, min(int(settings.fixture_cache_refresh_hour_utc), 23)),
            minute=max(0, min(int(settings.fixture_cache_refresh_minute_utc), 59)),
        ),
        "kwargs": {"trigger_type": "scheduled"},
    },
    "refresh-fixture-board-cache-live-window": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(minute="*/2"),
        "kwargs": {"trigger_type": "scheduled_live_window"},
    },
    "bootstrap-league-models-weekly": {
        "task": "worker.celery_app.bootstrap_league_models_task",
        "schedule": crontab(
            day_of_week=str(max(0, min(int(settings.league_model_retrain_weekday_utc), 6))),
            hour=max(0, min(int(settings.league_model_retrain_hour_utc), 23)),
            minute=max(0, min(int(settings.league_model_retrain_minute_utc), 59)),
        ),
        "kwargs": {"trigger_type": "scheduled"},
    },
}


@worker_ready.connect
def _run_worker_startup_migrations(**_kwargs):
    run_startup_migrations(settings)


@beat_init.connect
def _run_beat_startup_migrations(**_kwargs):
    run_startup_migrations(settings)


def _build_progress_callback(task):
    def _callback(progress: int, stage: str, extra: Optional[Dict[str, object]] = None) -> None:
        payload: Dict[str, object] = {"progress": int(progress), "stage": stage}
        if extra:
            payload.update(extra)
        task.update_state(state="PROGRESS", meta=payload)

    return _callback


@celery_app.task(bind=True)
def ingest_task(self, start_date: str, end_date: str, league_id: Optional[int] = None):
    logger.info("Starting ingest task {} - {} league={}", start_date, end_date, league_id)
    start = datetime.fromisoformat(start_date).date()
    end = datetime.fromisoformat(end_date).date()
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Task basladi"})
    ingested = ingest_range(start, end, league_id=league_id, progress_cb=_build_progress_callback(self))
    return {"ingested_count": len(ingested)}


@celery_app.task(bind=True)
def ingest_league_history_task(self, target_count: int = 2000, league_id: int = INGEST_SUPERLIG_LEAGUE_ID):
    logger.info("Starting league history ingest task league={} target_count={}", league_id, target_count)
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Task basladi"})
    ingested = ingest_league_history(
        league_id=league_id,
        target_count=target_count,
        progress_cb=_build_progress_callback(self),
    )
    return {"ingested_count": len(ingested), "league_id": league_id, "target_count": target_count}


@celery_app.task(bind=True)
def ingest_incremental_task(
    self,
    league_id: int = INGEST_SUPERLIG_LEAGUE_ID,
    include_feature_rebuild: bool = True,
):
    logger.info(
        "Starting incremental ingest task league={} include_feature_rebuild={}",
        league_id,
        include_feature_rebuild,
    )
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Task basladi"})
    start_day, end_day, status, range_reason = resolve_incremental_ingest_range(
        league_id=int(league_id),
        settings=settings,
        bootstrap_days=14,
    )

    def _iso(value):
        if value is None:
            return None
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        return value

    if start_day is None:
        self.update_state(state="PROGRESS", meta={"progress": 100, "stage": "Veri havuzu zaten guncel"})
        return {
            "league_id": int(league_id),
            "ingested_count": 0,
            "feature_count": None,
            "range_start": None,
            "range_end": _iso(end_day),
            "range_reason": range_reason,
            "up_to_date": True,
            "status": {key: _iso(value) for key, value in status.items()},
        }

    self.update_state(
        state="PROGRESS",
        meta={
            "progress": 5,
            "stage": f"Eksik aralik bulundu ({start_day.isoformat()} - {end_day.isoformat()})",
        },
    )
    ingested = ingest_range(
        start_day,
        end_day,
        league_id=int(league_id),
        progress_cb=_build_progress_callback(self),
    )

    feature_count = None
    if include_feature_rebuild and ingested:
        self.update_state(
            state="PROGRESS",
            meta={"progress": 75, "stage": "Yeni veriler feature havuzuna isleniyor"},
        )
        feature_count = int(build_and_persist_features(progress_cb=_build_progress_callback(self)))
    elif include_feature_rebuild:
        self.update_state(
            state="PROGRESS",
            meta={"progress": 90, "stage": "Yeni fixture bulunmadi, feature havuzu ayni kaldi"},
        )

    self.update_state(state="PROGRESS", meta={"progress": 100, "stage": "Guncel veri islemi tamamlandi"})
    return {
        "league_id": int(league_id),
        "ingested_count": len(ingested),
        "feature_count": feature_count,
        "range_start": _iso(start_day),
        "range_end": _iso(end_day),
        "range_reason": range_reason,
        "up_to_date": False,
        "status": {key: _iso(value) for key, value in status.items()},
    }


@celery_app.task(bind=True)
def build_features_task(self):
    logger.info("Building features via Celery task")
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Task basladi"})
    count = build_and_persist_features(progress_cb=_build_progress_callback(self))
    return {"feature_count": count}


@celery_app.task(bind=True)
def build_features_full_rebuild_task(self):
    logger.info("Building features via Celery full rebuild task")
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Task basladi"})
    count = build_and_persist_features(progress_cb=_build_progress_callback(self), full_rebuild=True)
    return {"feature_count": count, "full_rebuild": True}


@celery_app.task(bind=True)
def train_models_task(
    self,
    limit: Optional[int] = None,
    league_id: int = TRAIN_SUPERLIG_LEAGUE_ID,
    model_name: Optional[str] = None,
    data_sources: Optional[List[str]] = None,
    description: Optional[str] = None,
    set_active: bool = True,
    created_by_user_id: Optional[int] = None,
    created_by_username: Optional[str] = None,
    created_by_role: Optional[str] = None,
    model_scope: Optional[str] = None,
    training_mode: Optional[str] = None,
    training_date_from: Optional[str] = None,
    training_date_to: Optional[str] = None,
    refresh_mode: Optional[str] = None,
    refresh_start_date: Optional[str] = None,
    refresh_end_date: Optional[str] = None,
    refresh_include_feature_rebuild: bool = True,
):
    logger.info(
        "Training models via Celery task (limit={}, league_id={}, model_name={}, set_active={}, mode={}, refresh={})",
        limit,
        league_id,
        model_name,
        set_active,
        training_mode,
        refresh_mode,
    )
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Task basladi"})

    def _parse_date(value: Optional[str]) -> Optional[date]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value)).date()
        except Exception:
            return None

    normalized_refresh = str(refresh_mode or "none").strip().lower()
    parsed_training_from = _parse_date(training_date_from)
    parsed_training_to = _parse_date(training_date_to)

    if normalized_refresh == "incremental":
        self.update_state(state="PROGRESS", meta={"progress": 8, "stage": "Guncel veri araligi kontrol ediliyor"})
        start_day, end_day, _, _ = resolve_incremental_ingest_range(
            league_id=int(league_id),
            settings=settings,
            bootstrap_days=14,
        )
        ingested_ids = []
        if start_day is not None:
            ingested_ids = ingest_range(
                start_day,
                end_day,
                league_id=int(league_id),
                progress_cb=_build_progress_callback(self),
            )
        else:
            self.update_state(state="PROGRESS", meta={"progress": 22, "stage": "Veri havuzu zaten guncel"})
        if refresh_include_feature_rebuild:
            self.update_state(
                state="PROGRESS",
                meta={
                    "progress": 65,
                    "stage": "Feature havuzu son ham verilere gore yenileniyor"
                    if not ingested_ids
                    else "Yeni fixture verileri feature tablosuna isleniyor",
                },
            )
            build_and_persist_features(progress_cb=_build_progress_callback(self))
    elif normalized_refresh == "date_range":
        start_day = _parse_date(refresh_start_date)
        end_day = _parse_date(refresh_end_date)
        if not start_day or not end_day:
            raise ValueError("Date range refresh icin refresh_start_date ve refresh_end_date gerekli.")
        if end_day < start_day:
            raise ValueError("refresh_end_date refresh_start_date tarihinden once olamaz.")
        self.update_state(
            state="PROGRESS",
            meta={"progress": 8, "stage": f"Tarih araligindan veri cekiliyor ({start_day} - {end_day})"},
        )
        ingested_ids = ingest_range(
            start_day,
            end_day,
            league_id=int(league_id),
            progress_cb=_build_progress_callback(self),
        )
        if refresh_include_feature_rebuild and ingested_ids:
            self.update_state(
                state="PROGRESS",
                meta={"progress": 65, "stage": "Tarih araligi verileri feature tablosuna isleniyor"},
            )
            build_and_persist_features(progress_cb=_build_progress_callback(self))

    return run_training(
        limit=limit,
        league_id=league_id,
        model_name=model_name,
        data_sources=data_sources,
        description=description,
        set_active=set_active,
        created_by_user_id=created_by_user_id,
        created_by_username=created_by_username,
        created_by_role=created_by_role,
        model_scope=model_scope,
        training_mode=training_mode,
        training_date_from=parsed_training_from,
        training_date_to=parsed_training_to,
        progress_cb=_build_progress_callback(self),
    )


@celery_app.task(bind=True)
def refresh_fixture_board_cache_task(
    self,
    trigger_type: str = "scheduled",
    requested_by: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    league_ids: Optional[List[int]] = None,
):
    logger.info(
        "Refreshing fixture board cache (trigger_type={}, requested_by={}, date_from={}, date_to={}, league_ids={})",
        trigger_type,
        requested_by,
        date_from,
        date_to,
        league_ids,
    )
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Task basladi"})

    def _parse_date(value: Optional[str]) -> Optional[date]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value)).date()
        except Exception:
            return None

    parsed_date_from = _parse_date(date_from)
    parsed_date_to = _parse_date(date_to)
    if str(trigger_type or "").strip().lower() == "scheduled_live_window":
        today_utc = datetime.now(timezone.utc).date()
        parsed_date_from = today_utc
        parsed_date_to = today_utc

    return refresh_fixture_board_cache(
        settings=settings,
        trigger_type=trigger_type,
        requested_by=int(requested_by) if requested_by is not None else None,
        date_from=parsed_date_from,
        date_to=parsed_date_to,
        league_ids=league_ids,
        progress_cb=_build_progress_callback(self),
    )


@celery_app.task(bind=True)
def bootstrap_league_models_task(
    self,
    trigger_type: str = "scheduled",
    requested_by: Optional[int] = None,
    league_ids: Optional[List[int]] = None,
):
    logger.info(
        "Bootstrapping league models (trigger_type={}, requested_by={}, league_ids={})",
        trigger_type,
        requested_by,
        league_ids,
    )
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Lig model bootstrap task basladi"})
    return bootstrap_league_models(
        settings=settings,
        trigger_type=trigger_type,
        requested_by=int(requested_by) if requested_by is not None else None,
        league_ids=league_ids,
        progress_cb=_build_progress_callback(self),
    )


@celery_app.task(bind=True)
def models_reset_and_reseed_pro_task(
    self,
    trigger_type: str = "manual",
    requested_by: Optional[int] = None,
    league_ids: Optional[List[int]] = None,
):
    logger.info(
        "Running models reset and reseed task (trigger_type={}, requested_by={}, league_ids={})",
        trigger_type,
        requested_by,
        league_ids,
    )
    progress_cb = _build_progress_callback(self)
    progress_cb(1, "Model reset ve configured leagues reseed task basladi", {"trigger_type": trigger_type})

    target_leagues = parse_league_model_ids(
        settings,
        league_ids=league_ids or [600, 564, 8, 384, 2, 5],  # Including Champions League (2) and Europa League (5)
    )

    purge_report = purge_registered_models(remove_root_artifacts=True)
    progress_cb(
        18,
        "Model registry ve artifact klasorleri temizlendi",
        {
            "removed_model_count": purge_report.get("removed_model_count"),
            "previous_active_model_id": purge_report.get("previous_active_model_id"),
        },
    )

    engine = create_engine(settings.db_url)
    ensure_league_default_models_table(engine)
    ensure_league_model_rollout_table(engine)
    with engine.begin() as conn:
        defaults_deleted = int(conn.execute(text(f"DELETE FROM {LEAGUE_DEFAULT_MODELS_TABLE}")).rowcount or 0)
        rollout_deleted = int(conn.execute(text(f"DELETE FROM {LEAGUE_MODEL_ROLLOUT_TABLE}")).rowcount or 0)

    progress_cb(
        30,
        "League model mapping tablolari temizlendi",
        {
            "league_defaults_deleted": defaults_deleted,
            "league_rollout_deleted": rollout_deleted,
        },
    )

    def _phase_progress(start: int, end: int):
        span = max(1, end - start)

        def _inner(progress: int, stage: str, extra: Optional[Dict[str, object]] = None) -> None:
            clipped = max(0, min(100, int(progress)))
            mapped = int(start + (clipped / 100.0) * span)
            progress_cb(mapped, stage, extra)

        return _inner

    feature_count = int(
        build_and_persist_features(
            progress_cb=_phase_progress(31, 64),
            full_rebuild=True,
        )
    )

    progress_cb(
        66,
        "Feature full rebuild tamamlandi",
        {
            "feature_count": feature_count,
            "full_rebuild": True,
        },
    )

    bootstrap_result = bootstrap_league_models(
        settings=settings,
        trigger_type="models-reset-and-reseed-pro",
        requested_by=int(requested_by) if requested_by is not None else None,
        league_ids=target_leagues,
        progress_cb=_phase_progress(67, 98),
    )

    strict_mapping = validate_league_default_mapping(settings, league_ids=target_leagues)
    if not bool(strict_mapping.get("is_complete")):
        unresolved = strict_mapping.get("unresolved") or []
        raise RuntimeError(
            "Reseed strict mapping failed for leagues: " + ", ".join(str(item) for item in unresolved)
        )

    progress_cb(100, "Model reset ve configured leagues pro reseed tamamlandi")
    return {
        "trigger_type": trigger_type,
        "requested_by": int(requested_by) if requested_by is not None else None,
        "league_ids": target_leagues,
        "purge": purge_report,
        "db_cleanup": {
            "league_defaults_deleted": defaults_deleted,
            "league_rollout_deleted": rollout_deleted,
        },
        "feature_count": feature_count,
        "bootstrap": bootstrap_result,
        "strict_mapping": strict_mapping,
    }


@celery_app.task(
    bind=True,
    soft_time_limit=max(10, int(settings.coupon_generation_soft_time_limit_seconds)),
    time_limit=max(15, int(settings.coupon_generation_soft_time_limit_seconds) + 15),
)
def generate_coupons_task(
    self,
    run_id: int,
):
    logger.info("Generating smart coupons run_id={}", run_id)
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Kupon task basladi"})
    return process_coupon_generation_run(
        run_id=int(run_id),
        settings=settings,
        progress_cb=_build_progress_callback(self),
    )
