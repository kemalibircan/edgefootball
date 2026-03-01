from __future__ import annotations

import json
import math
import threading
import unicodedata
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.admin import SAVED_PREDICTIONS_TABLE, _ensure_saved_predictions_table
from app.config import Settings, get_settings
from app.fixture_board import FIXTURE_BOARD_CACHE_TABLE, ensure_fixture_board_tables

router = APIRouter(tags=["seo"])

BLOG_POSTS_TABLE = "blog_posts"
BLOG_POST_TRANSLATIONS_TABLE = "blog_post_translations"

MAX_URLS_PER_SITEMAP = 45_000

_CACHE_LOCK = threading.Lock()
_CACHE: dict[str, tuple[datetime, str]] = {}


def invalidate_seo_cache(prefix: Optional[str] = None) -> None:
    with _CACHE_LOCK:
        if not prefix:
            _CACHE.clear()
            return
        keys = [key for key in _CACHE.keys() if key.startswith(prefix)]
        for key in keys:
            _CACHE.pop(key, None)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _cache_get(key: str, ttl_seconds: int) -> Optional[str]:
    now_utc = _utc_now()
    with _CACHE_LOCK:
        cached = _CACHE.get(key)
        if not cached:
            return None
        expires_at, payload = cached
        if expires_at <= now_utc:
            _CACHE.pop(key, None)
            return None
        return payload


def _cache_set(key: str, payload: str, ttl_seconds: int) -> None:
    ttl = max(1, int(ttl_seconds))
    expires_at = _utc_now() + timedelta(seconds=ttl)
    with _CACHE_LOCK:
        _CACHE[key] = (expires_at, payload)


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").strip())
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_text.lower()
    out: list[str] = []
    prev_dash = False
    for ch in lowered:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    slug = "".join(out).strip("-")
    return slug or "match"


def _absolute_url(settings: Settings, path: str) -> str:
    base = str(settings.site_base_url or "http://localhost:3001").rstrip("/")
    safe_path = str(path or "/")
    if not safe_path.startswith("/"):
        safe_path = "/" + safe_path
    return f"{base}{safe_path}"


def _to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc).isoformat()
    text_value = str(value).strip()
    return text_value or None


def _xml_response(payload: str) -> Response:
    return Response(content=payload, media_type="application/xml; charset=utf-8")


def _render_urlset(entries: list[dict[str, Any]]) -> str:
    lines = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for item in entries:
        loc = escape(str(item.get("loc") or ""), quote=False)
        if not loc:
            continue
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lastmod = item.get("lastmod")
        if lastmod:
            lines.append(f"    <lastmod>{escape(str(lastmod), quote=False)}</lastmod>")
        changefreq = item.get("changefreq")
        if changefreq:
            lines.append(f"    <changefreq>{escape(str(changefreq), quote=False)}</changefreq>")
        priority = item.get("priority")
        if priority is not None:
            try:
                lines.append(f"    <priority>{float(priority):.1f}</priority>")
            except (TypeError, ValueError):
                pass
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines)


def _render_sitemap_index(entries: list[dict[str, Any]]) -> str:
    lines = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for item in entries:
        loc = escape(str(item.get("loc") or ""), quote=False)
        if not loc:
            continue
        lines.append("  <sitemap>")
        lines.append(f"    <loc>{loc}</loc>")
        lastmod = item.get("lastmod")
        if lastmod:
            lines.append(f"    <lastmod>{escape(str(lastmod), quote=False)}</lastmod>")
        lines.append("  </sitemap>")
    lines.append("</sitemapindex>")
    return "\n".join(lines)


def _chunk_total(total_urls: int) -> int:
    return max(1, math.ceil(max(0, int(total_urls)) / MAX_URLS_PER_SITEMAP))


def _query_blog_url_count(settings: Settings) -> int:
    engine = create_engine(settings.db_url)
    query = text(
        f"""
        SELECT COUNT(*)
        FROM {BLOG_POSTS_TABLE} p
        JOIN {BLOG_POST_TRANSLATIONS_TABLE} t ON t.post_id = p.id
        WHERE p.status = 'published'
          AND (p.publish_date IS NULL OR p.publish_date <= :now_utc)
        """
    )
    try:
        with engine.connect() as conn:
            value = conn.execute(query, {"now_utc": _utc_now()}).scalar_one()
            return int(value or 0)
    except SQLAlchemyError:
        return 0


