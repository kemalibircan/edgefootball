from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from math import ceil
import unicodedata
from pathlib import Path
from typing import Any, Optional

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
import pandas as pd
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.ai_commentary import generate_match_commentary
from app.auth import (
    AUTH_USERS_TABLE,
    CREDIT_TX_TABLE,
    EMAIL_CODE_PURPOSE_REGISTER,
    MANAGER_ROLES,
    ROLE_SUPERADMIN,
    AuthUser,
    _create_email_challenge,
    _normalize_email,
    _send_email_code,
    consume_ai_credits,
    get_current_user,
    hash_password,
)
from app.config import Settings, get_settings
from app.db import get_engine
from app.mailer import MailDeliveryError
from app.fixture_board import get_fixture_board_page, get_fixture_cache_status, load_cached_fixture_summaries
from app.league_model_bootstrap import get_league_model_status
from app.league_model_routing import load_league_default_models, parse_league_model_ids
from data.ingest import DEFAULT_SUPERLIG_LEAGUE_ID, get_league_data_pool_status
from modeling.registry import (
    activate_model,
    delete_model as delete_registered_model,
    get_active_model,
    get_active_model_id,
    get_model,
    list_models,
)
from modeling.simulate import simulate_fixture
from modeling.backtest import load_latest_backtest
from modeling.train import DEFAULT_SUPERLIG_LEAGUE_ID as DEFAULT_TRAIN_LEAGUE_ID
from modeling.train import get_data_source_catalog
from sportmonks_client.client import SportMonksClient
from worker.celery_app import (
    bootstrap_league_models_task,
    build_features_task,
    build_features_full_rebuild_task,
    celery_app,
    ingest_incremental_task,
    ingest_league_history_task,
    ingest_task,
    models_reset_and_reseed_pro_task,
    refresh_fixture_board_cache_task,
    train_models_task,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_user)])
SAVED_PREDICTIONS_TABLE = "saved_predictions"
PAYMENT_NOTICES_TABLE = "payment_notices"
SHOWCASE_MATCHES_TABLE = "showcase_matches"
SHOWCASE_SLIDER_IMAGES_TABLE = "showcase_slider_images"
SHOWCASE_ODDS_BANNER_TABLE = "showcase_odds_banner_settings"
SHOWCASE_SECTION_POPULAR_ODDS = "popular_odds"
SHOWCASE_SECTION_FEATURED_MATCH = "featured_match"
SHOWCASE_SECTION_KEYS = (SHOWCASE_SECTION_POPULAR_ODDS, SHOWCASE_SECTION_FEATURED_MATCH)
SHOWCASE_DEFAULT_SLIDER_IMAGES = [
    "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1486286701208-1d58e9338013?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1543357480-c60d400e2ef9?auto=format&fit=crop&w=1600&q=80",
]
SHOWCASE_DEFAULT_ODDS_BANNER = {
    "id": None,
    "banner_label": "Gunun Yapay Zeka Tahminleri",
    "left_image_url": None,
    "right_image_url": None,
    "left_title": "Sol Oyuncu",
    "left_subtitle": "Ev sahibi tarafi",
    "right_title": "Sag Oyuncu",
    "right_subtitle": "Deplasman tarafi",
    "ai_home_team_name": "Antalyaspor",
    "ai_away_team_name": "Samsunspor",
    "ai_kickoff_at": "2026-02-13T17:00:00+03:00",
    "ai_odd_home": 2.08,
    "ai_odd_draw": 3.12,
    "ai_odd_away": 2.86,
    "ai_score_home": 2,
    "ai_score_away": 1,
    "ai_insight": "AI analizi ev sahibinin bir adim onde oldugunu gosteriyor.",
    "is_active": True,
}
UPCOMING_DEFAULT_LOOKAHEAD_DAYS = 21
UPCOMING_MAX_LOOKAHEAD_DAYS = 60
FEATURED_PLAYER_PRIORITY = {
    "mauro icardi": 140,
    "victor osimhen": 136,
    "edin dzeko": 134,
    "duvan zapata": 128,
    "ciro immobile": 132,
    "rafa silva": 124,
    "abdulkerim bardakci": 110,
    "muslera": 110,
    "meret gunok": 108,
    "ugurcan cakir": 114,
    "alexander sorldth": 128,
    "kylian mbappe": 150,
    "vinicius junior": 146,
    "lamine yamal": 138,
    "robert lewandowski": 144,
    "antoine griezmann": 140,
    "jude bellingham": 146,
}
PRO_PRESET_DEFAULT_SOURCES = [
    "team_form",
    "elo",
    "injuries",
    "lineup_strength",
    "weather",
    "referee",
    "market_odds",
]
SHOWCASE_DEFAULT_ROWS: dict[str, list[dict[str, Any]]] = {
    SHOWCASE_SECTION_POPULAR_ODDS: [
        {
            "fixture_id": None,
            "home_team_name": "Antalyaspor",
            "away_team_name": "Fenerbahce",
            "home_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/31/95.png",
            "away_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/24/88.png",
            "kickoff_at": None,
            "odd_home": 2.07,
            "odd_draw": 3.07,
            "odd_away": 2.02,
            "model_score_home": 1,
            "model_score_away": 2,
        },
        {
            "fixture_id": None,
            "home_team_name": "Istanbul Basaksehir",
            "away_team_name": "Konyaspor",
            "home_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/8/312.png",
            "away_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/18/626.png",
            "kickoff_at": None,
            "odd_home": 2.14,
            "odd_draw": 3.19,
            "odd_away": 2.17,
            "model_score_home": 1,
            "model_score_away": 1,
        },
        {
            "fixture_id": None,
            "home_team_name": "Galatasaray",
            "away_team_name": "Alanyaspor",
            "home_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/2/34.png",
            "away_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/13/173.png",
            "kickoff_at": None,
            "odd_home": 2.21,
            "odd_draw": 3.31,
            "odd_away": 2.32,
            "model_score_home": 2,
            "model_score_away": 1,
        },
    ],
    SHOWCASE_SECTION_FEATURED_MATCH: [
        {
            "fixture_id": None,
            "home_team_name": "Antalyaspor",
            "away_team_name": "Fenerbahce",
            "home_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/31/95.png",
            "away_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/24/88.png",
            "kickoff_at": "2026-03-01T00:00:00+03:00",
            "odd_home": 2.08,
            "odd_draw": 3.12,
            "odd_away": 2.86,
            "model_score_home": 2,
            "model_score_away": 1,
        },
        {
            "fixture_id": None,
            "home_team_name": "Istanbul Basaksehir",
            "away_team_name": "Konyaspor",
            "home_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/8/312.png",
            "away_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/18/626.png",
            "kickoff_at": None,
            "odd_home": 2.14,
            "odd_draw": 3.19,
            "odd_away": 2.17,
            "model_score_home": 1,
            "model_score_away": 1,
        },
        {
            "fixture_id": None,
            "home_team_name": "Galatasaray",
            "away_team_name": "Alanyaspor",
            "home_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/2/34.png",
            "away_team_logo": "https://cdn.sportmonks.com/images/soccer/teams/13/173.png",
            "kickoff_at": None,
            "odd_home": 2.21,
            "odd_draw": 3.31,
            "odd_away": 2.32,
            "model_score_home": 2,
            "model_score_away": 1,
        },
    ],
}


class IngestRequest(BaseModel):
    start_date: date
    end_date: date
    league_id: Optional[int] = None


class TrainRequest(BaseModel):
    limit: Optional[int] = Field(default=None, ge=10)
    league_id: int = DEFAULT_TRAIN_LEAGUE_ID
    model_name: Optional[str] = Field(default=None, min_length=3, max_length=80)
    description: Optional[str] = Field(default=None, max_length=300)
    data_sources: Optional[list[str]] = None
    set_active: bool = True
    training_mode: str = Field(default="standard", pattern="^(standard|latest|date_range)$")
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class SuperLigHistoryIngestRequest(BaseModel):
    target_count: int = Field(default=2000, ge=1000, le=10000)
    league_id: int = DEFAULT_SUPERLIG_LEAGUE_ID


class IncrementalIngestRequest(BaseModel):
    league_id: int = DEFAULT_SUPERLIG_LEAGUE_ID
    include_feature_rebuild: bool = True


class FixturesCacheRefreshRequest(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    league_ids: Optional[list[int]] = None


class BootstrapLeagueModelsRequest(BaseModel):
    league_ids: Optional[list[int]] = None


class TaskInfo(BaseModel):
    task_id: str
    state: str
    ready: bool
    successful: bool
    result: Any = None
    meta: Any = None
    credits_remaining: Optional[int] = None


class SavePredictionRequest(BaseModel):
    fixture_id: int
    model_id: Optional[str] = None
    language: str = Field(default="tr", max_length=8)
    note: Optional[str] = Field(default=None, max_length=500)
    simulation: Optional[dict] = None
    ai_payload: Optional[dict] = None
    include_ai_if_missing: bool = False


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=6, max_length=200)
    role: str = Field(default="user", pattern="^(user|admin|superadmin)$")
    credits: Optional[int] = Field(default=None, ge=0)
    is_active: bool = False


class SetUserPasswordRequest(BaseModel):
    new_password: str = Field(min_length=6, max_length=200)


class UpdateUserCreditsRequest(BaseModel):
    delta: int = 0
    reason: Optional[str] = Field(default=None, max_length=200)


class PaymentNoticeRequest(BaseModel):
    package_key: str = Field(min_length=2, max_length=80)
    package_title: str = Field(min_length=2, max_length=120)
    chain: str = Field(pattern="^(solana|ethereum)$")
    amount_tl: int = Field(ge=1, le=1_000_000)
    transaction_id: str = Field(min_length=6, max_length=200)
    telegram_contact: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = Field(default=None, max_length=600)


class PaymentNoticeStatusRequest(BaseModel):
    status: str = Field(pattern="^(pending|approved|rejected)$")
    admin_note: Optional[str] = Field(default=None, max_length=500)


class ShowcaseMatchRowRequest(BaseModel):
    fixture_id: Optional[int] = None
    home_team_name: str = Field(min_length=1, max_length=180)
    away_team_name: str = Field(min_length=1, max_length=180)
    home_team_logo: Optional[str] = Field(default=None, max_length=1000)
    away_team_logo: Optional[str] = Field(default=None, max_length=1000)
    kickoff_at: Optional[datetime] = None
    odd_home: float = Field(ge=1.01, le=1000)
    odd_draw: float = Field(ge=1.01, le=1000)
    odd_away: float = Field(ge=1.01, le=1000)
    model_score_home: Optional[int] = Field(default=None, ge=0, le=20)
    model_score_away: Optional[int] = Field(default=None, ge=0, le=20)
    display_order: int = Field(default=0, ge=0, le=500)
    is_active: bool = True


class ShowcaseSectionUpsertRequest(BaseModel):
    rows: list[ShowcaseMatchRowRequest] = Field(default_factory=list, max_length=80)


class SliderImageRowRequest(BaseModel):
    image_url: str = Field(min_length=8, max_length=12_000_000)
    display_order: int = Field(default=0, ge=0, le=500)
    is_active: bool = True


class SliderImagesUpsertRequest(BaseModel):
    rows: list[SliderImageRowRequest] = Field(default_factory=list, max_length=20)


class OddsBannerSettingsUpsertRequest(BaseModel):
    banner_label: str = Field(default="Gunun Yapay Zeka Tahminleri", min_length=2, max_length=80)
    left_image_url: Optional[str] = Field(default=None, max_length=12_000_000)
    right_image_url: Optional[str] = Field(default=None, max_length=12_000_000)
    left_title: Optional[str] = Field(default=None, max_length=120)
    left_subtitle: Optional[str] = Field(default=None, max_length=180)
    right_title: Optional[str] = Field(default=None, max_length=120)
    right_subtitle: Optional[str] = Field(default=None, max_length=180)
    ai_home_team_name: Optional[str] = Field(default=None, max_length=180)
    ai_away_team_name: Optional[str] = Field(default=None, max_length=180)
    ai_kickoff_at: Optional[datetime] = None
    ai_odd_home: Optional[float] = Field(default=None, ge=1.01, le=1000)
    ai_odd_draw: Optional[float] = Field(default=None, ge=1.01, le=1000)
    ai_odd_away: Optional[float] = Field(default=None, ge=1.01, le=1000)
    ai_score_home: Optional[int] = Field(default=None, ge=0, le=20)
    ai_score_away: Optional[int] = Field(default=None, ge=0, le=20)
    ai_insight: Optional[str] = Field(default=None, max_length=1200)
    is_active: bool = True


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    text_value = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text_value)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(text_value, fmt)
                break
            except ValueError:
                dt = None
        if dt is None:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _extract_fixture_summary(payload: dict) -> Optional[dict]:
    data = payload.get("data") or {}
    fixture_id = data.get("id")
    if fixture_id is None:
        return None
    league_raw = data.get("league_id")
    try:
        league_id = int(league_raw) if league_raw is not None else None
    except (TypeError, ValueError):
        league_id = league_raw

    participants = data.get("participants") or []
    home = next((p for p in participants if (p.get("meta") or {}).get("location") == "home"), None)
    away = next((p for p in participants if (p.get("meta") or {}).get("location") == "away"), None)
    if home is None and len(participants) > 0:
        home = participants[0]
    if away is None and len(participants) > 1:
        away = participants[1]

    home_name = (home or {}).get("name") or "Home"
    away_name = (away or {}).get("name") or "Away"

    def _participant_logo(participant: Optional[dict]) -> Optional[str]:
        if not participant:
            return None
        for key in ("image_path", "logo_path", "image", "logo", "image_url"):
            value = participant.get(key)
            if isinstance(value, str) and value.strip():
                return value
        for key in ("image", "logo"):
            nested = participant.get(key)
            if isinstance(nested, dict):
                for nested_key in ("data", "url", "path", "image_path", "logo_path"):
                    nested_value = nested.get(nested_key)
                    if isinstance(nested_value, str) and nested_value.strip():
                        return nested_value
                nested_data = nested.get("data")
                if isinstance(nested_data, dict):
                    for nested_key in ("image_path", "logo_path", "url", "path"):
                        nested_value = nested_data.get(nested_key)
                        if isinstance(nested_value, str) and nested_value.strip():
                            return nested_value
        return None

    home_logo = _participant_logo(home)
    away_logo = _participant_logo(away)
    starting_at = data.get("starting_at")
    dt = _parse_datetime(starting_at)
    now_utc = datetime.now(timezone.utc)
    is_today_or_future = bool(dt and dt.date() >= now_utc.date())

    return {
        "fixture_id": int(fixture_id),
        "league_id": league_id,
        "starting_at": starting_at,
        "home_team_id": (home or {}).get("id"),
        "away_team_id": (away or {}).get("id"),
        "home_team_name": home_name,
        "home_team_logo": home_logo,
        "away_team_name": away_name,
        "away_team_logo": away_logo,
        "match_label": f"{home_name} vs {away_name}",
        "is_upcoming": is_today_or_future,
        "_sort_dt": dt,
    }


