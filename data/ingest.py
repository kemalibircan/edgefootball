from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Dict, List, Optional

from loguru import logger
from sqlalchemy import JSON, Column, DateTime, Integer, MetaData, Table, create_engine, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from sportmonks_client.client import SportMonksClient

DEFAULT_SUPERLIG_LEAGUE_ID = 600
DETAIL_INCLUDES = [
    "participants",
    "statistics",
    "statistics.type",
    "trends",
    "weatherreport",
    "lineups",
    "sidelined",
    "referees",
    "formations",
    "ballcoordinates",
    "scores",
    "odds",
]
SEASON_BULK_INCLUDES = [
    "fixtures.participants",
    "fixtures.statistics",
    "fixtures.statistics.type",
    "fixtures.weatherreport",
    "fixtures.referees",
    "fixtures.scores",
]

metadata = MetaData()

raw_fixtures_table = Table(
    "raw_fixtures",
    metadata,
    Column("fixture_id", Integer, primary_key=True),
    Column("payload", JSON, nullable=False),
    Column("ingested_at", DateTime, default=datetime.utcnow),
)

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


def ensure_tables(engine) -> None:
    metadata.create_all(engine)


def _extract_pages(payload: dict) -> tuple[int, int]:
    pagination = payload.get("pagination") or payload.get("meta", {}).get("pagination") or {}
    current_page = int(pagination.get("current_page") or 1)
    last_page = int(pagination.get("last_page") or current_page)
    return current_page, last_page


def _parse_datetime(value: Optional[str]) -> datetime:
    if not value:
        return datetime(1970, 1, 1)
    text_value = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text_value)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(text_value, fmt)
            except ValueError:
                continue
    return datetime(1970, 1, 1)


def _league_filter(fixture: dict, league_id: int) -> bool:
    league_value = fixture.get("league_id")
    if league_value is not None:
        try:
            return int(league_value) == league_id
        except (TypeError, ValueError):
            return False
    league_obj = fixture.get("league") or {}
    if league_obj.get("id") is not None:
        try:
            return int(league_obj["id"]) == league_id
        except (TypeError, ValueError):
            return False
    return False