def _query_fixture_url_count(settings: Settings) -> int:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)
    today_utc = _utc_now().date()
    lower = today_utc - timedelta(days=7)
    upper = today_utc + timedelta(days=21)
    query = text(
        f"""
        SELECT COUNT(*)
        FROM {FIXTURE_BOARD_CACHE_TABLE}
        WHERE event_date >= :date_from
          AND event_date <= :date_to
        """
    )
    try:
        with engine.connect() as conn:
            value = conn.execute(query, {"date_from": lower, "date_to": upper}).scalar_one()
            # each fixture produces two locale URLs
            return int(value or 0) * 2
    except SQLAlchemyError:
        return 0


def _query_prediction_url_count(settings: Settings) -> int:
    engine = create_engine(settings.db_url)
    _ensure_saved_predictions_table(engine)
    query = text(
        f"""
        SELECT COUNT(*)
        FROM (
            SELECT DISTINCT fixture_id
            FROM {SAVED_PREDICTIONS_TABLE}
            WHERE fixture_id IS NOT NULL
        ) x
        """
    )
    try:
        with engine.connect() as conn:
            value = conn.execute(query).scalar_one()
            return int(value or 0) * 2
    except SQLAlchemyError:
        return 0


def _static_entries(settings: Settings) -> list[dict[str, Any]]:
    now_iso = _utc_now().isoformat()
    paths = [
        ("/tr", "daily", 1.0),
        ("/en", "daily", 1.0),
        ("/tr/blog", "daily", 0.9),
        ("/en/blog", "daily", 0.9),
        ("/tr/fixtures", "daily", 0.8),
        ("/en/fixtures", "daily", 0.8),
        ("/tr/predictions", "daily", 0.8),
        ("/en/predictions", "daily", 0.8),
    ]
    return [
        {
            "loc": _absolute_url(settings, path),
            "lastmod": now_iso,
            "changefreq": changefreq,
            "priority": priority,
        }
        for path, changefreq, priority in paths
    ]


