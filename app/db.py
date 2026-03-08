from __future__ import annotations

from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from app.config import Settings


@lru_cache(maxsize=8)
def _build_engine(db_url: str) -> Engine:
    return create_engine(
        str(db_url),
        pool_pre_ping=True,
    )


def get_engine(settings: Settings) -> Engine:
    return _build_engine(str(settings.db_url))


def clear_engine_cache() -> None:
    _build_engine.cache_clear()