def _is_past_fixture(fixture: dict) -> bool:
    dt = _parse_datetime(fixture.get("starting_at"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt <= datetime.now(timezone.utc)


def _build_client() -> SportMonksClient:
    settings = get_settings()
    return SportMonksClient(
        api_token=settings.sportmonks_api_token,
        dummy_mode=settings.dummy_mode,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        cache_ttl=settings.cache_ttl_seconds,
    )


def fetch_fixture_ids_by_date_range(
    client: SportMonksClient,
    start: date,
    end: date,
    league_id: Optional[int] = None,
) -> List[int]:
    if client.dummy_mode:
        return [999999]

    fixture_ids: List[int] = []
    current_day = start
    day_count = 0
    while current_day <= end:
        url = f"/fixtures/date/{current_day}"
        page = 1
        while True:
            data = client._request("GET", url, params={"page": page, "per_page": 100})

            fixtures = data.get("data", []) or []
            if league_id is not None:
                fixtures = [f for f in fixtures if _league_filter(f, league_id)]

            fixture_ids.extend(int(f["id"]) for f in fixtures if f.get("id") is not None)

            current_page, last_page = _extract_pages(data)
            if current_page >= last_page:
                break
            page += 1

        day_count += 1
        if day_count % 14 == 0:
            logger.info("Scanned {} days (up to {})", day_count, current_day)
        current_day = current_day + timedelta(days=1)

    return list(dict.fromkeys(fixture_ids))


def fetch_fixture_ids_by_league_history(
    client: SportMonksClient,
    league_id: int,
    target_count: int = 2000,
) -> List[int]:
    if client.dummy_mode:
        return [999999]

    league_payload = client.get_league(league_id, includes=["seasons"])
    seasons = (league_payload.get("data") or {}).get("seasons") or []
    if not seasons:
        return []

    seasons_sorted = sorted(
        seasons,
        key=lambda s: _parse_datetime(s.get("starting_at")),
        reverse=True,
    )

    fixture_rows: List[Dict[str, str]] = []
    for idx, season in enumerate(seasons_sorted, start=1):
        season_id = season.get("id")
        if not season_id:
            continue

        season_payload = client.get_season(int(season_id), includes=["fixtures"])
        season_fixtures = (season_payload.get("data") or {}).get("fixtures") or []
        for fixture in season_fixtures:
            fixture_id = fixture.get("id")
            if fixture_id is None:
                continue
            if not _league_filter(fixture, league_id):
                continue
            fixture_rows.append(
                {
                    "fixture_id": int(fixture_id),
                    "starting_at": fixture.get("starting_at"),
                }
            )

        if idx % 4 == 0:
            logger.info("Loaded fixtures from {} seasons for league {}", idx, league_id)

    fixture_rows_sorted = sorted(
        fixture_rows,
        key=lambda row: _parse_datetime(row.get("starting_at")),
        reverse=True,
    )

    fixture_ids = [row["fixture_id"] for row in fixture_rows_sorted]
    unique_ids = list(dict.fromkeys(fixture_ids))
    selected = unique_ids[:target_count]

    if len(selected) < target_count:
        logger.warning(
            "Requested {} fixtures for league {} but only {} are available",
            target_count,
            league_id,
            len(selected),
        )

    return selected


def ingest_fixture_ids(
    fixture_ids: List[int],
    *,
    client: SportMonksClient,
    progress_cb: ProgressCallback = None,
    start_progress: int = 0,
    end_progress: int = 100,
) -> List[int]:
    settings = get_settings()
    engine = create_engine(settings.db_url)
    ensure_tables(engine)

    ingested_ids: List[int] = []
    total = len(fixture_ids)
    if total == 0:
        return ingested_ids

    _emit_progress(
        progress_cb,
        start_progress,
        "Fixture detaylari cekiliyor ve ham veriler kaydediliyor",
        {"processed": 0, "total": total},
    )

    with engine.begin() as conn:
        for idx, fixture_id in enumerate(fixture_ids, start=1):
            try:
                payload = client.get_fixture(fixture_id, includes=DETAIL_INCLUDES).model_dump(mode="json")
            except Exception as exc:  # pragma: no cover
                logger.warning("Skipping fixture {} due fetch error: {}", fixture_id, exc.__class__.__name__)
                continue

            stmt = pg_insert(raw_fixtures_table).values(
                fixture_id=fixture_id,
                payload=payload,
                ingested_at=datetime.utcnow(),
            ).on_conflict_do_update(
                index_elements=[raw_fixtures_table.c.fixture_id],
                set_={"payload": payload, "ingested_at": datetime.utcnow()},
            )
            conn.execute(stmt)
            ingested_ids.append(fixture_id)

            progress = start_progress + ((idx / total) * (end_progress - start_progress))
            _emit_progress(
                progress_cb,
                progress,
                "Fixture detaylari cekiliyor ve ham veriler kaydediliyor",
                {"processed": idx, "total": total, "fixture_id": fixture_id},
            )

            if idx % 50 == 0 or idx == len(fixture_ids):
                logger.info("Ingest progress: {}/{} fixtures", idx, len(fixture_ids))

    _emit_progress(
        progress_cb,
        end_progress,
        "Ingest tamamlandi",
        {"processed": total, "total": total},
    )
    return ingested_ids


def ingest_range(start: date, end: date, league_id: Optional[int] = None, progress_cb: ProgressCallback = None) -> List[int]:
    client = _build_client()
    _emit_progress(progress_cb, 5, "Tarih araligi fixture listesi toplaniyor")
    fixture_ids = fetch_fixture_ids_by_date_range(client, start, end, league_id=league_id)
    _emit_progress(
        progress_cb,
        25,
        "Fixture listesi hazirlandi",
        {"total": len(fixture_ids)},
    )
    logger.info(
        "Found {} fixtures between {} and {}{}",
        len(fixture_ids),
        start,
        end,
        f" for league {league_id}" if league_id is not None else "",
    )
    return ingest_fixture_ids(
        fixture_ids,
        client=client,
        progress_cb=progress_cb,
        start_progress=25,
        end_progress=100,
    )


def ingest_league_history(
    league_id: int = DEFAULT_SUPERLIG_LEAGUE_ID,
    target_count: int = 2000,
    progress_cb: ProgressCallback = None,
) -> List[int]:
    client = _build_client()
    settings = get_settings()
    engine = create_engine(settings.db_url)
    ensure_tables(engine)

    _emit_progress(progress_cb, 5, "Lig sezonlari yukleniyor")
    fixture_ids = fetch_fixture_ids_by_league_history(
        client=client,
        league_id=int(league_id),
        target_count=int(target_count),
    )
    _emit_progress(
        progress_cb,
        25,
        "Lig fixture listesi hazirlandi",
        {"league_id": int(league_id), "target_count": int(target_count), "fixture_count": len(fixture_ids)},
    )

    logger.info(
        "League history fixture list prepared for league {}: {} fixtures",
        league_id,
        len(fixture_ids),
    )
    return ingest_fixture_ids(
        fixture_ids=fixture_ids,
        client=client,
        progress_cb=progress_cb,
        start_progress=25,
        end_progress=100,
    )


def get_league_data_pool_status(league_id: int, settings=None) -> dict:
    resolved_settings = settings or get_settings()
    safe_league_id = int(league_id)
    league_text = str(safe_league_id)
    league_text_decimal = f"{safe_league_id}.0"
    league_numeric = float(safe_league_id)
    engine = create_engine(resolved_settings.db_url)

    status = {
        "league_id": safe_league_id,
        "raw_fixture_count": 0,
        "feature_count": 0,
        "labeled_feature_count": 0,
        "last_ingested_at": None,
        "last_raw_fixture_date": None,
        "last_feature_event_date": None,
        "anchor_date": None,
        "missing_from_date": None,
        "missing_to_date": None,
        "missing_days": 0,
        "has_missing_range": False,
    }

    try:
        with engine.connect() as conn:
            raw_row = conn.execute(
                text(
                    """
                    SELECT
                        COUNT(*) AS raw_fixture_count,
                        MAX(ingested_at) AS last_ingested_at,
                        MAX(SUBSTRING(COALESCE(payload->'data'->>'starting_at', '') FROM 1 FOR 10)) AS last_raw_fixture_date
                    FROM raw_fixtures
                    WHERE (
                        payload->'data'->>'league_id' = :league_text
                        OR payload->'data'->>'league_id' = :league_text_decimal
                        OR (
                            (payload->'data'->>'league_id') ~ '^[0-9]+(\\.[0-9]+)?$'
                            AND CAST(payload->'data'->>'league_id' AS DOUBLE PRECISION) = :league_numeric
                        )
                    )
                    """
                ),
                {
                    "league_text": league_text,
                    "league_text_decimal": league_text_decimal,
                    "league_numeric": league_numeric,
                },
            ).mappings().first()

            if raw_row:
                status["raw_fixture_count"] = int(raw_row.get("raw_fixture_count") or 0)
                status["last_ingested_at"] = raw_row.get("last_ingested_at")
                last_raw_date_text = str(raw_row.get("last_raw_fixture_date") or "").strip()
                if last_raw_date_text:
                    try:
                        status["last_raw_fixture_date"] = datetime.fromisoformat(last_raw_date_text).date()
                    except ValueError:
                        status["last_raw_fixture_date"] = None

            feature_row = conn.execute(
                text(
                    """
                    SELECT
                        COUNT(*) AS feature_count,
                        COUNT(*) FILTER (
                            WHERE label_home_goals IS NOT NULL AND label_away_goals IS NOT NULL
                        ) AS labeled_feature_count,
                        MAX(event_date) AS last_feature_event_date
                    FROM features
                    WHERE (
                        feature_vector->>'league_id' = :league_text
                        OR feature_vector->>'league_id' = :league_text_decimal
                        OR (
                            (feature_vector->>'league_id') ~ '^[0-9]+(\\.[0-9]+)?$'
                            AND CAST(feature_vector->>'league_id' AS DOUBLE PRECISION) = :league_numeric
                        )
                    )
                    """
                ),
                {
                    "league_text": league_text,
                    "league_text_decimal": league_text_decimal,
                    "league_numeric": league_numeric,
                },
            ).mappings().first()

            if feature_row:
                status["feature_count"] = int(feature_row.get("feature_count") or 0)
                status["labeled_feature_count"] = int(feature_row.get("labeled_feature_count") or 0)
                status["last_feature_event_date"] = feature_row.get("last_feature_event_date")
    except SQLAlchemyError:
        return status

    anchor_date = None
    last_feature_event_date = status.get("last_feature_event_date")
    if isinstance(last_feature_event_date, datetime):
        anchor_date = last_feature_event_date.date()
    elif isinstance(last_feature_event_date, date):
        anchor_date = last_feature_event_date
    elif isinstance(status.get("last_raw_fixture_date"), date):
        anchor_date = status["last_raw_fixture_date"]

    status["anchor_date"] = anchor_date

    if anchor_date is None:
        return status

    today_utc = datetime.now(timezone.utc).date()
    missing_from_date = anchor_date + timedelta(days=1)
    missing_to_date = today_utc
    has_missing = missing_from_date <= missing_to_date
    status["has_missing_range"] = has_missing
    if has_missing:
        status["missing_from_date"] = missing_from_date
        status["missing_to_date"] = missing_to_date
        status["missing_days"] = int((missing_to_date - missing_from_date).days + 1)

    return status


def resolve_incremental_ingest_range(
    league_id: int,
    *,
    settings=None,
    bootstrap_days: int = 14,
    end_day: Optional[date] = None,
) -> tuple[Optional[date], date, dict, str]:
    status = get_league_data_pool_status(league_id=league_id, settings=settings)
    safe_bootstrap_days = max(1, int(bootstrap_days or 14))
    final_end_day = end_day or datetime.now(timezone.utc).date()

    if status.get("has_missing_range"):
        start_day = status.get("missing_from_date")
        range_reason = "missing_range"
    elif status.get("anchor_date") is None:
        start_day = final_end_day - timedelta(days=safe_bootstrap_days)
        range_reason = "bootstrap"
    else:
        start_day = None
        range_reason = "up_to_date"

    if isinstance(start_day, date) and start_day > final_end_day:
        start_day = None
        range_reason = "up_to_date"

    return start_day, final_end_day, status, range_reason


def parse_args():
    parser = argparse.ArgumentParser(description="Ingest SportMonks fixtures")
    parser.add_argument("--mode", choices=["date", "league-history", "league"], default="date")
    parser.add_argument("--start-date", required=False, help="YYYY-MM-DD", default=date.today().isoformat())
    parser.add_argument("--end-date", required=False, help="YYYY-MM-DD", default=date.today().isoformat())
    parser.add_argument("--league-id", required=False, type=int)
    parser.add_argument("--target-count", required=False, type=int, default=2000)
    return parser.parse_args()


def main():
    args = parse_args()
    if args.mode in {"league-history", "league"}:
        league_id = args.league_id if args.league_id is not None else DEFAULT_SUPERLIG_LEAGUE_ID
        ingest_league_history(league_id=league_id, target_count=args.target_count)
        return

    start = datetime.fromisoformat(args.start_date).date()
    end = datetime.fromisoformat(args.end_date).date()
    ingest_range(start, end, league_id=args.league_id)


if __name__ == "__main__":
    main()