def _fixture_entries(settings: Settings, chunk: int) -> list[dict[str, Any]]:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)

    safe_chunk = max(1, int(chunk))
    rows_per_chunk = max(1, MAX_URLS_PER_SITEMAP // 2)
    offset_rows = (safe_chunk - 1) * rows_per_chunk

    today_utc = _utc_now().date()
    lower = today_utc - timedelta(days=7)
    upper = today_utc + timedelta(days=21)

    query = text(
        f"""
        SELECT fixture_id, home_team_name, away_team_name, event_date, starting_at, source_refreshed_at
        FROM {FIXTURE_BOARD_CACHE_TABLE}
        WHERE event_date >= :date_from
          AND event_date <= :date_to
        ORDER BY event_date ASC, starting_at ASC, fixture_id ASC
        LIMIT :limit_rows OFFSET :offset_rows
        """
    )

    entries: list[dict[str, Any]] = []
    with engine.connect() as conn:
        rows = conn.execute(
            query,
            {
                "date_from": lower,
                "date_to": upper,
                "limit_rows": rows_per_chunk,
                "offset_rows": offset_rows,
            },
        ).mappings().all()

    for row in rows:
        fixture_id = row.get("fixture_id")
        if fixture_id is None:
            continue
        try:
            fixture_id_int = int(fixture_id)
        except (TypeError, ValueError):
            continue

        home = str(row.get("home_team_name") or "Home")
        away = str(row.get("away_team_name") or "Away")
        match_slug = _slugify(f"{home} vs {away}")
        event_date = row.get("event_date")
        is_upcoming = bool(event_date and event_date >= today_utc)
        lastmod = _to_iso(row.get("source_refreshed_at") or row.get("starting_at") or event_date)
        changefreq = "hourly" if is_upcoming else "daily"

        for locale in ("tr", "en"):
            path = f"/{locale}/fixtures/{fixture_id_int}/{match_slug}"
            entries.append(
                {
                    "loc": _absolute_url(settings, path),
                    "lastmod": lastmod,
                    "changefreq": changefreq,
                    "priority": 0.8,
                }
            )

    return entries


def _prediction_entries(settings: Settings, chunk: int) -> list[dict[str, Any]]:
    engine = create_engine(settings.db_url)
    _ensure_saved_predictions_table(engine)

    safe_chunk = max(1, int(chunk))
    rows_per_chunk = max(1, MAX_URLS_PER_SITEMAP // 2)
    offset_rows = (safe_chunk - 1) * rows_per_chunk

    query = text(
        f"""
        SELECT DISTINCT ON (fixture_id)
               fixture_id,
               home_team_name,
               away_team_name,
               match_label,
               fixture_starting_at,
               fixture_date,
               prediction_created_at,
               updated_at
        FROM {SAVED_PREDICTIONS_TABLE}
        WHERE fixture_id IS NOT NULL
        ORDER BY fixture_id, prediction_created_at DESC, id DESC
        LIMIT :limit_rows OFFSET :offset_rows
        """
    )

    entries: list[dict[str, Any]] = []
    with engine.connect() as conn:
        rows = conn.execute(
            query,
            {
                "limit_rows": rows_per_chunk,
                "offset_rows": offset_rows,
            },
        ).mappings().all()

    for row in rows:
        fixture_id_raw = row.get("fixture_id")
        try:
            fixture_id = int(fixture_id_raw)
        except (TypeError, ValueError):
            continue

        label = str(row.get("match_label") or "").strip()
        if not label:
            home = str(row.get("home_team_name") or "Home")
            away = str(row.get("away_team_name") or "Away")
            label = f"{home} vs {away}"
        slug = _slugify(label)
        lastmod = _to_iso(row.get("updated_at") or row.get("prediction_created_at") or row.get("fixture_date"))

        for locale in ("tr", "en"):
            path = f"/{locale}/predictions/{fixture_id}/{slug}"
            entries.append(
                {
                    "loc": _absolute_url(settings, path),
                    "lastmod": lastmod,
                    "changefreq": "daily",
                    "priority": 0.8,
                }
            )

    return entries


def _blog_entries(settings: Settings, chunk: int) -> list[dict[str, Any]]:
    engine = create_engine(settings.db_url)
    safe_chunk = max(1, int(chunk))
    offset_rows = (safe_chunk - 1) * MAX_URLS_PER_SITEMAP

    query = text(
        f"""
        SELECT
            t.locale,
            t.slug,
            t.updated_at AS translation_updated_at,
            p.updated_at AS post_updated_at
        FROM {BLOG_POSTS_TABLE} p
        JOIN {BLOG_POST_TRANSLATIONS_TABLE} t ON t.post_id = p.id
        WHERE p.status = 'published'
          AND (p.publish_date IS NULL OR p.publish_date <= :now_utc)
        ORDER BY COALESCE(t.updated_at, p.updated_at) DESC, p.id DESC
        LIMIT :limit_rows OFFSET :offset_rows
        """
    )

    entries: list[dict[str, Any]] = []
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                query,
                {
                    "now_utc": _utc_now(),
                    "limit_rows": MAX_URLS_PER_SITEMAP,
                    "offset_rows": offset_rows,
                },
            ).mappings().all()
    except SQLAlchemyError:
        return entries

    for row in rows:
        locale = str(row.get("locale") or "").strip().lower()
        if locale not in {"tr", "en"}:
            continue
        slug = str(row.get("slug") or "").strip()
        if not slug:
            continue
        lastmod = _to_iso(row.get("translation_updated_at") or row.get("post_updated_at"))
        entries.append(
            {
                "loc": _absolute_url(settings, f"/{locale}/blog/{slug}"),
                "lastmod": lastmod,
                "changefreq": "weekly",
                "priority": 0.7,
            }
        )

    return entries


def _cached_xml(key: str, ttl_seconds: int, producer) -> str:
    cached = _cache_get(key, ttl_seconds)
    if cached is not None:
        return cached
    payload = producer()
    _cache_set(key, payload, ttl_seconds)
    return payload


@router.get("/sitemap.xml")
def sitemap_index(settings: Settings = Depends(get_settings)):
    ttl_seconds = int(settings.seo_sitemap_cache_ttl_seconds)
    key = "sitemap:index"

    def _build() -> str:
        now_iso = _utc_now().isoformat()
        entries: list[dict[str, Any]] = [
            {"loc": _absolute_url(settings, "/sitemaps/static.xml"), "lastmod": now_iso}
        ]

        fixture_chunks = _chunk_total(_query_fixture_url_count(settings))
        prediction_chunks = _chunk_total(_query_prediction_url_count(settings))
        blog_chunks = _chunk_total(_query_blog_url_count(settings))

        for chunk in range(1, fixture_chunks + 1):
            suffix = "" if fixture_chunks == 1 and chunk == 1 else f"-{chunk}"
            entries.append({"loc": _absolute_url(settings, f"/sitemaps/fixtures{suffix}.xml"), "lastmod": now_iso})

        for chunk in range(1, prediction_chunks + 1):
            suffix = "" if prediction_chunks == 1 and chunk == 1 else f"-{chunk}"
            entries.append({"loc": _absolute_url(settings, f"/sitemaps/predictions{suffix}.xml"), "lastmod": now_iso})

        for chunk in range(1, blog_chunks + 1):
            suffix = "" if blog_chunks == 1 and chunk == 1 else f"-{chunk}"
            entries.append({"loc": _absolute_url(settings, f"/sitemaps/blog{suffix}.xml"), "lastmod": now_iso})

        return _render_sitemap_index(entries)

    return _xml_response(_cached_xml(key, ttl_seconds, _build))


@router.get("/sitemaps/static.xml")
def static_sitemap(settings: Settings = Depends(get_settings)):
    ttl_seconds = int(settings.seo_sitemap_cache_ttl_seconds)
    key = "sitemap:static"
    return _xml_response(_cached_xml(key, ttl_seconds, lambda: _render_urlset(_static_entries(settings))))


@router.get("/sitemaps/fixtures.xml")
def fixtures_sitemap(settings: Settings = Depends(get_settings)):
    return fixture_sitemap_chunk(chunk=1, settings=settings)


@router.get("/sitemaps/fixtures-{chunk}.xml")
def fixture_sitemap_chunk(chunk: int, settings: Settings = Depends(get_settings)):
    safe_chunk = max(1, int(chunk))
    ttl_seconds = int(settings.seo_sitemap_cache_ttl_seconds)
    key = f"sitemap:fixtures:{safe_chunk}"

    def _build() -> str:
        entries = _fixture_entries(settings, safe_chunk)
        return _render_urlset(entries)

    return _xml_response(_cached_xml(key, ttl_seconds, _build))


@router.get("/sitemaps/predictions.xml")
def predictions_sitemap(settings: Settings = Depends(get_settings)):
    return prediction_sitemap_chunk(chunk=1, settings=settings)


@router.get("/sitemaps/predictions-{chunk}.xml")
def prediction_sitemap_chunk(chunk: int, settings: Settings = Depends(get_settings)):
    safe_chunk = max(1, int(chunk))
    ttl_seconds = int(settings.seo_sitemap_cache_ttl_seconds)
    key = f"sitemap:predictions:{safe_chunk}"

    def _build() -> str:
        entries = _prediction_entries(settings, safe_chunk)
        return _render_urlset(entries)

    return _xml_response(_cached_xml(key, ttl_seconds, _build))


@router.get("/sitemaps/blog.xml")
def blog_sitemap(settings: Settings = Depends(get_settings)):
    return blog_sitemap_chunk(chunk=1, settings=settings)


@router.get("/sitemaps/blog-{chunk}.xml")
def blog_sitemap_chunk(chunk: int, settings: Settings = Depends(get_settings)):
    safe_chunk = max(1, int(chunk))
    ttl_seconds = int(settings.seo_sitemap_cache_ttl_seconds)
    key = f"sitemap:blog:{safe_chunk}"

    def _build() -> str:
        entries = _blog_entries(settings, safe_chunk)
        return _render_urlset(entries)

    return _xml_response(_cached_xml(key, ttl_seconds, _build))


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots_txt(settings: Settings = Depends(get_settings)):
    lines = [
        "User-agent: *",
        "Allow: /tr",
        "Allow: /en",
        "Allow: /tr/blog",
        "Allow: /en/blog",
        "Allow: /tr/fixtures",
        "Allow: /en/fixtures",
        "Allow: /tr/predictions",
        "Allow: /en/predictions",
        "Disallow: /admin",
        "Disallow: /auth",
        "Disallow: /chat",
        "Disallow: /kuponlarim",
        "Disallow: /ai-tahminlerim",
        "Disallow: /sonuc-tahminlerim",
        "Disallow: /login",
        "Disallow: /register",
        "Disallow: /forgot-password",
        f"Sitemap: {_absolute_url(settings, '/sitemap.xml')}",
    ]
    return "\n".join(lines) + "\n"


@router.get("/predictions/public")
def predictions_public(
    locale: str = "tr",
    page: int = 1,
    page_size: int = 12,
    settings: Settings = Depends(get_settings),
):
    locale_norm = str(locale or "tr").strip().lower()
    if locale_norm not in {"tr", "en"}:
        raise HTTPException(status_code=400, detail="locale must be 'tr' or 'en'.")

    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 50))
    offset_rows = (safe_page - 1) * safe_page_size

    engine = create_engine(settings.db_url)
    _ensure_saved_predictions_table(engine)

    count_sql = text(
        f"""
        SELECT COUNT(*)
        FROM (
            SELECT DISTINCT fixture_id
            FROM {SAVED_PREDICTIONS_TABLE}
            WHERE fixture_id IS NOT NULL
        ) x
        """
    )
    rows_sql = text(
        f"""
        SELECT DISTINCT ON (fixture_id)
               id,
               fixture_id,
               fixture_date,
               fixture_starting_at,
               home_team_name,
               away_team_name,
               match_label,
               predicted_home_win,
               predicted_draw,
               predicted_away_win,
               prediction_outcome,
               model_name,
               prediction_created_at,
               updated_at
        FROM {SAVED_PREDICTIONS_TABLE}
        WHERE fixture_id IS NOT NULL
        ORDER BY fixture_id, prediction_created_at DESC, id DESC
        LIMIT :limit_rows OFFSET :offset_rows
        """
    )

    with engine.connect() as conn:
        total = int(conn.execute(count_sql).scalar_one() or 0)
        rows = conn.execute(
            rows_sql,
            {
                "limit_rows": safe_page_size,
                "offset_rows": offset_rows,
            },
        ).mappings().all()

    items: list[dict[str, Any]] = []
    for row in rows:
        fixture_id_raw = row.get("fixture_id")
        try:
            fixture_id = int(fixture_id_raw)
        except (TypeError, ValueError):
            continue

        label = str(row.get("match_label") or "").strip()
        if not label:
            home = str(row.get("home_team_name") or "Home")
            away = str(row.get("away_team_name") or "Away")
            label = f"{home} vs {away}"

        slug = _slugify(label)
        path = f"/{locale_norm}/predictions/{fixture_id}/{slug}"
        items.append(
            {
                "id": int(row.get("id") or 0),
                "fixture_id": fixture_id,
                "fixture_date": _to_iso(row.get("fixture_date")),
                "fixture_starting_at": _to_iso(row.get("fixture_starting_at")),
                "home_team_name": row.get("home_team_name"),
                "away_team_name": row.get("away_team_name"),
                "match_label": label,
                "predicted_home_win": row.get("predicted_home_win"),
                "predicted_draw": row.get("predicted_draw"),
                "predicted_away_win": row.get("predicted_away_win"),
                "prediction_outcome": row.get("prediction_outcome"),
                "model_name": row.get("model_name"),
                "prediction_created_at": _to_iso(row.get("prediction_created_at")),
                "updated_at": _to_iso(row.get("updated_at")),
                "slug": slug,
                "url": _absolute_url(settings, path),
            }
        )

    total_pages = max(1, math.ceil(total / safe_page_size)) if total else 1
    return {
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
        "items": items,
    }