def _build_sportmonks_client(settings: Settings) -> SportMonksClient:
    return SportMonksClient(
        api_token=settings.sportmonks_api_token,
        dummy_mode=settings.dummy_mode,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        cache_ttl=settings.cache_ttl_seconds,
    )


def _pagination_pages(payload: dict) -> tuple[int, int]:
    pagination = payload.get("pagination") or (payload.get("meta") or {}).get("pagination") or {}
    try:
        current_page = int(pagination.get("current_page") or 1)
    except (TypeError, ValueError):
        current_page = 1
    try:
        last_page = int(pagination.get("last_page") or current_page)
    except (TypeError, ValueError):
        last_page = current_page
    return max(1, current_page), max(1, last_page)


def _merge_fixture_lists(*groups: list[dict]) -> list[dict]:
    merged: dict[int, dict] = {}
    for group in groups:
        for item in group:
            fixture_id = item.get("fixture_id")
            if fixture_id is None:
                continue
            try:
                merged[int(fixture_id)] = item
            except (TypeError, ValueError):
                continue
    return list(merged.values())


def _load_live_fixture_summaries(
    settings: Settings,
    *,
    league_id: Optional[int],
    start_day: date,
    end_day: date,
) -> list[dict]:
    if end_day < start_day:
        return []

    client = _build_sportmonks_client(settings)
    items: list[dict] = []
    current_day = start_day

    while current_day <= end_day:
        page = 1
        while True:
            payload = client.get_fixtures_by_date(
                current_day,
                includes=["participants"],
                page=page,
                per_page=100,
            )
            fixtures = payload.get("data", []) or []
            for fixture in fixtures:
                if league_id is not None:
                    fixture_league = fixture.get("league_id")
                    try:
                        if int(fixture_league) != int(league_id):
                            continue
                    except (TypeError, ValueError):
                        continue
                summary = _extract_fixture_summary({"data": fixture})
                if summary:
                    items.append(summary)

            current_page, last_page = _pagination_pages(payload)
            if current_page >= last_page:
                break
            page += 1
        current_day = current_day + timedelta(days=1)

    return _merge_fixture_lists(items)


def _extract_logo_from_team_payload(payload: dict) -> Optional[str]:
    data = payload.get("data") or {}
    for key in ("image_path", "logo_path", "image", "logo", "image_url"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    for key in ("image", "logo"):
        nested = data.get(key)
        if isinstance(nested, dict):
            for nested_key in ("url", "path", "image_path", "logo_path"):
                nested_value = nested.get(nested_key)
                if isinstance(nested_value, str) and nested_value.strip():
                    return nested_value
            nested_data = nested.get("data")
            if isinstance(nested_data, dict):
                for nested_key in ("url", "path", "image_path", "logo_path"):
                    nested_value = nested_data.get(nested_key)
                    if isinstance(nested_value, str) and nested_value.strip():
                        return nested_value
    return None


def _normalize_lookup_text(value: Any) -> str:
    text_value = str(value or "").lower().strip()
    normalized = unicodedata.normalize("NFKD", text_value)
    ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return " ".join(ascii_text.split())


def _extract_team_transfer_rows(team_payload: dict) -> list[dict]:
    data = team_payload.get("data") or {}
    players = data.get("players")
    if isinstance(players, dict):
        rows = players.get("data") or []
        return rows if isinstance(rows, list) else []
    return players if isinstance(players, list) else []


def _extract_player_data_from_transfer(row: dict) -> dict:
    player = row.get("player")
    if isinstance(player, dict):
        nested = player.get("data")
        if isinstance(nested, dict):
            return nested
        return player
    return {}


def _select_featured_player(team_payload: dict) -> Optional[dict]:
    rows = _extract_team_transfer_rows(team_payload)
    best: Optional[dict] = None
    best_score = -1

    for row in rows:
        if not isinstance(row, dict):
            continue
        player = _extract_player_data_from_transfer(row)
        if not player:
            continue

        player_name = (
            player.get("name")
            or player.get("display_name")
            or player.get("common_name")
            or f"{player.get('firstname') or ''} {player.get('lastname') or ''}".strip()
        )
        if not player_name:
            continue

        image_path = player.get("image_path") or player.get("image") or player.get("photo")
        normalized_name = _normalize_lookup_text(player_name)
        score = int(FEATURED_PLAYER_PRIORITY.get(normalized_name, 0))
        if row.get("captain") in {True, 1, "1", "true", "True"}:
            score += 20

        jersey_number = row.get("jersey_number")
        try:
            jersey = int(jersey_number) if jersey_number is not None else None
        except (TypeError, ValueError):
            jersey = None
        if jersey is not None and 1 <= jersey <= 11:
            score += 6
        if image_path:
            score += 4

        candidate = {
            "player_id": player.get("id") or row.get("player_id"),
            "player_name": player_name,
            "image_path": image_path,
            "captain": bool(row.get("captain")),
            "jersey_number": jersey_number,
            "score": score,
        }
        if score > best_score:
            best_score = score
            best = candidate

    return best


def _enrich_fixture_logos(settings: Settings, items: list[dict]) -> list[dict]:
    missing_team_ids: set[int] = set()
    for item in items:
        home_id = item.get("home_team_id")
        away_id = item.get("away_team_id")
        if home_id and not item.get("home_team_logo"):
            try:
                missing_team_ids.add(int(home_id))
            except (TypeError, ValueError):
                pass
        if away_id and not item.get("away_team_logo"):
            try:
                missing_team_ids.add(int(away_id))
            except (TypeError, ValueError):
                pass

    if not missing_team_ids:
        return items

    client = _build_sportmonks_client(settings)
    team_logo_map: dict[int, str] = {}
    for team_id in missing_team_ids:
        try:
            payload = client.get_team(team_id)
            logo = _extract_logo_from_team_payload(payload)
            if logo:
                team_logo_map[team_id] = logo
        except Exception:
            continue

    if not team_logo_map:
        return items

    for item in items:
        try:
            home_id = int(item.get("home_team_id")) if item.get("home_team_id") is not None else None
        except (TypeError, ValueError):
            home_id = None
        try:
            away_id = int(item.get("away_team_id")) if item.get("away_team_id") is not None else None
        except (TypeError, ValueError):
            away_id = None

        if home_id and not item.get("home_team_logo"):
            item["home_team_logo"] = team_logo_map.get(home_id)
        if away_id and not item.get("away_team_logo"):
            item["away_team_logo"] = team_logo_map.get(away_id)
    return items


def _ensure_manager_permissions(current_user: AuthUser) -> None:
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sadece admin ve superadmin yetkilidir.")


def _ensure_superadmin_permissions(current_user: AuthUser) -> None:
    if current_user.role != ROLE_SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu islem sadece superadmin icindir.")


def require_admin(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
    _ensure_manager_permissions(current_user)
    return current_user


def require_superadmin(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
    _ensure_superadmin_permissions(current_user)
    return current_user


def _ensure_role_assignment_allowed(current_user: AuthUser, target_role: str) -> None:
    if target_role == ROLE_SUPERADMIN and current_user.role != ROLE_SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin rolunu sadece superadmin verebilir.")


def _target_user_access_allowed(current_user: AuthUser, target_role: str) -> None:
    if target_role == ROLE_SUPERADMIN and current_user.role != ROLE_SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin kullanicisi sadece superadmin tarafindan yonetilebilir.",
        )


def _safe_scalar(conn, sql: str, default: int = 0) -> int:
    try:
        value = conn.execute(text(sql)).scalar_one()
        return int(value)
    except Exception:
        return default


def _resolve_pro_training_data_sources(settings: Settings) -> list[str]:
    raw = str(getattr(settings, "pro_training_data_sources", "") or "").strip()
    requested = [item.strip() for item in raw.split(",") if item.strip()] if raw else list(PRO_PRESET_DEFAULT_SOURCES)
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

    fallback = [key for key in PRO_PRESET_DEFAULT_SOURCES if key in catalog_keys]
    if fallback:
        return fallback
    return list(PRO_PRESET_DEFAULT_SOURCES)


def _ensure_advanced_mode_for_training(settings: Settings, current_user: AuthUser) -> None:
    requires_advanced = bool(getattr(settings, "model_training_requires_advanced_mode", True))
    if requires_advanced and not bool(current_user.advanced_mode_enabled):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Model egitimi icin Advanced Mode gerekir. "
                f"Lutfen '{settings.advanced_mode_package_key}' paketini satin alip onaylatin."
            ),
        )


def _task_info(task_id: str) -> TaskInfo:
    async_result = AsyncResult(task_id, app=celery_app)
    raw_result = async_result.result
    raw_info = async_result.info
    if isinstance(raw_result, Exception):
        raw_result = str(raw_result)

    meta: Any = None
    if async_result.state == "PROGRESS":
        if isinstance(raw_info, dict):
            meta = raw_info
        elif raw_info:
            meta = {"progress": 0, "stage": str(raw_info)}
    elif async_result.ready():
        if isinstance(raw_result, dict):
            stage = "Tamamlandi" if async_result.successful() else "Basarisiz"
            meta = {"progress": 100 if async_result.successful() else 0, "stage": stage, **raw_result}
        elif raw_result is not None:
            meta = {"progress": 100 if async_result.successful() else 0, "stage": str(raw_result)}

    return TaskInfo(
        task_id=task_id,
        state=async_result.state,
        ready=async_result.ready(),
        successful=bool(async_result.successful()),
        result=raw_result,
        meta=meta,
    )


def _ensure_saved_predictions_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE SEQUENCE IF NOT EXISTS {SAVED_PREDICTIONS_TABLE}_id_seq
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {SAVED_PREDICTIONS_TABLE} (
                    id BIGINT PRIMARY KEY DEFAULT nextval('{SAVED_PREDICTIONS_TABLE}_id_seq'),
                    created_by BIGINT,
                    fixture_id BIGINT NOT NULL,
                    league_id BIGINT,
                    fixture_starting_at TIMESTAMPTZ,
                    fixture_date DATE,
                    home_team_name TEXT,
                    away_team_name TEXT,
                    match_label TEXT,
                    model_id TEXT,
                    model_name TEXT,
                    prediction_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    prediction_date DATE NOT NULL,
                    note TEXT,
                    simulation_snapshot JSONB NOT NULL,
                    ai_snapshot JSONB,
                    predicted_home_win DOUBLE PRECISION,
                    predicted_draw DOUBLE PRECISION,
                    predicted_away_win DOUBLE PRECISION,
                    predicted_lambda_home DOUBLE PRECISION,
                    predicted_lambda_away DOUBLE PRECISION,
                    prediction_outcome TEXT,
                    actual_home_goals INT,
                    actual_away_goals INT,
                    actual_outcome TEXT,
                    is_correct BOOLEAN,
                    status TEXT NOT NULL DEFAULT 'pending',
                    settled_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                ALTER SEQUENCE {SAVED_PREDICTIONS_TABLE}_id_seq
                OWNED BY {SAVED_PREDICTIONS_TABLE}.id
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_saved_predictions_prediction_date
                ON {SAVED_PREDICTIONS_TABLE} (prediction_date DESC, prediction_created_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_saved_predictions_fixture_id
                ON {SAVED_PREDICTIONS_TABLE} (fixture_id, prediction_created_at DESC)
                """
            )
        )
        conn.execute(text(f"ALTER TABLE {SAVED_PREDICTIONS_TABLE} ADD COLUMN IF NOT EXISTS created_by BIGINT"))
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_saved_predictions_created_day
                ON {SAVED_PREDICTIONS_TABLE} (created_by, prediction_date DESC, prediction_created_at DESC)
                """
            )
        )


