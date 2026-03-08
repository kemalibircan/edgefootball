from __future__ import annotations

from pathlib import Path

import pytest

from app.config import Settings
from app import db_migrations


class _FakeResult:
    def __init__(self, rows=None):
        self._rows = list(rows or [])

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)


class _FakeConn:
    def __init__(self):
        self.rows: list[dict[str, str]] = []
        self.scripts: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execution_options(self, **_kwargs):
        return self

    def execute(self, statement, params=None):
        sql = str(statement).strip().lower()
        if "pg_advisory_lock" in sql or "pg_advisory_unlock" in sql:
            return _FakeResult()
        if "create table if not exists schema_migrations" in sql:
            return _FakeResult()
        if "select version, checksum" in sql:
            return _FakeResult(self.rows)
        if "insert into schema_migrations" in sql:
            self.rows.append(
                {
                    "version": str(params["version"]),
                    "checksum": str(params["checksum"]),
                }
            )
            return _FakeResult()
        raise AssertionError(f"Unexpected SQL: {statement}")

    def exec_driver_sql(self, sql_script):
        self.scripts.append(str(sql_script))
        return _FakeResult()


class _FakeEngine:
    def __init__(self, conn: _FakeConn):
        self._conn = conn

    def connect(self):
        return self._conn


def _settings(migrations_dir: Path) -> Settings:
    return Settings(
        db_run_startup_migrations=True,
        db_migrations_dir=str(migrations_dir),
        dummy_mode=True,
        sportmonks_api_token=None,
    )


def test_startup_migrations_apply_then_skip(monkeypatch, tmp_path):
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir(parents=True, exist_ok=True)
    (migrations_dir / "001_alpha.sql").write_text("CREATE TABLE alpha(id INT);", encoding="utf-8")
    (migrations_dir / "002_beta.sql").write_text("CREATE TABLE beta(id INT);", encoding="utf-8")

    conn = _FakeConn()
    monkeypatch.setattr(db_migrations, "get_engine", lambda settings: _FakeEngine(conn))

    first = db_migrations.run_startup_migrations(_settings(migrations_dir))
    second = db_migrations.run_startup_migrations(_settings(migrations_dir))

    assert first["status"] == "ok"
    assert first["applied"] == ["001_alpha.sql", "002_beta.sql"]
    assert first["skipped"] == []
    assert second["status"] == "ok"
    assert second["applied"] == []
    assert second["skipped"] == ["001_alpha.sql", "002_beta.sql"]
    assert len(conn.scripts) == 2


def test_startup_migrations_raise_on_checksum_mismatch(monkeypatch, tmp_path):
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir(parents=True, exist_ok=True)
    migration_file = migrations_dir / "001_alpha.sql"
    migration_file.write_text("CREATE TABLE alpha(id INT);", encoding="utf-8")

    conn = _FakeConn()
    monkeypatch.setattr(db_migrations, "get_engine", lambda settings: _FakeEngine(conn))

    db_migrations.run_startup_migrations(_settings(migrations_dir))
    migration_file.write_text("CREATE TABLE alpha(id BIGINT);", encoding="utf-8")

    with pytest.raises(RuntimeError, match="Checksum mismatch"):
        db_migrations.run_startup_migrations(_settings(migrations_dir))