@router.get("/predictions/public/{fixture_id}")
def prediction_public_detail(
    fixture_id: int,
    locale: str = "tr",
    settings: Settings = Depends(get_settings),
):
    locale_norm = str(locale or "tr").strip().lower()
    if locale_norm not in {"tr", "en"}:
        raise HTTPException(status_code=400, detail="locale must be 'tr' or 'en'.")

    if int(fixture_id) <= 0:
        raise HTTPException(status_code=400, detail="fixture_id must be positive.")

    engine = create_engine(settings.db_url)
    _ensure_saved_predictions_table(engine)

    query = text(
        f"""
        SELECT *
        FROM {SAVED_PREDICTIONS_TABLE}
        WHERE fixture_id = :fixture_id
        ORDER BY prediction_created_at DESC, id DESC
        LIMIT 1
        """
    )

    with engine.connect() as conn:
        row = conn.execute(query, {"fixture_id": int(fixture_id)}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Prediction not found.")

    payload = dict(row)
    for key in ("simulation_snapshot", "ai_snapshot"):
        value = payload.get(key)
        if isinstance(value, str):
            try:
                payload[key] = json.loads(value)
            except Exception:
                pass

    label = str(payload.get("match_label") or "").strip()
    if not label:
        home = str(payload.get("home_team_name") or "Home")
        away = str(payload.get("away_team_name") or "Away")
        label = f"{home} vs {away}"

    slug = _slugify(label)
    payload["slug"] = slug
    payload["match_label"] = label
    payload["url"] = _absolute_url(settings, f"/{locale_norm}/predictions/{int(fixture_id)}/{slug}")

    for key in (
        "fixture_starting_at",
        "prediction_created_at",
        "created_at",
        "updated_at",
        "settled_at",
        "fixture_date",
        "prediction_date",
    ):
        payload[key] = _to_iso(payload.get(key))

    return payload