def _ensure_payment_notices_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {PAYMENT_NOTICES_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    username TEXT NOT NULL,
                    user_role TEXT NOT NULL,
                    package_key TEXT NOT NULL,
                    package_title TEXT NOT NULL,
                    chain TEXT NOT NULL,
                    amount_tl INT NOT NULL,
                    transaction_id TEXT NOT NULL,
                    telegram_contact TEXT,
                    note TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    admin_note TEXT,
                    reviewed_by BIGINT,
                    reviewed_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_{PAYMENT_NOTICES_TABLE}_txid
                ON {PAYMENT_NOTICES_TABLE} (transaction_id)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{PAYMENT_NOTICES_TABLE}_status_created
                ON {PAYMENT_NOTICES_TABLE} (status, created_at DESC)
                """
            )
        )


def _normalize_showcase_section_key(section_key: str) -> str:
    normalized = str(section_key or "").strip().lower()
    if normalized not in SHOWCASE_SECTION_KEYS:
        allowed = ", ".join(SHOWCASE_SECTION_KEYS)
        raise HTTPException(status_code=400, detail=f"Gecersiz section key: {section_key}. Beklenen: {allowed}")
    return normalized


def replace_showcase_section_rows(
    settings: Settings,
    section_key: str,
    rows: list[Any],
    actor_user_id: int,
) -> int:
    normalized_key = _normalize_showcase_section_key(section_key)
    engine = get_engine(settings)
    _ensure_showcase_matches_table(engine)
    now_utc = datetime.now(timezone.utc)
    safe_actor_id = int(actor_user_id)

    prepared_rows: list[dict[str, Any]] = []
    for index, row in enumerate(rows or []):
        if hasattr(row, "model_dump"):
            payload = dict(row.model_dump())  # pydantic model
        elif isinstance(row, dict):
            payload = dict(row)
        else:
            continue

        home_team_name = str(payload.get("home_team_name") or "").strip()
        away_team_name = str(payload.get("away_team_name") or "").strip()
        if not home_team_name or not away_team_name:
            continue

        try:
            odd_home = float(payload.get("odd_home"))
            odd_draw = float(payload.get("odd_draw"))
            odd_away = float(payload.get("odd_away"))
        except (TypeError, ValueError):
            continue
        if odd_home <= 1 or odd_draw <= 1 or odd_away <= 1:
            continue

        fixture_id_raw = payload.get("fixture_id")
        try:
            fixture_id = int(fixture_id_raw) if fixture_id_raw is not None else None
        except (TypeError, ValueError):
            fixture_id = None

        kickoff_at_raw = payload.get("kickoff_at")
        if isinstance(kickoff_at_raw, datetime):
            kickoff_at = kickoff_at_raw
        else:
            kickoff_at = _parse_datetime(kickoff_at_raw)

        def _optional_score(value: Any) -> Optional[int]:
            if value is None or value == "":
                return None
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        display_order_raw = payload.get("display_order")
        try:
            display_order = int(display_order_raw) if display_order_raw is not None else index
        except (TypeError, ValueError):
            display_order = index

        prepared_rows.append(
            {
                "section_key": normalized_key,
                "fixture_id": fixture_id,
                "home_team_name": home_team_name,
                "away_team_name": away_team_name,
                "home_team_logo": str(payload.get("home_team_logo") or "").strip() or None,
                "away_team_logo": str(payload.get("away_team_logo") or "").strip() or None,
                "kickoff_at": kickoff_at,
                "odd_home": odd_home,
                "odd_draw": odd_draw,
                "odd_away": odd_away,
                "model_score_home": _optional_score(payload.get("model_score_home")),
                "model_score_away": _optional_score(payload.get("model_score_away")),
                "display_order": display_order,
                "is_active": bool(payload.get("is_active", True)),
                "created_by": safe_actor_id,
                "updated_by": safe_actor_id,
                "created_at": now_utc,
                "updated_at": now_utc,
            }
        )

    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                DELETE FROM {SHOWCASE_MATCHES_TABLE}
                WHERE section_key = :section_key
                """
            ),
            {"section_key": normalized_key},
        )
        for row in prepared_rows:
            conn.execute(
                text(
                    f"""
                    INSERT INTO {SHOWCASE_MATCHES_TABLE} (
                        section_key,
                        fixture_id,
                        home_team_name,
                        away_team_name,
                        home_team_logo,
                        away_team_logo,
                        kickoff_at,
                        odd_home,
                        odd_draw,
                        odd_away,
                        model_score_home,
                        model_score_away,
                        display_order,
                        is_active,
                        created_by,
                        updated_by,
                        created_at,
                        updated_at
                    ) VALUES (
                        :section_key,
                        :fixture_id,
                        :home_team_name,
                        :away_team_name,
                        :home_team_logo,
                        :away_team_logo,
                        :kickoff_at,
                        :odd_home,
                        :odd_draw,
                        :odd_away,
                        :model_score_home,
                        :model_score_away,
                        :display_order,
                        :is_active,
                        :created_by,
                        :updated_by,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                row,
            )
    return len(prepared_rows)


def _default_showcase_sections() -> dict[str, list[dict]]:
    sections: dict[str, list[dict]] = {key: [] for key in SHOWCASE_SECTION_KEYS}
    for section_key, rows in SHOWCASE_DEFAULT_ROWS.items():
        for index, row in enumerate(rows):
            sections[section_key].append(
                {
                    "id": None,
                    "section_key": section_key,
                    "fixture_id": row.get("fixture_id"),
                    "home_team_name": row.get("home_team_name"),
                    "away_team_name": row.get("away_team_name"),
                    "home_team_logo": row.get("home_team_logo"),
                    "away_team_logo": row.get("away_team_logo"),
                    "kickoff_at": row.get("kickoff_at"),
                    "odd_home": float(row.get("odd_home") or 0.0),
                    "odd_draw": float(row.get("odd_draw") or 0.0),
                    "odd_away": float(row.get("odd_away") or 0.0),
                    "model_score_home": row.get("model_score_home"),
                    "model_score_away": row.get("model_score_away"),
                    "display_order": index,
                    "is_active": True,
                }
            )
    return sections


def _default_slider_images() -> list[dict]:
    rows: list[dict] = []
    for index, image_url in enumerate(SHOWCASE_DEFAULT_SLIDER_IMAGES):
        rows.append(
            {
                "id": None,
                "image_url": image_url,
                "display_order": index,
                "is_active": True,
            }
        )
    return rows


def _default_odds_banner_settings() -> dict:
    return {**SHOWCASE_DEFAULT_ODDS_BANNER}


def _ensure_showcase_matches_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {SHOWCASE_MATCHES_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    section_key TEXT NOT NULL,
                    fixture_id BIGINT,
                    home_team_name TEXT NOT NULL,
                    away_team_name TEXT NOT NULL,
                    home_team_logo TEXT,
                    away_team_logo TEXT,
                    kickoff_at TIMESTAMPTZ,
                    odd_home DOUBLE PRECISION NOT NULL,
                    odd_draw DOUBLE PRECISION NOT NULL,
                    odd_away DOUBLE PRECISION NOT NULL,
                    model_score_home INT,
                    model_score_away INT,
                    display_order INT NOT NULL DEFAULT 0,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_by BIGINT,
                    updated_by BIGINT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text(f"ALTER TABLE {SHOWCASE_MATCHES_TABLE} ADD COLUMN IF NOT EXISTS model_score_home INT"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_MATCHES_TABLE} ADD COLUMN IF NOT EXISTS model_score_away INT"))
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{SHOWCASE_MATCHES_TABLE}_section_order
                ON {SHOWCASE_MATCHES_TABLE} (section_key, is_active, display_order, id)
                """
            )
        )


