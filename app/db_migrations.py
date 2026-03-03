from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from loguru import logger
from sqlalchemy import text

from app.config import Settings
from app.db import get_engine

SCHEMA_MIGRATIONS_TABLE = "schema_migrations"
MIGRATION_LOCK_ID = 712_045_901


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def resolve_migrations_dir(settings: Settings) -> Path:
    configured = str(settings.db_migrations_dir or "migrations").strip()
    path = Path(configured)
    if not path.is_absolute():
        path = _project_root() / path
    return path


def _read_checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_migration_files(path: Path) -> list[Path]:
    return sorted([item for item in path.glob("*.sql") if item.is_file()], key=lambda item: item.name)


def run_startup_migrations(settings: Settings) -> dict[str, Any]:
    if not bool(settings.db_run_startup_migrations):
        logger.info("Startup migrations disabled via DB_RUN_STARTUP_MIGRATIONS=false")
        return {"status": "disabled", "applied": [], "skipped": []}

    migrations_dir = resolve_migrations_dir(settings)
    if not migrations_dir.exists() or not migrations_dir.is_dir():
        raise RuntimeError(f"Migration directory not found: {migrations_dir}")

    migration_files = _load_migration_files(migrations_dir)
    if not migration_files:
        logger.warning("No migration files found under {}", migrations_dir)
        return {"status": "no_files", "applied": [], "skipped": []}

    engine = get_engine(settings)
    applied_versions: list[str] = []
    skipped_versions: list[str] = []

    with engine.connect() as raw_conn:
        conn = raw_conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": MIGRATION_LOCK_ID})
        try:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE IF NOT EXISTS {SCHEMA_MIGRATIONS_TABLE} (
                        version TEXT PRIMARY KEY,
                        checksum TEXT NOT NULL,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            existing_rows = conn.execute(
                text(
                    f"""
                    SELECT version, checksum
                    FROM {SCHEMA_MIGRATIONS_TABLE}
                    """
                )
            ).mappings().all()
            existing = {str(row["version"]): str(row["checksum"]) for row in existing_rows}

            for migration_file in migration_files:
                version = migration_file.name
                checksum = _read_checksum(migration_file)
                previous_checksum = existing.get(version)
                if previous_checksum:
                    if previous_checksum != checksum:
                        raise RuntimeError(
                            f"Checksum mismatch for migration {version}: "
                            f"expected={previous_checksum} current={checksum}"
                        )
                    skipped_versions.append(version)
                    continue

                sql_script = migration_file.read_text(encoding="utf-8")
                if sql_script.strip():
                    conn.exec_driver_sql(sql_script)
                conn.execute(
                    text(
                        f"""
                        INSERT INTO {SCHEMA_MIGRATIONS_TABLE} (version, checksum, applied_at)
                        VALUES (:version, :checksum, NOW())
                        """
                    ),
                    {"version": version, "checksum": checksum},
                )
                applied_versions.append(version)
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": MIGRATION_LOCK_ID})

    logger.info(
        "Startup migrations completed. applied_count={} skipped_count={} dir={}",
        len(applied_versions),
        len(skipped_versions),
        str(migrations_dir),
    )
    if applied_versions:
        logger.info("Applied migrations: {}", ", ".join(applied_versions))
    return {"status": "ok", "applied": applied_versions, "skipped": skipped_versions}