def _ensure_showcase_slider_images_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {SHOWCASE_SLIDER_IMAGES_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    image_url TEXT NOT NULL,
                    display_order INT NOT NULL DEFAULT 0,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_by BIGINT,
                    updated_by BIGINT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{SHOWCASE_SLIDER_IMAGES_TABLE}_order
                ON {SHOWCASE_SLIDER_IMAGES_TABLE} (is_active, display_order, id)
                """
            )
        )


def _ensure_showcase_odds_banner_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {SHOWCASE_ODDS_BANNER_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    banner_label TEXT NOT NULL DEFAULT 'Gunun Yapay Zeka Tahminleri',
                    left_image_url TEXT,
                    right_image_url TEXT,
                    left_title TEXT,
                    left_subtitle TEXT,
                    right_title TEXT,
                    right_subtitle TEXT,
                    ai_home_team_name TEXT,
                    ai_away_team_name TEXT,
                    ai_kickoff_at TIMESTAMPTZ,
                    ai_odd_home DOUBLE PRECISION,
                    ai_odd_draw DOUBLE PRECISION,
                    ai_odd_away DOUBLE PRECISION,
                    ai_score_home INT,
                    ai_score_away INT,
                    ai_insight TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_by BIGINT,
                    updated_by BIGINT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_home_team_name TEXT"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_away_team_name TEXT"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_kickoff_at TIMESTAMPTZ"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_odd_home DOUBLE PRECISION"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_odd_draw DOUBLE PRECISION"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_odd_away DOUBLE PRECISION"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_score_home INT"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_score_away INT"))
        conn.execute(text(f"ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE} ADD COLUMN IF NOT EXISTS ai_insight TEXT"))
        conn.execute(
            text(
                f"""
                ALTER TABLE {SHOWCASE_ODDS_BANNER_TABLE}
                ALTER COLUMN banner_label SET DEFAULT 'Gunun Yapay Zeka Tahminleri'
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{SHOWCASE_ODDS_BANNER_TABLE}_active_updated
                ON {SHOWCASE_ODDS_BANNER_TABLE} (is_active, updated_at DESC, id DESC)
                """
            )
        )


def _showcase_row_to_dict(row: dict) -> dict:
    output = {key: _to_python_value(value) for key, value in dict(row).items()}
    for key in ("odd_home", "odd_draw", "odd_away"):
        value = output.get(key)
        if value is None:
            output[key] = None
        else:
            output[key] = float(value)
    for key in ("id", "fixture_id", "display_order", "model_score_home", "model_score_away"):
        value = output.get(key)
        if value is None:
            output[key] = None
        else:
            try:
                output[key] = int(value)
            except (TypeError, ValueError):
                output[key] = value
    return output


def _slider_row_to_dict(row: dict) -> dict:
    output = {key: _to_python_value(value) for key, value in dict(row).items()}
    for key in ("id", "display_order"):
        value = output.get(key)
        if value is None:
            output[key] = None
        else:
            try:
                output[key] = int(value)
            except (TypeError, ValueError):
                output[key] = value
    output["image_url"] = str(output.get("image_url") or "").strip()
    output["is_active"] = bool(output.get("is_active", True))
    return output


def _odds_banner_row_to_dict(row: dict) -> dict:
    output = {key: _to_python_value(value) for key, value in dict(row).items()}
    value = output.get("id")
    if value is None:
        output["id"] = None
    else:
        try:
            output["id"] = int(value)
        except (TypeError, ValueError):
            output["id"] = value

    output["banner_label"] = (
        str(output.get("banner_label") or "Gunun Yapay Zeka Tahminleri").strip() or "Gunun Yapay Zeka Tahminleri"
    )
    for key in (
        "left_image_url",
        "right_image_url",
        "left_title",
        "left_subtitle",
        "right_title",
        "right_subtitle",
        "ai_home_team_name",
        "ai_away_team_name",
        "ai_insight",
    ):
        text_value = str(output.get(key) or "").strip()
        output[key] = text_value or None
    for key in ("ai_odd_home", "ai_odd_draw", "ai_odd_away"):
        value = output.get(key)
        if value is None:
            output[key] = None
        else:
            try:
                output[key] = float(value)
            except (TypeError, ValueError):
                output[key] = None
    for key in ("ai_score_home", "ai_score_away"):
        value = output.get(key)
        if value is None:
            output[key] = None
        else:
            try:
                output[key] = int(value)
            except (TypeError, ValueError):
                output[key] = None
    output["is_active"] = bool(output.get("is_active", True))
    return output


def load_showcase_sections(settings: Settings, *, include_inactive: bool = False) -> dict:
    engine = get_engine(settings)
    _ensure_showcase_matches_table(engine)

    where_sql = "" if include_inactive else "WHERE is_active = TRUE"
    query = text(
        f"""
        SELECT id, section_key, fixture_id, home_team_name, away_team_name, home_team_logo, away_team_logo,
               kickoff_at, odd_home, odd_draw, odd_away, model_score_home, model_score_away, display_order, is_active
        FROM {SHOWCASE_MATCHES_TABLE}
        {where_sql}
        ORDER BY section_key ASC, display_order ASC, id ASC
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    grouped: dict[str, dict] = {key: {"key": key, "items": []} for key in SHOWCASE_SECTION_KEYS}
    for row in rows:
        item = _showcase_row_to_dict(dict(row))
        key = str(item.get("section_key") or "").strip().lower()
        if key not in grouped:
            continue
        grouped[key]["items"].append(item)

    defaults = _default_showcase_sections()
    for key in SHOWCASE_SECTION_KEYS:
        if not grouped[key]["items"]:
            grouped[key]["items"] = defaults[key]

    return {"sections": grouped}


def load_showcase_slider_images(settings: Settings, *, include_inactive: bool = False) -> dict:
    engine = get_engine(settings)
    _ensure_showcase_slider_images_table(engine)

    where_sql = "" if include_inactive else "WHERE is_active = TRUE"
    query = text(
        f"""
        SELECT id, image_url, display_order, is_active
        FROM {SHOWCASE_SLIDER_IMAGES_TABLE}
        {where_sql}
        ORDER BY display_order ASC, id ASC
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    items = [_slider_row_to_dict(dict(row)) for row in rows]
    if not items:
        items = _default_slider_images()
    return {"items": items}


def load_showcase_odds_banner_settings(settings: Settings, *, include_inactive: bool = False) -> dict:
    engine = get_engine(settings)
    _ensure_showcase_odds_banner_table(engine)

    where_sql = "" if include_inactive else "WHERE is_active = TRUE"
    query = text(
        f"""
        SELECT id, banner_label, left_image_url, right_image_url,
               left_title, left_subtitle, right_title, right_subtitle,
               ai_home_team_name, ai_away_team_name, ai_kickoff_at,
               ai_odd_home, ai_odd_draw, ai_odd_away, ai_score_home, ai_score_away, ai_insight,
               is_active
        FROM {SHOWCASE_ODDS_BANNER_TABLE}
        {where_sql}
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query).mappings().first()

    if row:
        item = _odds_banner_row_to_dict(dict(row))
    else:
        item = _default_odds_banner_settings()
    return {"item": item}


def _parse_match_labels_from_payload(payload: dict) -> tuple[Optional[int], Optional[int]]:
    data = payload.get("data") or {}
    scores = data.get("scores")
    if not scores:
        return None, None

    if isinstance(scores, dict):
        for key in ("ft_score", "score", "fulltime"):
            value = scores.get(key)
            if isinstance(value, str):
                parts = [p.strip() for p in value.split("-")]
                if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                    return int(parts[0]), int(parts[1])
        home = scores.get("home_score") or scores.get("home")
        away = scores.get("away_score") or scores.get("away")
        if home is not None and away is not None:
            try:
                return int(home), int(away)
            except (TypeError, ValueError):
                return None, None

    if isinstance(scores, list):
        current = [s for s in scores if str(s.get("description", "")).upper() == "CURRENT"]
        if current:
            by_side = {}
            for item in current:
                participant = (item.get("score") or {}).get("participant")
                goals = (item.get("score") or {}).get("goals")
                if participant in {"home", "away"} and goals is not None:
                    try:
                        by_side[participant] = int(goals)
                    except (TypeError, ValueError):
                        continue
            if "home" in by_side and "away" in by_side:
                return by_side["home"], by_side["away"]

    return None, None


def _outcome_from_goals(home_goals: Optional[int], away_goals: Optional[int]) -> Optional[str]:
    if home_goals is None or away_goals is None:
        return None
    if home_goals > away_goals:
        return "home_win"
    if home_goals < away_goals:
        return "away_win"
    return "draw"


def _outcome_from_probabilities(outcomes: dict) -> Optional[str]:
    if not outcomes:
        return None
    values = {
        "home_win": float(outcomes.get("home_win") or 0.0),
        "draw": float(outcomes.get("draw") or 0.0),
        "away_win": float(outcomes.get("away_win") or 0.0),
    }
    return max(values, key=values.get)


def _fetch_fixture_payload_dict(settings: Settings, fixture_id: int) -> dict:
    engine = get_engine(settings)
    query = text(
        """
        SELECT payload
        FROM raw_fixtures
        WHERE fixture_id = :fixture_id
        LIMIT 1
        """
    )
    try:
        with engine.connect() as conn:
            row = conn.execute(query, {"fixture_id": fixture_id}).mappings().first()
    except SQLAlchemyError:
        row = None
    if row and row.get("payload"):
        return dict(row["payload"])

    client = SportMonksClient(
        api_token=settings.sportmonks_api_token,
        dummy_mode=settings.dummy_mode,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        cache_ttl=settings.cache_ttl_seconds,
    )
    payload = client.get_fixture(fixture_id, includes=["participants", "scores", "odds"]).model_dump(mode="json")
    return payload


def _refresh_saved_prediction_result(conn, settings: Settings, prediction_row: dict) -> dict:
    fixture_id = int(prediction_row["fixture_id"])
    payload = _fetch_fixture_payload_dict(settings, fixture_id)
    actual_home_goals, actual_away_goals = _parse_match_labels_from_payload(payload)
    actual_outcome = _outcome_from_goals(actual_home_goals, actual_away_goals)
    prediction_outcome = prediction_row.get("prediction_outcome")
    is_settled = actual_outcome is not None
    is_correct = bool(actual_outcome == prediction_outcome) if is_settled and prediction_outcome else None
    now_utc = datetime.now(timezone.utc)
    status = "settled" if is_settled else "pending"
    settled_at = now_utc if is_settled else None

    update_sql = text(
        f"""
        UPDATE {SAVED_PREDICTIONS_TABLE}
        SET actual_home_goals = :actual_home_goals,
            actual_away_goals = :actual_away_goals,
            actual_outcome = :actual_outcome,
            is_correct = :is_correct,
            status = :status,
            settled_at = :settled_at,
            updated_at = :updated_at
        WHERE id = :id
        """
    )
    conn.execute(
        update_sql,
        {
            "actual_home_goals": actual_home_goals,
            "actual_away_goals": actual_away_goals,
            "actual_outcome": actual_outcome,
            "is_correct": is_correct,
            "status": status,
            "settled_at": settled_at,
            "updated_at": now_utc,
            "id": int(prediction_row["id"]),
        },
    )
    return {
        "actual_home_goals": actual_home_goals,
        "actual_away_goals": actual_away_goals,
        "actual_outcome": actual_outcome,
        "is_correct": is_correct,
        "status": status,
    }


def _load_fixture_summaries(settings: Settings, scan_limit: int) -> list[dict]:
    engine = get_engine(settings)
    query = text(
        """
        SELECT fixture_id, payload
        FROM raw_fixtures
        ORDER BY ingested_at DESC
        LIMIT :scan_limit
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"scan_limit": scan_limit}).mappings().all()

    items: list[dict] = []
    for row in rows:
        summary = _extract_fixture_summary(row["payload"])
        if summary:
            items.append(summary)
    return items


def _load_fixture_summary_map_by_ids(settings: Settings, fixture_ids: list[int]) -> dict[int, dict]:
    safe_ids: list[int] = []
    for fixture_id in fixture_ids:
        try:
            safe_ids.append(int(fixture_id))
        except (TypeError, ValueError):
            continue

    safe_ids = sorted(set(safe_ids))
    if not safe_ids:
        return {}

    engine = get_engine(settings)
    query = text(
        """
        SELECT fixture_id, payload
        FROM raw_fixtures
        WHERE fixture_id = ANY(:fixture_ids)
        ORDER BY ingested_at DESC
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"fixture_ids": safe_ids}).mappings().all()

    summary_map: dict[int, dict] = {}
    for row in rows:
        try:
            fixture_id = int(row.get("fixture_id"))
        except (TypeError, ValueError):
            continue
        if fixture_id in summary_map:
            continue
        summary = _extract_fixture_summary(row.get("payload") or {})
        if summary:
            summary_map[fixture_id] = summary

    if summary_map:
        _enrich_fixture_logos(settings, list(summary_map.values()))

    return summary_map


def _filter_and_sort_fixtures(
    items: list[dict],
    league_id: Optional[int] = None,
    upcoming_only: bool = False,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = "desc",
) -> list[dict]:
    def _same_league(item_league: Any, expected_league: int) -> bool:
        try:
            return int(item_league) == int(expected_league)
        except (TypeError, ValueError):
            return item_league == expected_league

    def _normalize_text(value: Any) -> str:
        text_value = str(value or "").lower().strip()
        normalized = unicodedata.normalize("NFKD", text_value)
        ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
        return " ".join(ascii_text.split())

    filtered = items
    if league_id is not None:
        filtered = [item for item in filtered if _same_league(item.get("league_id"), league_id)]
    if upcoming_only:
        filtered = [item for item in filtered if item.get("is_upcoming")]
    if q:
        query = _normalize_text(q)
        filtered = [
            item
            for item in filtered
            if query in _normalize_text(item.get("match_label", ""))
            or query in _normalize_text(item.get("home_team_name", ""))
            or query in _normalize_text(item.get("away_team_name", ""))
        ]
    if date_from or date_to:
        def _in_date_range(item: dict) -> bool:
            dt = item.get("_sort_dt")
            if dt is None:
                return False
            item_date = dt.date()
            if date_from and item_date < date_from:
                return False
            if date_to and item_date > date_to:
                return False
            return True

        filtered = [item for item in filtered if _in_date_range(item)]

    reverse = str(sort).lower() != "asc"
    filtered.sort(
        key=lambda item: item.get("_sort_dt") or datetime(1970, 1, 1, tzinfo=timezone.utc),
        reverse=reverse,
    )
    return filtered


def _to_python_value(value: Any) -> Any:
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return value
    return value


def _to_iso_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text_value = str(value).strip()
    return text_value or None


def _serialize_ingest_status(raw_status: dict[str, Any]) -> dict[str, Any]:
    status = dict(raw_status or {})
    for key in (
        "last_ingested_at",
        "last_raw_fixture_date",
        "last_feature_event_date",
        "anchor_date",
        "missing_from_date",
        "missing_to_date",
    ):
        status[key] = _to_iso_or_none(status.get(key))
    status["raw_fixture_count"] = int(status.get("raw_fixture_count") or 0)
    status["feature_count"] = int(status.get("feature_count") or 0)
    status["labeled_feature_count"] = int(status.get("labeled_feature_count") or 0)
    status["missing_days"] = int(status.get("missing_days") or 0)
    status["has_missing_range"] = bool(status.get("has_missing_range"))
    return status


def _prediction_row_to_dict(row: dict) -> dict:
    out = {key: _to_python_value(value) for key, value in dict(row).items()}
    for key in ("simulation_snapshot", "ai_snapshot"):
        value = out.get(key)
        if isinstance(value, str):
            try:
                out[key] = json.loads(value)
            except Exception:
                pass
    return out


def _resolve_training_snapshot_path(model_payload: dict) -> Optional[Path]:
    meta = model_payload.get("meta") or {}
    raw_path = meta.get("training_snapshot_path")
    if raw_path:
        path = Path(str(raw_path)).resolve()
        if path.exists():
            return path

    artifact_dir = model_payload.get("artifact_dir")
    if artifact_dir:
        fallback = (Path(str(artifact_dir)).resolve() / "training_frame.parquet")
        if fallback.exists():
            return fallback
    return None


def _build_legacy_training_frame(model_payload: dict, settings: Settings) -> pd.DataFrame:
    meta = model_payload.get("meta") or {}
    league_id_raw = meta.get("league_id")
    try:
        league_id = int(league_id_raw) if league_id_raw is not None else None
    except (TypeError, ValueError):
        league_id = None

    limit_raw = meta.get("limit") or meta.get("rows_used") or 500
    try:
        row_limit = int(limit_raw)
    except (TypeError, ValueError):
        row_limit = 500
    row_limit = max(1, min(row_limit, 15000))
    scan_limit = max(2000, min(row_limit * 6, 60000))

    engine = get_engine(settings)
    query = text(
        """
        SELECT fixture_id, event_date, label_home_goals, label_away_goals, feature_vector
        FROM features
        ORDER BY event_date DESC NULLS LAST
        LIMIT :scan_limit
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"scan_limit": scan_limit}).mappings().all()

    records: list[dict] = []
    for row in rows:
        feature_vector = row.get("feature_vector") or {}
        row_league = feature_vector.get("league_id")
        if league_id is not None:
            try:
                if int(row_league) != league_id:
                    continue
            except (TypeError, ValueError):
                continue

        records.append(
            {
                "fixture_id": row.get("fixture_id"),
                "event_date": row.get("event_date"),
                "league_id": row_league,
                "home_team_id": feature_vector.get("home_team_id"),
                "away_team_id": feature_vector.get("away_team_id"),
                "home_team_name": feature_vector.get("home_team_name"),
                "away_team_name": feature_vector.get("away_team_name"),
                "label_home_goals": row.get("label_home_goals"),
                "label_away_goals": row.get("label_away_goals"),
            }
        )
        if len(records) >= row_limit:
            break

    return pd.DataFrame(records)


@router.get("/overview")
def get_overview(settings: Settings = Depends(get_settings)):
    engine = get_engine(settings)
    try:
        with engine.connect() as conn:
            raw_count = _safe_scalar(conn, "SELECT COUNT(*) FROM raw_fixtures", default=0)
            feature_count = _safe_scalar(conn, "SELECT COUNT(*) FROM features", default=0)
            labeled_count = _safe_scalar(
                conn,
                "SELECT COUNT(*) FROM features WHERE label_home_goals IS NOT NULL AND label_away_goals IS NOT NULL",
                default=0,
            )
            latest_event_date = conn.execute(text("SELECT MAX(event_date) FROM features")).scalar()
    except SQLAlchemyError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to query DB: {exc}")

    active_model = get_active_model()
    active_model_meta = {}
    if active_model:
        active_model_meta = active_model.get("meta") or {}
    model_items = list_models(limit=200)

    return {
        "dummy_mode": settings.dummy_mode,
        "raw_fixture_count": raw_count,
        "feature_count": feature_count,
        "labeled_feature_count": labeled_count,
        "latest_event_date": latest_event_date,
        "model_available": active_model is not None,
        "model_count": len(model_items),
        "active_model_id": get_active_model_id() or (active_model or {}).get("model_id"),
        "active_model_name": (active_model or {}).get("model_name"),
        "model_meta": active_model_meta,
    }


@router.get("/features/recent")
def get_recent_features(limit: int = 20, settings: Settings = Depends(get_settings)):
    limit = max(1, min(limit, 100))
    engine = get_engine(settings)
    query = text(
        """
        SELECT fixture_id, event_date, label_home_goals, label_away_goals, feature_vector
        FROM features
        ORDER BY event_date DESC NULLS LAST
        LIMIT :limit
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"limit": limit}).mappings().all()

    fixture_ids: list[int] = []
    for row in rows:
        try:
            fixture_ids.append(int(row.get("fixture_id")))
        except (TypeError, ValueError):
            continue
    fixture_summary_map = _load_fixture_summary_map_by_ids(settings, fixture_ids)

    items: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        feature_vector = item.get("feature_vector") or {}
        if not isinstance(feature_vector, dict):
            feature_vector = {}

        try:
            fixture_id_int = int(item.get("fixture_id"))
        except (TypeError, ValueError):
            fixture_id_int = None

        summary = fixture_summary_map.get(fixture_id_int) if fixture_id_int is not None else None
        item["home_team_id"] = (summary or {}).get("home_team_id") or feature_vector.get("home_team_id")
        item["away_team_id"] = (summary or {}).get("away_team_id") or feature_vector.get("away_team_id")
        item["home_team_name"] = (summary or {}).get("home_team_name") or feature_vector.get("home_team_name")
        item["away_team_name"] = (summary or {}).get("away_team_name") or feature_vector.get("away_team_name")
        item["home_team_logo"] = (summary or {}).get("home_team_logo")
        item["away_team_logo"] = (summary or {}).get("away_team_logo")
        items.append(item)

    return {"items": items}


@router.get("/fixtures")
def get_fixtures(
    limit: int = 50,
    league_id: Optional[int] = None,
    upcoming_only: bool = True,
    settings: Settings = Depends(get_settings),
):
    safe_limit = max(1, min(limit, 300))
    payload = load_cached_fixture_summaries(
        settings=settings,
        page=1,
        page_size=safe_limit,
        limit=safe_limit,
        league_id=league_id,
        upcoming_only=upcoming_only,
        sort="desc",
    )
    items = payload.get("items") or []
    for item in items:
        item.pop("_sort_dt", None)
    return {"items": items}


@router.get("/fixtures/paged")
def get_fixtures_paged(
    page: int = 1,
    page_size: int = 12,
    league_id: Optional[int] = None,
    upcoming_only: bool = True,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = "desc",
    settings: Settings = Depends(get_settings),
):
    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 50))
    
    # Use get_fixture_board_page to include odds data
    target = date_from if date_from else (date.today() if upcoming_only else None)
    payload = get_fixture_board_page(
        settings=settings,
        page=safe_page,
        page_size=safe_page_size,
        league_id=league_id,
        q=q,
        target_date=target,
        sort=sort,
        game_type="all",
        featured_only=False,
    )
    
    # Convert board items to simpler public format
    items = payload.get("items") or []
    public_items = []
    for item in items:
        public_items.append({
            "fixture_id": item.get("fixture_id"),
            "league_id": item.get("league_id"),
            "league_name": item.get("league_name"),
            "starting_at": item.get("starting_at"),
            "home_team_id": item.get("home_team_id"),
            "away_team_id": item.get("away_team_id"),
            "home_team_name": item.get("home_team_name"),
            "away_team_name": item.get("away_team_name"),
            "home_team_logo": item.get("home_team_logo"),
            "away_team_logo": item.get("away_team_logo"),
            "match_label": item.get("match_label"),
            "is_upcoming": upcoming_only,
            "status": item.get("status"),
            "is_live": item.get("is_live"),
            "markets": item.get("markets"),
            "scores": item.get("scores"),
        })

    return {
        "page": payload.get("page", safe_page),
        "page_size": payload.get("page_size", safe_page_size),
        "total": payload.get("total", 0),
        "total_pages": payload.get("total_pages", 1),
        "items": public_items,
    }


@router.get("/superlig/today")
def get_today_superlig_matches(
    league_id: int = DEFAULT_SUPERLIG_LEAGUE_ID,
    settings: Settings = Depends(get_settings),
):
    fixture_date = date.today()
    payload = load_cached_fixture_summaries(
        settings=settings,
        page=1,
        page_size=400,
        limit=400,
        league_id=int(league_id),
        upcoming_only=False,
        date_from=fixture_date,
        date_to=fixture_date,
        sort="asc",
    )
    items = payload.get("items") or []
    for item in items:
        item.pop("_sort_dt", None)
    return {"date": fixture_date.isoformat(), "league_id": league_id, "items": items}


@router.get("/teams/featured-player")
def get_team_featured_player(
    team_id: int,
    settings: Settings = Depends(get_settings),
):
    try:
        client = _build_sportmonks_client(settings)
        payload = client.get_team(team_id, includes=["players.player"])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Takim bilgisi alinamadi: {exc}")

    data = payload.get("data") or {}
    featured = _select_featured_player(payload)
    return {
        "team_id": int(team_id),
        "team_name": data.get("name"),
        "team_logo": _extract_logo_from_team_payload(payload),
        "player": featured,
    }


@router.get("/showcase")
def get_showcase_sections(settings: Settings = Depends(get_settings)):
    return load_showcase_sections(settings=settings, include_inactive=True)


@router.put("/showcase/{section_key}")
def upsert_showcase_section(
    section_key: str,
    request: ShowcaseSectionUpsertRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_superadmin_permissions(current_user)
    replace_showcase_section_rows(
        settings=settings,
        section_key=section_key,
        rows=list(request.rows or []),
        actor_user_id=int(current_user.id),
    )

    return load_showcase_sections(settings=settings, include_inactive=True)


@router.get("/slider-images")
def get_slider_images(
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_superadmin_permissions(current_user)
    return load_showcase_slider_images(settings=settings, include_inactive=True)


@router.put("/slider-images")
def upsert_slider_images(
    request: SliderImagesUpsertRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_superadmin_permissions(current_user)
    engine = get_engine(settings)
    _ensure_showcase_slider_images_table(engine)
    now_utc = datetime.now(timezone.utc)

    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {SHOWCASE_SLIDER_IMAGES_TABLE}"))
        for index, row in enumerate(request.rows or []):
            image_url = str(row.image_url or "").strip()
            if not image_url:
                continue
            conn.execute(
                text(
                    f"""
                    INSERT INTO {SHOWCASE_SLIDER_IMAGES_TABLE} (
                        image_url,
                        display_order,
                        is_active,
                        created_by,
                        updated_by,
                        created_at,
                        updated_at
                    ) VALUES (
                        :image_url,
                        :display_order,
                        :is_active,
                        :created_by,
                        :updated_by,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                {
                    "image_url": image_url,
                    "display_order": int(row.display_order if row.display_order is not None else index),
                    "is_active": bool(row.is_active),
                    "created_by": int(current_user.id),
                    "updated_by": int(current_user.id),
                    "created_at": now_utc,
                    "updated_at": now_utc,
                },
            )

    return load_showcase_slider_images(settings=settings, include_inactive=True)


@router.get("/odds-banner-settings")
def get_odds_banner_settings(
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    include_inactive = current_user.role == ROLE_SUPERADMIN
    return load_showcase_odds_banner_settings(settings=settings, include_inactive=include_inactive)


@router.put("/odds-banner-settings")
def upsert_odds_banner_settings(
    request: OddsBannerSettingsUpsertRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_superadmin_permissions(current_user)
    engine = get_engine(settings)
    _ensure_showcase_odds_banner_table(engine)
    now_utc = datetime.now(timezone.utc)

    def _clean_optional(value: Any) -> Optional[str]:
        text_value = str(value or "").strip()
        return text_value or None

    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {SHOWCASE_ODDS_BANNER_TABLE}"))
        conn.execute(
            text(
                f"""
                INSERT INTO {SHOWCASE_ODDS_BANNER_TABLE} (
                    banner_label,
                    left_image_url,
                    right_image_url,
                    left_title,
                    left_subtitle,
                    right_title,
                    right_subtitle,
                    ai_home_team_name,
                    ai_away_team_name,
                    ai_kickoff_at,
                    ai_odd_home,
                    ai_odd_draw,
                    ai_odd_away,
                    ai_score_home,
                    ai_score_away,
                    ai_insight,
                    is_active,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                ) VALUES (
                    :banner_label,
                    :left_image_url,
                    :right_image_url,
                    :left_title,
                    :left_subtitle,
                    :right_title,
                    :right_subtitle,
                    :ai_home_team_name,
                    :ai_away_team_name,
                    :ai_kickoff_at,
                    :ai_odd_home,
                    :ai_odd_draw,
                    :ai_odd_away,
                    :ai_score_home,
                    :ai_score_away,
                    :ai_insight,
                    :is_active,
                    :created_by,
                    :updated_by,
                    :created_at,
                    :updated_at
                )
                """
            ),
            {
                "banner_label": (str(request.banner_label or "").strip() or "Gunun Yapay Zeka Tahminleri"),
                "left_image_url": _clean_optional(request.left_image_url),
                "right_image_url": _clean_optional(request.right_image_url),
                "left_title": _clean_optional(request.left_title),
                "left_subtitle": _clean_optional(request.left_subtitle),
                "right_title": _clean_optional(request.right_title),
                "right_subtitle": _clean_optional(request.right_subtitle),
                "ai_home_team_name": _clean_optional(request.ai_home_team_name),
                "ai_away_team_name": _clean_optional(request.ai_away_team_name),
                "ai_kickoff_at": request.ai_kickoff_at,
                "ai_odd_home": float(request.ai_odd_home) if request.ai_odd_home is not None else None,
                "ai_odd_draw": float(request.ai_odd_draw) if request.ai_odd_draw is not None else None,
                "ai_odd_away": float(request.ai_odd_away) if request.ai_odd_away is not None else None,
                "ai_score_home": int(request.ai_score_home) if request.ai_score_home is not None else None,
                "ai_score_away": int(request.ai_score_away) if request.ai_score_away is not None else None,
                "ai_insight": _clean_optional(request.ai_insight),
                "is_active": bool(request.is_active),
                "created_by": int(current_user.id),
                "updated_by": int(current_user.id),
                "created_at": now_utc,
                "updated_at": now_utc,
            },
        )

    return load_showcase_odds_banner_settings(settings=settings, include_inactive=True)


@router.post("/predictions/save")
def save_prediction(
    request: SavePredictionRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    engine = get_engine(settings)
    _ensure_saved_predictions_table(engine)

    simulation = request.simulation
    if simulation is None:
        simulation = simulate_fixture(
            fixture_id=request.fixture_id,
            settings=settings,
            model_id=request.model_id,
        )

    ai_payload = request.ai_payload
    if ai_payload is None and request.include_ai_if_missing:
        generated = generate_match_commentary(
            settings=settings,
            fixture_id=request.fixture_id,
            simulation_result=simulation,
            language=request.language,
        )
        consume_ai_credits(settings=settings, user_id=current_user.id, reason="prediction_save_ai_commentary")
        ai_payload = {
            "commentary": generated.get("commentary"),
            "provider": generated.get("provider"),
            "provider_model": generated.get("model"),
            "provider_error": generated.get("provider_error"),
            "odds_summary": generated.get("odds_summary"),
            "web_news": generated.get("web_news", []),
            "analysis_table": generated.get("analysis_table", []),
        }

    fixture_payload = _fetch_fixture_payload_dict(settings, request.fixture_id)
    fixture_summary = _extract_fixture_summary(fixture_payload) or {
        "fixture_id": request.fixture_id,
        "league_id": (simulation.get("match") or {}).get("league_id"),
        "starting_at": (simulation.get("match") or {}).get("starting_at"),
        "home_team_id": (simulation.get("match") or {}).get("home_team_id"),
        "away_team_id": (simulation.get("match") or {}).get("away_team_id"),
        "home_team_name": (simulation.get("match") or {}).get("home_team_name") or "Home",
        "home_team_logo": (simulation.get("match") or {}).get("home_team_logo"),
        "away_team_name": (simulation.get("match") or {}).get("away_team_name") or "Away",
        "away_team_logo": (simulation.get("match") or {}).get("away_team_logo"),
        "match_label": "Home vs Away",
        "_sort_dt": None,
    }

    outcomes = simulation.get("outcomes") or {}
    predicted_home = float(outcomes.get("home_win") or 0.0)
    predicted_draw = float(outcomes.get("draw") or 0.0)
    predicted_away = float(outcomes.get("away_win") or 0.0)
    prediction_outcome = _outcome_from_probabilities(outcomes)
    predicted_lambda_home = float(simulation.get("lambda_home") or 0.0)
    predicted_lambda_away = float(simulation.get("lambda_away") or 0.0)

    actual_home_goals, actual_away_goals = _parse_match_labels_from_payload(fixture_payload)
    actual_outcome = _outcome_from_goals(actual_home_goals, actual_away_goals)
    is_settled = actual_outcome is not None
    is_correct = bool(actual_outcome == prediction_outcome) if is_settled and prediction_outcome else None

    model_meta = simulation.get("model") or {}
    model_id = request.model_id or model_meta.get("model_id")
    model_name = model_meta.get("model_name")

    created_at = datetime.now(timezone.utc)
    fixture_dt = _parse_datetime(fixture_summary.get("starting_at"))
    fixture_date = fixture_dt.date() if fixture_dt else None
    prediction_date = created_at.date()

    insert_sql = text(
        f"""
        INSERT INTO {SAVED_PREDICTIONS_TABLE} (
            created_by,
            fixture_id,
            league_id,
            fixture_starting_at,
            fixture_date,
            home_team_name,
            away_team_name,
            match_label,
            model_id,
            model_name,
            prediction_created_at,
            prediction_date,
            note,
            simulation_snapshot,
            ai_snapshot,
            predicted_home_win,
            predicted_draw,
            predicted_away_win,
            predicted_lambda_home,
            predicted_lambda_away,
            prediction_outcome,
            actual_home_goals,
            actual_away_goals,
            actual_outcome,
            is_correct,
            status,
            settled_at,
            created_at,
            updated_at
        ) VALUES (
            :created_by,
            :fixture_id,
            :league_id,
            :fixture_starting_at,
            :fixture_date,
            :home_team_name,
            :away_team_name,
            :match_label,
            :model_id,
            :model_name,
            :prediction_created_at,
            :prediction_date,
            :note,
            CAST(:simulation_snapshot AS JSONB),
            CAST(:ai_snapshot AS JSONB),
            :predicted_home_win,
            :predicted_draw,
            :predicted_away_win,
            :predicted_lambda_home,
            :predicted_lambda_away,
            :prediction_outcome,
            :actual_home_goals,
            :actual_away_goals,
            :actual_outcome,
            :is_correct,
            :status,
            :settled_at,
            :created_at,
            :updated_at
        )
        RETURNING id
        """
    )

    with engine.begin() as conn:
        created_by_value = int(current_user.id)
        logger.info(
            f"[SAVE_PREDICTION] Saving prediction for user_id={created_by_value}, "
            f"fixture_id={request.fixture_id}, prediction_date={prediction_date}"
        )
        prediction_id = int(
            conn.execute(
                insert_sql,
                {
                    "created_by": created_by_value,
                    "fixture_id": int(fixture_summary.get("fixture_id") or request.fixture_id),
                    "league_id": fixture_summary.get("league_id"),
                    "fixture_starting_at": fixture_summary.get("starting_at"),
                    "fixture_date": fixture_date,
                    "home_team_name": fixture_summary.get("home_team_name"),
                    "away_team_name": fixture_summary.get("away_team_name"),
                    "match_label": fixture_summary.get("match_label"),
                    "model_id": model_id,
                    "model_name": model_name,
                    "prediction_created_at": created_at,
                    "prediction_date": prediction_date,
                    "note": request.note,
                    "simulation_snapshot": json.dumps(simulation),
                    "ai_snapshot": json.dumps(ai_payload) if ai_payload is not None else None,
                    "predicted_home_win": predicted_home,
                    "predicted_draw": predicted_draw,
                    "predicted_away_win": predicted_away,
                    "predicted_lambda_home": predicted_lambda_home,
                    "predicted_lambda_away": predicted_lambda_away,
                    "prediction_outcome": prediction_outcome,
                    "actual_home_goals": actual_home_goals,
                    "actual_away_goals": actual_away_goals,
                    "actual_outcome": actual_outcome,
                    "is_correct": is_correct,
                    "status": "settled" if is_settled else "pending",
                    "settled_at": created_at if is_settled else None,
                    "created_at": created_at,
                    "updated_at": created_at,
                },
            ).scalar_one()
        )

    result = {
        "prediction_id": prediction_id,
        "fixture_id": int(fixture_summary.get("fixture_id") or request.fixture_id),
        "match_label": fixture_summary.get("match_label"),
        "prediction_date": prediction_date,
        "status": "settled" if is_settled else "pending",
    }
    logger.info(
        f"[SAVE_PREDICTION] Successfully saved prediction_id={prediction_id} "
        f"for user_id={created_by_value}"
    )
    return result


@router.get("/predictions/daily")
def get_daily_predictions(
    day: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
    league_id: Optional[int] = None,
    mine_only: bool = False,
    auto_refresh_results: bool = False,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    target_day = day or date.today()
    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size, 100))
    offset = (safe_page - 1) * safe_page_size

    engine = get_engine(settings)
    _ensure_saved_predictions_table(engine)

    where_parts = ["prediction_date = :target_day"]
    params: dict[str, Any] = {
        "target_day": target_day,
        "limit": safe_page_size,
        "offset": offset,
    }
    if league_id is not None:
        where_parts.append("league_id = :league_id")
        params["league_id"] = league_id
    if mine_only:
        where_parts.append("created_by = :created_by")
        params["created_by"] = int(current_user.id)
    where_clause = " AND ".join(where_parts)

    count_sql = text(f"SELECT COUNT(*) FROM {SAVED_PREDICTIONS_TABLE} WHERE {where_clause}")
    list_sql = text(
        f"""
        SELECT *
        FROM {SAVED_PREDICTIONS_TABLE}
        WHERE {where_clause}
        ORDER BY prediction_created_at DESC
        LIMIT :limit
        OFFSET :offset
        """
    )

    with engine.begin() as conn:
        total = int(conn.execute(count_sql, params).scalar_one())
        rows = conn.execute(list_sql, params).mappings().all()
        items = [_prediction_row_to_dict(dict(row)) for row in rows]
        
        logger.info(
            f"[GET_DAILY_PREDICTIONS] user_id={current_user.id}, day={target_day}, "
            f"mine_only={mine_only}, league_id={league_id}, found={len(items)} predictions"
        )

        refreshed = 0
        if auto_refresh_results:
            for row in items:
                if str(row.get("status")) == "settled":
                    continue
                update = _refresh_saved_prediction_result(conn, settings, row)
                row.update(update)
                row["updated_at"] = datetime.now(timezone.utc)
                refreshed += 1

    total_pages = max(1, ceil(total / safe_page_size)) if total else 1
    return {
        "day": target_day,
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
        "refreshed_count": refreshed if auto_refresh_results else 0,
        "items": items,
    }


@router.get("/predictions/list")
def get_predictions_list(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    mine_only: bool = True,
    archive: bool = False,
    page: int = 1,
    page_size: int = 20,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    """List saved predictions with optional date range and archive filter (past vs current fixtures)."""
    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size, 100))
    offset = (safe_page - 1) * safe_page_size

    engine = get_engine(settings)
    _ensure_saved_predictions_table(engine)

    where_parts: list[str] = []
    params: dict[str, Any] = {
        "limit": safe_page_size,
        "offset": offset,
    }
    if date_from is not None:
        where_parts.append("prediction_date >= :date_from")
        params["date_from"] = date_from
    if date_to is not None:
        where_parts.append("prediction_date <= :date_to")
        params["date_to"] = date_to
    if mine_only:
        where_parts.append("created_by = :created_by")
        params["created_by"] = int(current_user.id)

    if archive:
        where_parts.append(
            "((fixture_starting_at IS NOT NULL AND fixture_starting_at < NOW()) "
            "OR (fixture_date IS NOT NULL AND fixture_date < CURRENT_DATE))"
        )
    else:
        where_parts.append(
            "((fixture_starting_at IS NULL OR fixture_starting_at >= NOW()) "
            "AND (fixture_date IS NULL OR fixture_date >= CURRENT_DATE))"
        )

    where_clause = " AND ".join(where_parts)
    count_sql = text(f"SELECT COUNT(*) FROM {SAVED_PREDICTIONS_TABLE} WHERE {where_clause}")
    list_sql = text(
        f"""
        SELECT *
        FROM {SAVED_PREDICTIONS_TABLE}
        WHERE {where_clause}
        ORDER BY fixture_starting_at DESC NULLS LAST, prediction_created_at DESC
        LIMIT :limit
        OFFSET :offset
        """
    )

    with engine.connect() as conn:
        total = int(conn.execute(count_sql, params).scalar_one())
        rows = conn.execute(list_sql, params).mappings().all()
        items = [_prediction_row_to_dict(dict(row)) for row in rows]

    total_pages = max(1, ceil(total / safe_page_size)) if total else 1
    return {
        "items": items,
        "total": total,
        "page": safe_page,
        "page_size": safe_page_size,
        "total_pages": total_pages,
        "archive": archive,
    }


@router.post("/predictions/{prediction_id}/refresh-result")
def refresh_prediction_result(
    prediction_id: int,
    settings: Settings = Depends(get_settings),
):
    engine = get_engine(settings)
    _ensure_saved_predictions_table(engine)

    select_sql = text(f"SELECT * FROM {SAVED_PREDICTIONS_TABLE} WHERE id = :id LIMIT 1")
    with engine.begin() as conn:
        row = conn.execute(select_sql, {"id": prediction_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail=f"Prediction not found: {prediction_id}")
        updated = _refresh_saved_prediction_result(conn, settings, dict(row))
        refreshed_row = conn.execute(select_sql, {"id": prediction_id}).mappings().first()

    return {
        "prediction_id": prediction_id,
        "update": updated,
        "record": _prediction_row_to_dict(dict(refreshed_row)) if refreshed_row else None,
    }


@router.get("/predictions/stats")
def get_prediction_statistics(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    league_id: Optional[int] = None,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Get prediction statistics for the current user.
    Returns accuracy metrics, outcome breakdowns, and league-specific stats.
    """
    engine = get_engine(settings)
    _ensure_saved_predictions_table(engine)

    # Build WHERE clause
    where_clauses = ["created_by = :user_id"]
    params = {"user_id": int(current_user.id)}

    if date_from:
        where_clauses.append("prediction_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where_clauses.append("prediction_date <= :date_to")
        params["date_to"] = date_to
    if league_id:
        where_clauses.append("league_id = :league_id")
        params["league_id"] = league_id

    where_sql = " AND ".join(where_clauses)

    with engine.begin() as conn:
        # Overall statistics
        overall_sql = text(
            f"""
            SELECT
                COUNT(*) as total_predictions,
                COUNT(*) FILTER (WHERE status = 'settled') as settled_predictions,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_predictions,
                COUNT(*) FILTER (WHERE is_correct = true) as correct_predictions,
                CASE
                    WHEN COUNT(*) FILTER (WHERE status = 'settled') > 0
                    THEN CAST(COUNT(*) FILTER (WHERE is_correct = true) AS FLOAT) /
                         CAST(COUNT(*) FILTER (WHERE status = 'settled') AS FLOAT)
                    ELSE 0.0
                END as accuracy_rate
            FROM {SAVED_PREDICTIONS_TABLE}
            WHERE {where_sql}
            """
        )
        overall = conn.execute(overall_sql, params).mappings().first()

        # By outcome statistics
        outcome_sql = text(
            f"""
            SELECT
                prediction_outcome,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_correct = true) as correct,
                CASE
                    WHEN COUNT(*) FILTER (WHERE status = 'settled') > 0
                    THEN CAST(COUNT(*) FILTER (WHERE is_correct = true) AS FLOAT) /
                         CAST(COUNT(*) FILTER (WHERE status = 'settled') AS FLOAT)
                    ELSE 0.0
                END as accuracy
            FROM {SAVED_PREDICTIONS_TABLE}
            WHERE {where_sql} AND status = 'settled' AND prediction_outcome IS NOT NULL
            GROUP BY prediction_outcome
            """
        )
        by_outcome_rows = conn.execute(outcome_sql, params).mappings().all()

        # By league statistics (if no specific league filter)
        by_league = []
        if not league_id:
            league_sql = text(
                f"""
                SELECT
                    league_id,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_correct = true) as correct,
                    CASE
                        WHEN COUNT(*) FILTER (WHERE status = 'settled') > 0
                        THEN CAST(COUNT(*) FILTER (WHERE is_correct = true) AS FLOAT) /
                             CAST(COUNT(*) FILTER (WHERE status = 'settled') AS FLOAT)
                        ELSE 0.0
                    END as accuracy
                FROM {SAVED_PREDICTIONS_TABLE}
                WHERE {where_sql} AND status = 'settled' AND league_id IS NOT NULL
                GROUP BY league_id
                ORDER BY total DESC
                """
            )
            by_league_rows = conn.execute(league_sql, params).mappings().all()
            by_league = [
                {
                    "league_id": row["league_id"],
                    "total": row["total"],
                    "correct": row["correct"],
                    "accuracy": float(row["accuracy"]),
                }
                for row in by_league_rows
            ]

    # Format outcome breakdown
    by_outcome = {}
    for row in by_outcome_rows:
        outcome = row["prediction_outcome"]
        by_outcome[outcome] = {
            "total": row["total"],
            "correct": row["correct"],
            "accuracy": float(row["accuracy"]),
        }

    return {
        "total_predictions": overall["total_predictions"],
        "settled_predictions": overall["settled_predictions"],
        "pending_predictions": overall["pending_predictions"],
        "correct_predictions": overall["correct_predictions"],
        "accuracy_rate": float(overall["accuracy_rate"]),
        "by_outcome": by_outcome,
        "by_league": by_league,
    }


@router.post("/predictions/bulk-refresh")
def bulk_refresh_predictions(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    prediction_ids: Optional[list[int]] = None,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Bulk refresh actual results for predictions.
    Can filter by date range or specific prediction IDs.
    """
    engine = get_engine(settings)
    _ensure_saved_predictions_table(engine)

    # Build WHERE clause
    where_clauses = ["created_by = :user_id", "status = 'pending'"]
    params = {"user_id": int(current_user.id)}

    if prediction_ids:
        placeholders = ",".join([f":id_{i}" for i in range(len(prediction_ids))])
        where_clauses.append(f"id IN ({placeholders})")
        for i, pred_id in enumerate(prediction_ids):
            params[f"id_{i}"] = pred_id
    else:
        if date_from:
            where_clauses.append("fixture_date >= :date_from")
            params["date_from"] = date_from
        if date_to:
            where_clauses.append("fixture_date <= :date_to")
            params["date_to"] = date_to

    where_sql = " AND ".join(where_clauses)

    select_sql = text(f"SELECT * FROM {SAVED_PREDICTIONS_TABLE} WHERE {where_sql}")

    updated_count = 0
    updated_predictions = []

    with engine.begin() as conn:
        rows = conn.execute(select_sql, params).mappings().all()
        for row in rows:
            row_dict = dict(row)
            updated = _refresh_saved_prediction_result(conn, settings, row_dict)
            if updated:
                updated_count += 1
                # Fetch updated row
                refreshed = conn.execute(
                    text(f"SELECT * FROM {SAVED_PREDICTIONS_TABLE} WHERE id = :id"),
                    {"id": row_dict["id"]},
                ).mappings().first()
                if refreshed:
                    updated_predictions.append(_prediction_row_to_dict(dict(refreshed)))

    return {
        "refreshed_count": updated_count,
        "updated_predictions": updated_predictions,
    }


@router.delete("/predictions/{prediction_id}")
def delete_prediction(
    prediction_id: int,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Delete a prediction. Only the owner can delete their predictions.
    """
    engine = get_engine(settings)
    _ensure_saved_predictions_table(engine)

    with engine.begin() as conn:
        # Check if prediction exists and belongs to user
        select_sql = text(
            f"SELECT id, created_by FROM {SAVED_PREDICTIONS_TABLE} WHERE id = :id LIMIT 1"
        )
        row = conn.execute(select_sql, {"id": prediction_id}).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail=f"Prediction not found: {prediction_id}")

        if row["created_by"] != int(current_user.id):
            raise HTTPException(status_code=403, detail="You can only delete your own predictions")

        # Delete the prediction
        delete_sql = text(f"DELETE FROM {SAVED_PREDICTIONS_TABLE} WHERE id = :id")
        conn.execute(delete_sql, {"id": prediction_id})

    return {"success": True, "prediction_id": prediction_id}


@router.post("/tasks/ingest", response_model=TaskInfo)
def enqueue_ingest(request: IngestRequest):
    if request.end_date < request.start_date:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")
    task = ingest_task.delay(request.start_date.isoformat(), request.end_date.isoformat(), request.league_id)
    return _task_info(task.id)


@router.get("/ingest/status")
def get_ingest_status(
    league_id: int = DEFAULT_SUPERLIG_LEAGUE_ID,
    settings: Settings = Depends(get_settings),
):
    status = get_league_data_pool_status(league_id=int(league_id), settings=settings)
    return _serialize_ingest_status(status)


@router.post("/tasks/features", response_model=TaskInfo)
def enqueue_build_features():
    task = build_features_task.delay()
    return _task_info(task.id)


@router.post("/tasks/features-rebuild-full", response_model=TaskInfo)
def enqueue_build_features_full_rebuild(
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    task = build_features_full_rebuild_task.delay()
    return _task_info(task.id)


@router.post("/tasks/train", response_model=TaskInfo)
def enqueue_train(
    request: TrainRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_advanced_mode_for_training(settings, current_user)
    pro_data_sources = _resolve_pro_training_data_sources(settings)
    credits_remaining = consume_ai_credits(settings=settings, user_id=current_user.id, reason="model_training")
    model_scope = "ready" if current_user.role in MANAGER_ROLES else "user"
    training_mode = str(request.training_mode or "standard").strip().lower()
    date_from = request.date_from
    date_to = request.date_to
    if training_mode == "date_range":
        if date_from is None or date_to is None:
            raise HTTPException(status_code=400, detail="date_range mode icin date_from ve date_to zorunludur")
        if date_to < date_from:
            raise HTTPException(status_code=400, detail="date_to date_from tarihinden kucuk olamaz")
    effective_limit = request.limit if training_mode != "date_range" else None

    refresh_mode = "none"
    refresh_start_date = None
    refresh_end_date = None
    training_date_from = None
    training_date_to = None
    if training_mode == "latest":
        refresh_mode = "incremental"
    elif training_mode == "date_range":
        refresh_mode = "date_range"
        refresh_start_date = date_from.isoformat() if date_from else None
        refresh_end_date = date_to.isoformat() if date_to else None
        training_date_from = refresh_start_date
        training_date_to = refresh_end_date

    task = train_models_task.delay(
        effective_limit,
        request.league_id,
        request.model_name,
        pro_data_sources,
        request.description,
        request.set_active,
        int(current_user.id),
        str(current_user.username or ""),
        str(current_user.role or ""),
        model_scope,
        training_mode,
        training_date_from,
        training_date_to,
        refresh_mode,
        refresh_start_date,
        refresh_end_date,
        True,
    )
    payload = _task_info(task.id)
    payload.credits_remaining = credits_remaining
    return payload


@router.post("/tasks/ingest-superlig-history", response_model=TaskInfo)
def enqueue_superlig_history_ingest(request: SuperLigHistoryIngestRequest):
    task = ingest_league_history_task.delay(request.target_count, request.league_id)
    return _task_info(task.id)


@router.post("/tasks/ingest-league-history", response_model=TaskInfo)
def enqueue_league_history_ingest(request: SuperLigHistoryIngestRequest):
    task = ingest_league_history_task.delay(request.target_count, request.league_id)
    return _task_info(task.id)


@router.post("/tasks/ingest-incremental", response_model=TaskInfo)
def enqueue_incremental_ingest(request: IncrementalIngestRequest):
    task = ingest_incremental_task.delay(
        int(request.league_id),
        bool(request.include_feature_rebuild),
    )
    return _task_info(task.id)


@router.post("/tasks/fixtures-cache-refresh", response_model=TaskInfo)
def enqueue_fixtures_cache_refresh(
    request: FixturesCacheRefreshRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    if request.date_from and request.date_to and request.date_to < request.date_from:
        raise HTTPException(status_code=400, detail="date_to date_from tarihinden kucuk olamaz")
    league_ids = request.league_ids or None
    task = refresh_fixture_board_cache_task.delay(
        "manual",
        int(current_user.id),
        request.date_from.isoformat() if request.date_from else None,
        request.date_to.isoformat() if request.date_to else None,
        league_ids,
    )
    return _task_info(task.id)


@router.post("/tasks/bootstrap-league-models", response_model=TaskInfo)
def enqueue_bootstrap_league_models(
    request: BootstrapLeagueModelsRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    task = bootstrap_league_models_task.delay(
        "manual",
        int(current_user.id),
        request.league_ids or None,
    )
    return _task_info(task.id)


@router.post("/tasks/models-reset-and-reseed-pro", response_model=TaskInfo)
def enqueue_models_reset_and_reseed_pro(
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_superadmin_permissions(current_user)
    if not bool(current_user.advanced_mode_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu task icin superadmin kullanicisinda Advanced Mode acik olmali.",
        )
    task = models_reset_and_reseed_pro_task.delay(
        "manual",
        int(current_user.id),
        parse_league_model_ids(settings),
    )
    return _task_info(task.id)


@router.get("/fixtures-cache/status")
def get_fixtures_cache_status(
    validate_provider: bool = False,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    return get_fixture_cache_status(settings, validate_provider=bool(validate_provider))


@router.get("/league-models/status")
def get_league_models_status(
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    return get_league_model_status(settings)


@router.get("/models/backtest/latest")
def get_latest_model_backtest(
    league_id: Optional[int] = None,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    row = load_latest_backtest(settings=settings, league_id=league_id)
    if not row:
        raise HTTPException(status_code=404, detail="Backtest sonucu bulunamadi.")
    return row


@router.get("/models/sources")
def get_model_data_sources():
    return {"items": get_data_source_catalog()}


def _normalize_model_scope(item: dict[str, Any]) -> str:
    meta = item.get("meta") or {}
    raw_scope = str(item.get("model_scope") or meta.get("model_scope") or "").strip().lower()
    if raw_scope in {"ready", "user"}:
        return raw_scope

    owner_role = str(item.get("created_by_role") or meta.get("created_by_role") or "").strip().lower()
    if owner_role in MANAGER_ROLES:
        return "ready"

    owner_id = item.get("created_by_user_id")
    if owner_id is None:
        owner_id = meta.get("created_by_user_id")
    if owner_id is None:
        return "ready"

    return "user"


def _load_user_role_map(settings: Settings, user_ids: list[int]) -> dict[int, str]:
    safe_ids = sorted({int(uid) for uid in user_ids if uid is not None})
    if not safe_ids:
        return {}

    engine = get_engine(settings)
    sql = text(
        f"""
        SELECT id, role
        FROM {AUTH_USERS_TABLE}
        WHERE id = ANY(:user_ids)
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(sql, {"user_ids": safe_ids}).mappings().all()
    return {int(row["id"]): str(row["role"] or "").strip().lower() for row in rows}


def _decorate_model_item(
    item: dict[str, Any],
    current_user_id: int,
    owner_role_map: Optional[dict[int, str]] = None,
) -> dict[str, Any]:
    row = dict(item)
    meta = row.get("meta") or {}
    owner_id = row.get("created_by_user_id")
    if owner_id is None:
        owner_id = meta.get("created_by_user_id")
    owner_username = row.get("created_by_username") or meta.get("created_by_username")
    owner_role = row.get("created_by_role") or meta.get("created_by_role")
    if not owner_role and owner_role_map:
        try:
            owner_role = owner_role_map.get(int(owner_id))
        except (TypeError, ValueError):
            owner_role = owner_role

    row["created_by_user_id"] = owner_id
    row["created_by_username"] = owner_username
    row["created_by_role"] = owner_role
    scope = _normalize_model_scope(row)

    is_owned = False
    try:
        is_owned = owner_id is not None and int(owner_id) == int(current_user_id)
    except (TypeError, ValueError):
        is_owned = False

    row["model_scope"] = scope
    row["is_ready_model"] = scope == "ready"
    row["is_owned_by_me"] = is_owned
    return row


@router.get("/models")
def get_models(
    limit: int = 50,
    league_id: Optional[int] = None,
    page: int = 1,
    page_size: Optional[int] = None,
    model_type: str = "all",
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    safe_limit = max(1, min(limit, 500))
    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size if page_size is not None else safe_limit, 500))
    normalized_type = str(model_type or "all").strip().lower()
    if normalized_type not in {"all", "ready", "mine"}:
        raise HTTPException(status_code=400, detail="model_type must be one of: all, ready, mine")

    items = list_models(limit=5000)
    if league_id is not None:
        filtered: list[dict] = []
        for item in items:
            meta = item.get("meta") or {}
            league_raw = meta.get("league_id")
            try:
                if int(league_raw) == int(league_id):
                    filtered.append(item)
            except (TypeError, ValueError):
                continue
        items = filtered

    owner_ids: list[int] = []
    for item in items:
        owner_id = item.get("created_by_user_id")
        if owner_id is None:
            owner_id = (item.get("meta") or {}).get("created_by_user_id")
        try:
            if owner_id is not None:
                owner_ids.append(int(owner_id))
        except (TypeError, ValueError):
            continue

    owner_role_map = _load_user_role_map(settings, owner_ids) if owner_ids else {}
    current_user_id = int(current_user.id)
    decorated = [_decorate_model_item(item, current_user_id, owner_role_map) for item in items]
    if normalized_type == "ready":
        decorated = [item for item in decorated if item.get("model_scope") == "ready"]
    elif normalized_type == "mine":
        decorated = [item for item in decorated if bool(item.get("is_owned_by_me"))]

    total = len(decorated)
    total_pages = max(1, ceil(total / safe_page_size)) if total else 1
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    paged_items = decorated[start:end]

    return {
        "active_model_id": get_active_model_id(),
        "model_type": normalized_type,
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
        "items": paged_items,
    }


@router.get("/models/{model_id}")
def get_model_detail(model_id: str):
    item = get_model(model_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")
    return item


@router.get("/models/{model_id}/training-matches")
def get_model_training_matches(
    model_id: str,
    page: int = 1,
    page_size: int = 20,
    settings: Settings = Depends(get_settings),
):
    safe_page = max(1, page)
    safe_page_size = max(1, min(page_size, 100))

    model_payload = get_model(model_id)
    if not model_payload:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    meta = model_payload.get("meta") or {}
    league_id_raw = meta.get("league_id")
    try:
        model_league_id = int(league_id_raw) if league_id_raw is not None else None
    except (TypeError, ValueError):
        model_league_id = None

    snapshot_path = _resolve_training_snapshot_path(model_payload)
    is_legacy_derived = False
    if snapshot_path:
        try:
            df = pd.read_parquet(snapshot_path)
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail=f"Failed to read training snapshot: {exc}")
    else:
        # Backward compatibility for older models trained before snapshot support.
        df = _build_legacy_training_frame(model_payload, settings)
        is_legacy_derived = True

    last_training_event_date = None
    if "event_date" in df.columns:
        parsed_event_dates = pd.to_datetime(df["event_date"], errors="coerce")
        if not parsed_event_dates.empty:
            last_valid_event = parsed_event_dates.max()
            if pd.notna(last_valid_event):
                try:
                    last_training_event_date = last_valid_event.to_pydatetime()
                except Exception:
                    last_training_event_date = None

        event_dates = pd.to_datetime(df["event_date"], errors="coerce")
        df = df.assign(_event_date_sort=event_dates).sort_values("_event_date_sort", ascending=False).drop(
            columns=["_event_date_sort"], errors="ignore"
        )

    total = int(len(df))
    total_pages = max(1, ceil(total / safe_page_size)) if total else 1
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    sliced = df.iloc[start:end]

    records: list[dict] = []
    for row in sliced.to_dict(orient="records"):
        records.append({key: _to_python_value(value) for key, value in row.items()})

    ingest_status = None
    if model_league_id is not None:
        ingest_status = _serialize_ingest_status(
            get_league_data_pool_status(league_id=model_league_id, settings=settings)
        )

    return {
        "model_id": model_id,
        "model_name": model_payload.get("model_name"),
        "league_id": model_league_id,
        "snapshot_path": str(snapshot_path) if snapshot_path else None,
        "is_legacy_derived": is_legacy_derived,
        "rows_used": meta.get("rows_used"),
        "selected_data_sources": meta.get("selected_data_sources") or [],
        "feature_columns": meta.get("feature_columns") or [],
        "last_training_event_date": _to_iso_or_none(last_training_event_date),
        "ingest_status": ingest_status,
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
        "items": records,
    }


@router.post("/models/{model_id}/activate")
def set_active_model(model_id: str):
    item = activate_model(model_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")
    return {"active_model_id": model_id, "model": item}


@router.delete("/models/{model_id}")
def delete_model(
    model_id: str,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    model = get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    model_id_normalized = str(model_id or "").strip().lower()
    if model_id_normalized == "legacy-default":
        raise HTTPException(status_code=400, detail="Bu model sistem tarafından korunuyor ve silinemez.")

    model_meta = model.get("meta") or {}
    is_system_managed_meta = bool(model_meta.get("system_managed"))
    league_defaults = load_league_default_models(settings)
    is_default_mapping = any(str(row.get("model_id") or "").strip() == str(model_id) for row in league_defaults.values())
    if is_system_managed_meta or is_default_mapping:
        raise HTTPException(status_code=400, detail="Bu model sistem tarafından korunuyor ve silinemez.")

    try:
        deleted, active = delete_registered_model(model_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    return {
        "deleted_model_id": model_id,
        "deleted_model_name": deleted.get("model_name"),
        "active_model_id": active.get("model_id") if active else None,
        "active_model": active,
    }


@router.get("/tasks/{task_id}", response_model=TaskInfo)
def get_task(task_id: str):
    return _task_info(task_id)


@router.get("/users")
def list_users(
    limit: int = 200,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    safe_limit = max(1, min(limit, 500))

    engine = get_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at
                FROM {AUTH_USERS_TABLE}
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"limit": safe_limit},
        ).mappings().all()

    return {"items": [dict(row) for row in rows]}


@router.post("/users")
def create_user(
    request: CreateUserRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    target_role = str(request.role or "user").strip().lower()
    _ensure_role_assignment_allowed(current_user, target_role)

    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=400, detail="Email bos olamaz.")
    username = email

    initial_credits = int(settings.auth_initial_credits) if request.credits is None else int(request.credits)
    if initial_credits < 0:
        raise HTTPException(status_code=400, detail="Baslangic kredi negatif olamaz.")

    now_utc = datetime.now(timezone.utc)
    password_hash = hash_password(request.password)

    engine = get_engine(settings)
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    f"""
                    INSERT INTO {AUTH_USERS_TABLE} (
                        username, email, email_verified, password_hash, role, credits, is_active, created_at, updated_at
                    )
                    VALUES (
                        :username, :email, FALSE, :password_hash, :role, :credits, FALSE, :created_at, :updated_at
                    )
                    RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at
                    """
                ),
                {
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,
                    "role": target_role,
                    "credits": initial_credits,
                    "created_at": now_utc,
                    "updated_at": now_utc,
                },
            ).mappings().first()
            if not row:
                raise HTTPException(status_code=500, detail="Kullanici olusturulamadi.")

            if initial_credits != 0:
                conn.execute(
                    text(
                        f"""
                        INSERT INTO {CREDIT_TX_TABLE} (user_id, delta, reason, created_by)
                        VALUES (:user_id, :delta, :reason, :created_by)
                        """
                    ),
                    {
                        "user_id": int(row["id"]),
                        "delta": initial_credits,
                        "reason": "signup_initial_credits",
                        "created_by": int(current_user.id),
                    },
                )

            code = _create_email_challenge(
                conn,
                email=email,
                purpose=EMAIL_CODE_PURPOSE_REGISTER,
                payload={
                    "source": "admin_create",
                    "user_id": int(row["id"]),
                },
                settings=settings,
            )
            _send_email_code(settings, email=email, purpose=EMAIL_CODE_PURPOSE_REGISTER, code=code)
    except MailDeliveryError as exc:
        raise HTTPException(status_code=503, detail=f"Mail gonderimi basarisiz: {exc}")
    except SQLAlchemyError as exc:
        msg = str(exc).lower()
        if "unique" in msg and ("username" in msg or "email" in msg):
            raise HTTPException(status_code=409, detail="Bu email zaten kullaniliyor.")
        raise HTTPException(status_code=500, detail=f"Kullanici olusturma hatasi: {exc}")

    return {"user": dict(row)}


@router.post("/users/{user_id}/password")
def admin_set_user_password(
    user_id: int,
    request: SetUserPasswordRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    engine = get_engine(settings)
    now_utc = datetime.now(timezone.utc)

    with engine.begin() as conn:
        target = conn.execute(
            text(
                f"""
                SELECT id, role
                FROM {AUTH_USERS_TABLE}
                WHERE id = :user_id
                LIMIT 1
                """
            ),
            {"user_id": int(user_id)},
        ).mappings().first()
        if not target:
            raise HTTPException(status_code=404, detail="Kullanici bulunamadi.")

        _target_user_access_allowed(current_user, str(target["role"]))
        conn.execute(
            text(
                f"""
                UPDATE {AUTH_USERS_TABLE}
                SET password_hash = :password_hash,
                    updated_at = :updated_at
                WHERE id = :user_id
                """
            ),
            {
                "password_hash": hash_password(request.new_password),
                "updated_at": now_utc,
                "user_id": int(user_id),
            },
        )

    return {"ok": True, "user_id": int(user_id)}


@router.post("/users/{user_id}/credits")
def admin_update_user_credits(
    user_id: int,
    request: UpdateUserCreditsRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    delta = int(request.delta)
    if delta == 0:
        raise HTTPException(status_code=400, detail="delta 0 olamaz.")

    engine = get_engine(settings)
    now_utc = datetime.now(timezone.utc)

    with engine.begin() as conn:
        target = conn.execute(
            text(
                f"""
                SELECT id, role, credits
                FROM {AUTH_USERS_TABLE}
                WHERE id = :user_id
                LIMIT 1
                """
            ),
            {"user_id": int(user_id)},
        ).mappings().first()
        if not target:
            raise HTTPException(status_code=404, detail="Kullanici bulunamadi.")

        _target_user_access_allowed(current_user, str(target["role"]))
        updated = conn.execute(
            text(
                f"""
                UPDATE {AUTH_USERS_TABLE}
                SET credits = credits + :delta,
                    updated_at = :updated_at
                WHERE id = :user_id
                  AND credits + :delta >= 0
                RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at
                """
            ),
            {
                "delta": delta,
                "updated_at": now_utc,
                "user_id": int(user_id),
            },
        ).mappings().first()

        if not updated:
            raise HTTPException(status_code=400, detail="Bu islem sonrasi kredi negatif olamaz.")

        conn.execute(
            text(
                f"""
                INSERT INTO {CREDIT_TX_TABLE} (user_id, delta, reason, created_by)
                VALUES (:user_id, :delta, :reason, :created_by)
                """
            ),
            {
                "user_id": int(user_id),
                "delta": delta,
                "reason": request.reason or "manual_adjustment",
                "created_by": int(current_user.id),
            },
        )

    return {"user": dict(updated)}


@router.post("/payments/notify")
def submit_payment_notice(
    request: PaymentNoticeRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    engine = get_engine(settings)
    _ensure_payment_notices_table(engine)
    now_utc = datetime.now(timezone.utc)

    try:
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    f"""
                    INSERT INTO {PAYMENT_NOTICES_TABLE} (
                        user_id,
                        username,
                        user_role,
                        package_key,
                        package_title,
                        chain,
                        amount_tl,
                        transaction_id,
                        telegram_contact,
                        note,
                        status,
                        created_at,
                        updated_at
                    ) VALUES (
                        :user_id,
                        :username,
                        :user_role,
                        :package_key,
                        :package_title,
                        :chain,
                        :amount_tl,
                        :transaction_id,
                        :telegram_contact,
                        :note,
                        'pending',
                        :created_at,
                        :updated_at
                    )
                    RETURNING *
                    """
                ),
                {
                    "user_id": int(current_user.id),
                    "username": current_user.email or current_user.username,
                    "user_role": current_user.role,
                    "package_key": request.package_key,
                    "package_title": request.package_title,
                    "chain": request.chain,
                    "amount_tl": int(request.amount_tl),
                    "transaction_id": request.transaction_id.strip(),
                    "telegram_contact": request.telegram_contact,
                    "note": request.note,
                    "created_at": now_utc,
                    "updated_at": now_utc,
                },
            ).mappings().first()
    except SQLAlchemyError as exc:
        msg = str(exc).lower()
        if "duplicate" in msg or "unique" in msg:
            raise HTTPException(status_code=409, detail="Bu transaction id daha once bildirildi.")
        raise HTTPException(status_code=500, detail=f"Odeme bildirimi kaydedilemedi: {exc}")

    return {"notice": dict(row) if row else None}


@router.get("/payments/notices")
def list_payment_notices(
    limit: int = 100,
    status_filter: Optional[str] = None,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    safe_limit = max(1, min(limit, 500))
    allowed_status = {"pending", "approved", "rejected"}
    normalized_status = str(status_filter or "").strip().lower() or None
    if normalized_status and normalized_status not in allowed_status:
        raise HTTPException(status_code=400, detail="Gecersiz status filtre degeri.")

    engine = get_engine(settings)
    _ensure_payment_notices_table(engine)
    sql = f"SELECT * FROM {PAYMENT_NOTICES_TABLE}"
    params: dict[str, Any] = {"limit": safe_limit}
    if normalized_status:
        sql += " WHERE status = :status"
        params["status"] = normalized_status
    sql += " ORDER BY created_at DESC LIMIT :limit"

    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()
    return {"items": [dict(row) for row in rows]}


@router.post("/payments/notices/{notice_id}/status")
def set_payment_notice_status(
    notice_id: int,
    request: PaymentNoticeStatusRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    engine = get_engine(settings)
    _ensure_payment_notices_table(engine)
    now_utc = datetime.now(timezone.utc)
    advanced_mode_granted = False
    granted_user_id: Optional[int] = None
    with engine.begin() as conn:
        existing = conn.execute(
            text(
                f"""
                SELECT id, user_id, package_key
                FROM {PAYMENT_NOTICES_TABLE}
                WHERE id = :notice_id
                LIMIT 1
                """
            ),
            {"notice_id": int(notice_id)},
        ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="Odeme bildirimi bulunamadi.")

        updated = conn.execute(
            text(
                f"""
                UPDATE {PAYMENT_NOTICES_TABLE}
                SET status = :status,
                    admin_note = :admin_note,
                    reviewed_by = :reviewed_by,
                    reviewed_at = :reviewed_at,
                    updated_at = :updated_at
                WHERE id = :notice_id
                RETURNING *
                """
            ),
            {
                "status": request.status,
                "admin_note": request.admin_note,
                "reviewed_by": int(current_user.id),
                "reviewed_at": now_utc,
                "updated_at": now_utc,
                "notice_id": int(notice_id),
            },
        ).mappings().first()
        if not updated:
            raise HTTPException(status_code=404, detail="Odeme bildirimi bulunamadi.")

        if (
            str(request.status or "").strip().lower() == "approved"
            and str(existing.get("package_key") or "").strip() == str(settings.advanced_mode_package_key).strip()
        ):
            grant_row = conn.execute(
                text(
                    f"""
                    UPDATE {AUTH_USERS_TABLE}
                    SET advanced_mode_enabled = TRUE,
                        updated_at = :updated_at
                    WHERE id = :user_id
                      AND advanced_mode_enabled = FALSE
                    RETURNING id
                    """
                ),
                {
                    "user_id": int(existing.get("user_id") or 0),
                    "updated_at": now_utc,
                },
            ).mappings().first()
            if grant_row:
                advanced_mode_granted = True
                granted_user_id = int(grant_row["id"])
            else:
                granted_user_id = int(existing.get("user_id") or 0)

    return {
        "notice": dict(updated),
        "advanced_mode_granted": bool(advanced_mode_granted),
        "advanced_mode_user_id": granted_user_id,
    }


@router.delete("/payments/notices/{notice_id}")
def delete_rejected_payment_notice(
    notice_id: int,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ensure_manager_permissions(current_user)
    engine = get_engine(settings)
    _ensure_payment_notices_table(engine)

    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                SELECT id, status
                FROM {PAYMENT_NOTICES_TABLE}
                WHERE id = :notice_id
                LIMIT 1
                """
            ),
            {"notice_id": int(notice_id)},
        ).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Odeme bildirimi bulunamadi.")

        current_status = str(row.get("status") or "").strip().lower()
        if current_status != "rejected":
            raise HTTPException(status_code=400, detail="Sadece reddedilen odeme bildirimleri silinebilir.")

        conn.execute(
            text(
                f"""
                DELETE FROM {PAYMENT_NOTICES_TABLE}
                WHERE id = :notice_id
                """
            ),
            {"notice_id": int(notice_id)},
        )

    return {"deleted_id": int(notice_id)}
