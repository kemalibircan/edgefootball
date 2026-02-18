from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
from cachetools import TTLCache
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings, get_settings
from app.league_model_routing import resolve_model_for_league
from data.features import extract_basic_features
from modeling.registry import resolve_model_dir
from sportmonks_client.client import SportMonksClient
from sportmonks_client.models import FixturePayload

ARTIFACT_DIR = Path("artifacts")
FEATURE_COLUMNS = [
    "form_matches_home",
    "form_matches_away",
    "form_goals_for_home",
    "form_goals_for_away",
    "form_goals_against_home",
    "form_goals_against_away",
    "form_goal_balance_home",
    "form_goal_balance_away",
    "form_points_home",
    "form_points_away",
    "form_shots_home",
    "form_shots_away",
    "form_shots_on_target_home",
    "form_shots_on_target_away",
    "form_possession_home",
    "form_possession_away",
    "form_dangerous_attacks_home",
    "form_dangerous_attacks_away",
    "form_points_diff",
    "form_goal_balance_diff",
    "form_shots_on_target_diff",
    "form_possession_diff",
    "form_dangerous_attacks_diff",
    "form_corners_home",
    "form_corners_away",
    "form_corners_diff",
    "form_offsides_home",
    "form_offsides_away",
    "form_offsides_diff",
    "form_yellow_cards_home",
    "form_yellow_cards_away",
    "form_yellow_cards_diff",
    "form_red_cards_home",
    "form_red_cards_away",
    "form_red_cards_diff",
    "form_penalties_home",
    "form_penalties_away",
    "form_penalties_diff",
    "form_key_passes_home",
    "form_key_passes_away",
    "form_key_passes_diff",
    "form_big_chances_created_home",
    "form_big_chances_created_away",
    "form_big_chances_created_diff",
    "form_big_chances_missed_home",
    "form_big_chances_missed_away",
    "form_big_chances_missed_diff",
    "form_shots_blocked_home",
    "form_shots_blocked_away",
    "form_shots_blocked_diff",
    "form_injury_count_home",
    "form_injury_count_away",
    "form_suspension_count_home",
    "form_suspension_count_away",
    "form_starter_count_home",
    "form_starter_count_away",
    "form_lineup_known_home",
    "form_lineup_known_away",
    "elo_home_pre",
    "elo_away_pre",
    "elo_diff",
    "home_team_id",
    "away_team_id",
    "shots_home",
    "shots_away",
    "shots_on_target_home",
    "shots_on_target_away",
    "possession_home",
    "possession_away",
    "dangerous_attacks_home",
    "dangerous_attacks_away",
    "corners_home",
    "corners_away",
    "offsides_home",
    "offsides_away",
    "yellow_cards_home",
    "yellow_cards_away",
    "red_cards_home",
    "red_cards_away",
    "penalties_home",
    "penalties_away",
    "key_passes_home",
    "key_passes_away",
    "big_chances_created_home",
    "big_chances_created_away",
    "big_chances_missed_home",
    "big_chances_missed_away",
    "shots_blocked_home",
    "shots_blocked_away",
    "injury_count_home",
    "injury_count_away",
    "suspension_count_home",
    "suspension_count_away",
    "lineup_known_home",
    "lineup_known_away",
    "starter_count_home",
    "starter_count_away",
    "market_prob_home",
    "market_prob_draw",
    "market_prob_away",
    "referee_yellow_cards",
    "referee_penalties",
    "weather_temp",
    "weather_wind",
    "weather_humidity",
]
KEY_FEATURE_COLUMNS = [
    "form_points_diff",
    "form_goal_balance_diff",
    "elo_diff",
    "market_prob_home",
    "market_prob_draw",
    "market_prob_away",
]
FORM_WINDOW = 8
ELO_BASE = 1500.0
ELO_K = 20.0
ELO_HOME_ADVANTAGE = 65.0
MAX_ANALYTIC_GOALS = 10
DEFAULT_DIXON_COLES_RHO = -0.08

_FEATURE_CACHE: Optional[TTLCache] = None
_FEATURE_CACHE_TTL: Optional[int] = None
_MODEL_CACHE: Optional[TTLCache] = None
_MODEL_CACHE_TTL: Optional[int] = None


class SimulationResult(dict):
    pass


def _to_float(value, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, dict):
        for key in ("value", "day", "speed"):
            if key in value:
                return _to_float(value.get(key), default=default)
        return default
    if isinstance(value, str):
        value = value.replace("%", "").strip()
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _optional_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_nan(value: object) -> bool:
    try:
        return bool(np.isnan(value))  # type: ignore[arg-type]
    except Exception:
        return False


def _result_points(goals_for: Optional[float], goals_against: Optional[float]) -> Optional[float]:
    if goals_for is None or goals_against is None:
        return None
    if goals_for > goals_against:
        return 3.0
    if goals_for < goals_against:
        return 0.0
    return 1.0


def _mean_or_default(values: List[Optional[float]], default: float, positive_only: bool = False) -> float:
    clean: List[float] = []
    for item in values:
        if item is None:
            continue
        v = float(item)
        if positive_only and v <= 0:
            continue
        clean.append(v)
    if not clean:
        return default
    return float(sum(clean) / len(clean))


def _elo_expected_home(home_elo: float, away_elo: float) -> float:
    return 1.0 / (1.0 + 10 ** (((away_elo - (home_elo + ELO_HOME_ADVANTAGE)) / 400.0)))


def _elo_post_match(home_elo: float, away_elo: float, home_goals: float, away_goals: float) -> tuple[float, float]:
    expected_home = _elo_expected_home(home_elo, away_elo)
    if home_goals > away_goals:
        actual_home = 1.0
    elif home_goals < away_goals:
        actual_home = 0.0
    else:
        actual_home = 0.5
    goal_margin = max(1.0, abs(home_goals - away_goals))
    margin_multiplier = 1.0 + 0.15 * min(goal_margin, 4.0)
    delta = ELO_K * margin_multiplier * (actual_home - expected_home)
    return home_elo + delta, away_elo - delta


def _parse_datetime(value: Optional[str]) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
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
            return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _get_fixture_teams(payload: FixturePayload):
    participants = payload.data.participants
    home = next((p for p in participants if p.meta and p.meta.get("location") == "home"), participants[0])
    away = next((p for p in participants if p.meta and p.meta.get("location") == "away"), participants[1])
    return home, away


def _participant_logo(participant) -> Optional[str]:
    if participant is None:
        return None
    for key in ("image_path", "logo_path"):
        value = getattr(participant, key, None)
        if isinstance(value, str) and value.strip():
            return value

    for key in ("image", "logo"):
        nested = getattr(participant, key, None)
        if isinstance(nested, str) and nested.strip():
            return nested
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


def _get_feature_cache(settings: Settings) -> TTLCache:
    global _FEATURE_CACHE, _FEATURE_CACHE_TTL
    ttl = max(30, int(getattr(settings, "simulate_feature_cache_ttl_seconds", 120)))
    if _FEATURE_CACHE is None or _FEATURE_CACHE_TTL != ttl:
        _FEATURE_CACHE = TTLCache(maxsize=1024, ttl=ttl)
        _FEATURE_CACHE_TTL = ttl
    return _FEATURE_CACHE


def _get_model_cache(settings: Settings) -> TTLCache:
    global _MODEL_CACHE, _MODEL_CACHE_TTL
    ttl = max(30, int(getattr(settings, "simulate_model_cache_ttl_seconds", 300)))
    if _MODEL_CACHE is None or _MODEL_CACHE_TTL != ttl:
        _MODEL_CACHE = TTLCache(maxsize=128, ttl=ttl)
        _MODEL_CACHE_TTL = ttl
    return _MODEL_CACHE


def load_models(model_id: Optional[str] = None):
    model_dir, model_entry = resolve_model_dir(model_id=model_id)
    lambda_home_path = model_dir / "lambda_home.pkl"
    lambda_away_path = model_dir / "lambda_away.pkl"
    meta_path = model_dir / "meta.json"

    if not lambda_home_path.exists() or not lambda_away_path.exists():
        raise FileNotFoundError("Model artifacts not found. Train models with `make train`.")

    model_meta: Dict[str, object] = {}
    if meta_path.exists():
        try:
            model_meta = json.loads(meta_path.read_text())
        except Exception:
            model_meta = {}

    if isinstance(model_entry, dict):
        model_meta.setdefault("model_id", model_entry.get("model_id"))
        model_meta.setdefault("model_name", model_entry.get("model_name"))
        model_meta.setdefault("model_version", model_entry.get("version"))
        model_meta.setdefault("trained_at", model_entry.get("trained_at"))

    return joblib.load(lambda_home_path), joblib.load(lambda_away_path), model_meta


def _load_models_cached(*, model_id: Optional[str], settings: Settings):
    cache = _get_model_cache(settings)
    cache_key = f"{model_id or '__active__'}:{id(load_models)}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    bundle = load_models(model_id=model_id)
    cache[cache_key] = bundle
    return bundle


def build_feature_vector(payload: FixturePayload) -> Dict[str, float]:
    payload_dict = payload.model_dump(mode="python")
    extracted = extract_basic_features(payload_dict)
    home, away = _get_fixture_teams(payload)

    market_cols = {"market_prob_home", "market_prob_draw", "market_prob_away"}
    feats: Dict[str, float] = {}
    for col in FEATURE_COLUMNS:
        if col == "home_team_id":
            feats[col] = float(home.id)
            continue
        if col == "away_team_id":
            feats[col] = float(away.id)
            continue
        raw_value = extracted.get(col)
        if col in market_cols and raw_value is None:
            feats[col] = None  # type: ignore[assignment]
            continue
        feats[col] = _to_float(raw_value, default=0.0)
    return feats


def _build_feature_vector_cached(payload: FixturePayload, settings: Settings) -> Dict[str, float]:
    cache = _get_feature_cache(settings)
    cache_key = int(payload.data.id)
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        return dict(cached)
    feats = build_feature_vector(payload)
    cache[cache_key] = dict(feats)
    return feats


def _fetch_recent_team_rows(settings: Settings, team_id: int, fixture_dt: datetime, limit: int = 24) -> List[dict]:
    query = text(
        """
        SELECT home_team_id, away_team_id, feature_vector, event_date, label_home_goals, label_away_goals
        FROM features
        WHERE (home_team_id = :team_id OR away_team_id = :team_id)
          AND (event_date IS NULL OR event_date < :fixture_dt)
        ORDER BY event_date DESC NULLS LAST
        LIMIT :limit
        """
    )
    try:
        engine = create_engine(settings.db_url)
        with engine.connect() as conn:
            rows = conn.execute(query, {"team_id": team_id, "fixture_dt": fixture_dt, "limit": limit}).mappings().all()
            return [dict(row) for row in rows]
    except (SQLAlchemyError, ModuleNotFoundError):
        return []
    except Exception:
        return []


def _team_recent_form(rows: List[dict], team_id: int) -> Dict[str, float]:
    history: List[dict] = []
    for row in rows:
        fv = row.get("feature_vector") or {}
        side = None
        if row.get("home_team_id") == team_id:
            side = "home"
        elif row.get("away_team_id") == team_id:
            side = "away"
        if side is None:
            continue

        goals_for = _optional_float(row.get("label_home_goals" if side == "home" else "label_away_goals"))
        goals_against = _optional_float(row.get("label_away_goals" if side == "home" else "label_home_goals"))
        if goals_for is None:
            goals_for = _optional_float(fv.get("label_home_goals" if side == "home" else "label_away_goals"))
        if goals_against is None:
            goals_against = _optional_float(fv.get("label_away_goals" if side == "home" else "label_home_goals"))

        history.append(
            {
                "shots": _optional_float(fv.get("shots_home" if side == "home" else "shots_away")),
                "shots_on_target": _optional_float(
                    fv.get("shots_on_target_home" if side == "home" else "shots_on_target_away")
                ),
                "possession": _optional_float(fv.get("possession_home" if side == "home" else "possession_away")),
                "dangerous_attacks": _optional_float(
                    fv.get("dangerous_attacks_home" if side == "home" else "dangerous_attacks_away")
                ),
                "corners": _optional_float(fv.get("corners_home" if side == "home" else "corners_away")),
                "offsides": _optional_float(fv.get("offsides_home" if side == "home" else "offsides_away")),
                "yellow_cards": _optional_float(
                    fv.get("yellow_cards_home" if side == "home" else "yellow_cards_away")
                ),
                "red_cards": _optional_float(fv.get("red_cards_home" if side == "home" else "red_cards_away")),
                "penalties": _optional_float(fv.get("penalties_home" if side == "home" else "penalties_away")),
                "key_passes": _optional_float(fv.get("key_passes_home" if side == "home" else "key_passes_away")),
                "big_chances_created": _optional_float(
                    fv.get("big_chances_created_home" if side == "home" else "big_chances_created_away")
                ),
                "big_chances_missed": _optional_float(
                    fv.get("big_chances_missed_home" if side == "home" else "big_chances_missed_away")
                ),
                "shots_blocked": _optional_float(fv.get("shots_blocked_home" if side == "home" else "shots_blocked_away")),
                "injury_count": _optional_float(fv.get("injury_count_home" if side == "home" else "injury_count_away")),
                "suspension_count": _optional_float(
                    fv.get("suspension_count_home" if side == "home" else "suspension_count_away")
                ),
                "starter_count": _optional_float(fv.get("starter_count_home" if side == "home" else "starter_count_away")),
                "lineup_known": _optional_float(fv.get("lineup_known_home" if side == "home" else "lineup_known_away")),
                "goals_for": goals_for,
                "goals_against": goals_against,
                "points": _result_points(goals_for, goals_against),
            }
        )
        if len(history) >= FORM_WINDOW:
            break

    return {
        "matches": float(len(history)),
        "goals_for": _mean_or_default([item.get("goals_for") for item in history], default=1.2),
        "goals_against": _mean_or_default([item.get("goals_against") for item in history], default=1.2),
        "points": _mean_or_default([item.get("points") for item in history], default=1.3),
        "shots": _mean_or_default([item.get("shots") for item in history], default=11.0, positive_only=True),
        "shots_on_target": _mean_or_default(
            [item.get("shots_on_target") for item in history], default=4.0, positive_only=True
        ),
        "possession": _mean_or_default([item.get("possession") for item in history], default=50.0, positive_only=True),
        "dangerous_attacks": _mean_or_default(
            [item.get("dangerous_attacks") for item in history], default=34.0, positive_only=True
        ),
        "corners": _mean_or_default([item.get("corners") for item in history], default=0.0),
        "offsides": _mean_or_default([item.get("offsides") for item in history], default=0.0),
        "yellow_cards": _mean_or_default([item.get("yellow_cards") for item in history], default=0.0),
        "red_cards": _mean_or_default([item.get("red_cards") for item in history], default=0.0),
        "penalties": _mean_or_default([item.get("penalties") for item in history], default=0.0),
        "key_passes": _mean_or_default([item.get("key_passes") for item in history], default=0.0),
        "big_chances_created": _mean_or_default([item.get("big_chances_created") for item in history], default=0.0),
        "big_chances_missed": _mean_or_default([item.get("big_chances_missed") for item in history], default=0.0),
        "shots_blocked": _mean_or_default([item.get("shots_blocked") for item in history], default=0.0),
        "injury_count": _mean_or_default([item.get("injury_count") for item in history], default=0.0),
        "suspension_count": _mean_or_default([item.get("suspension_count") for item in history], default=0.0),
        "starter_count": _mean_or_default([item.get("starter_count") for item in history], default=0.0),
        "lineup_known": _mean_or_default([item.get("lineup_known") for item in history], default=0.0),
    }


def _team_latest_post_elo(rows: List[dict], team_id: int) -> float:
    for row in rows:
        side = None
        if row.get("home_team_id") == team_id:
            side = "home"
        elif row.get("away_team_id") == team_id:
            side = "away"
        if side is None:
            continue
        fv = row.get("feature_vector") or {}
        home_pre = _optional_float(fv.get("elo_home_pre"))
        away_pre = _optional_float(fv.get("elo_away_pre"))
        if home_pre is None or away_pre is None:
            continue

        home_goals = _optional_float(row.get("label_home_goals"))
        away_goals = _optional_float(row.get("label_away_goals"))
        if home_goals is None:
            home_goals = _optional_float(fv.get("label_home_goals"))
        if away_goals is None:
            away_goals = _optional_float(fv.get("label_away_goals"))

        if home_goals is None or away_goals is None:
            return float(home_pre if side == "home" else away_pre)

        home_post, away_post = _elo_post_match(home_pre, away_pre, home_goals, away_goals)
        return float(home_post if side == "home" else away_post)
    return ELO_BASE


def _inject_historical_form(features: Dict[str, float], payload: FixturePayload, settings: Settings) -> bool:
    home, away = _get_fixture_teams(payload)
    fixture_dt = _parse_datetime(payload.data.starting_at)
    home_rows = _fetch_recent_team_rows(settings, home.id, fixture_dt)
    away_rows = _fetch_recent_team_rows(settings, away.id, fixture_dt)
    used_history = bool(home_rows or away_rows)

    home_form = _team_recent_form(home_rows, home.id)
    away_form = _team_recent_form(away_rows, away.id)

    features["form_matches_home"] = home_form["matches"]
    features["form_matches_away"] = away_form["matches"]
    features["form_goals_for_home"] = home_form["goals_for"]
    features["form_goals_for_away"] = away_form["goals_for"]
    features["form_goals_against_home"] = home_form["goals_against"]
    features["form_goals_against_away"] = away_form["goals_against"]
    features["form_goal_balance_home"] = home_form["goals_for"] - home_form["goals_against"]
    features["form_goal_balance_away"] = away_form["goals_for"] - away_form["goals_against"]
    features["form_points_home"] = home_form["points"]
    features["form_points_away"] = away_form["points"]
    features["form_shots_home"] = home_form["shots"]
    features["form_shots_away"] = away_form["shots"]
    features["form_shots_on_target_home"] = home_form["shots_on_target"]
    features["form_shots_on_target_away"] = away_form["shots_on_target"]
    features["form_possession_home"] = home_form["possession"]
    features["form_possession_away"] = away_form["possession"]
    features["form_dangerous_attacks_home"] = home_form["dangerous_attacks"]
    features["form_dangerous_attacks_away"] = away_form["dangerous_attacks"]
    features["form_points_diff"] = home_form["points"] - away_form["points"]
    features["form_goal_balance_diff"] = (home_form["goals_for"] - home_form["goals_against"]) - (
        away_form["goals_for"] - away_form["goals_against"]
    )
    features["form_shots_on_target_diff"] = home_form["shots_on_target"] - away_form["shots_on_target"]
    features["form_possession_diff"] = home_form["possession"] - away_form["possession"]
    features["form_dangerous_attacks_diff"] = home_form["dangerous_attacks"] - away_form["dangerous_attacks"]

    features["form_corners_home"] = home_form["corners"]
    features["form_corners_away"] = away_form["corners"]
    features["form_corners_diff"] = home_form["corners"] - away_form["corners"]
    features["form_offsides_home"] = home_form["offsides"]
    features["form_offsides_away"] = away_form["offsides"]
    features["form_offsides_diff"] = home_form["offsides"] - away_form["offsides"]
    features["form_yellow_cards_home"] = home_form["yellow_cards"]
    features["form_yellow_cards_away"] = away_form["yellow_cards"]
    features["form_yellow_cards_diff"] = home_form["yellow_cards"] - away_form["yellow_cards"]
    features["form_red_cards_home"] = home_form["red_cards"]
    features["form_red_cards_away"] = away_form["red_cards"]
    features["form_red_cards_diff"] = home_form["red_cards"] - away_form["red_cards"]
    features["form_penalties_home"] = home_form["penalties"]
    features["form_penalties_away"] = away_form["penalties"]
    features["form_penalties_diff"] = home_form["penalties"] - away_form["penalties"]
    features["form_key_passes_home"] = home_form["key_passes"]
    features["form_key_passes_away"] = away_form["key_passes"]
    features["form_key_passes_diff"] = home_form["key_passes"] - away_form["key_passes"]
    features["form_big_chances_created_home"] = home_form["big_chances_created"]
    features["form_big_chances_created_away"] = away_form["big_chances_created"]
    features["form_big_chances_created_diff"] = home_form["big_chances_created"] - away_form["big_chances_created"]
    features["form_big_chances_missed_home"] = home_form["big_chances_missed"]
    features["form_big_chances_missed_away"] = away_form["big_chances_missed"]
    features["form_big_chances_missed_diff"] = home_form["big_chances_missed"] - away_form["big_chances_missed"]
    features["form_shots_blocked_home"] = home_form["shots_blocked"]
    features["form_shots_blocked_away"] = away_form["shots_blocked"]
    features["form_shots_blocked_diff"] = home_form["shots_blocked"] - away_form["shots_blocked"]

    features["form_injury_count_home"] = home_form["injury_count"]
    features["form_injury_count_away"] = away_form["injury_count"]
    features["form_suspension_count_home"] = home_form["suspension_count"]
    features["form_suspension_count_away"] = away_form["suspension_count"]
    features["form_starter_count_home"] = home_form["starter_count"]
    features["form_starter_count_away"] = away_form["starter_count"]
    features["form_lineup_known_home"] = home_form["lineup_known"]
    features["form_lineup_known_away"] = away_form["lineup_known"]

    home_elo = _team_latest_post_elo(home_rows, home.id)
    away_elo = _team_latest_post_elo(away_rows, away.id)
    features["elo_home_pre"] = home_elo
    features["elo_away_pre"] = away_elo
    features["elo_diff"] = home_elo - away_elo
    return used_history


def _text_or_none(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    text_value = value.strip()
    return text_value or None


def _is_valid_player_name(value: str) -> bool:
    return bool(value and not value.isdigit())


def _extract_player_name(row: dict, player_payload: Optional[dict] = None) -> Optional[str]:
    player_payload = player_payload or {}

    direct_first = _text_or_none(row.get("firstname")) or _text_or_none(row.get("first_name"))
    direct_last = _text_or_none(row.get("lastname")) or _text_or_none(row.get("last_name"))
    direct_full = " ".join(part for part in [direct_first, direct_last] if part).strip() or None

    nested_first = _text_or_none(player_payload.get("firstname")) or _text_or_none(player_payload.get("first_name"))
    nested_last = _text_or_none(player_payload.get("lastname")) or _text_or_none(player_payload.get("last_name"))
    nested_full = " ".join(part for part in [nested_first, nested_last] if part).strip() or None

    candidates = [
        row.get("player_name"),
        row.get("name"),
        row.get("display_name"),
        row.get("common_name"),
        row.get("full_name"),
        direct_full,
        player_payload.get("player_name"),
        player_payload.get("name"),
        player_payload.get("display_name"),
        player_payload.get("common_name"),
        player_payload.get("full_name"),
        nested_full,
    ]
    for candidate in candidates:
        cleaned = _text_or_none(candidate)
        if cleaned and _is_valid_player_name(cleaned):
            return cleaned
    return None


def _normalize_lineup_row(row: dict) -> Optional[dict]:
    if not isinstance(row, dict):
        return None

    team_id_raw = row.get("team_id")
    if team_id_raw is None:
        team_id_raw = row.get("participant_id")
    try:
        team_id = int(team_id_raw)
    except (TypeError, ValueError):
        return None

    player_node = row.get("player")
    player_payload: dict = {}
    if isinstance(player_node, dict):
        nested = player_node.get("data")
        if isinstance(nested, dict):
            player_payload = nested
        else:
            player_payload = player_node

    player_id_raw = row.get("player_id")
    if player_id_raw is None and player_payload:
        player_id_raw = player_payload.get("id") or player_payload.get("player_id")
    try:
        player_id = int(player_id_raw)
    except (TypeError, ValueError):
        return None

    player_name = _extract_player_name(row, player_payload) or f"Oyuncu {player_id}"
    return {
        "team_id": team_id,
        "player_id": player_id,
        "player_name": player_name,
        "formation_position": row.get("formation_position"),
        "type_id": row.get("type_id") if row.get("type_id") is not None else player_payload.get("type_id"),
        "jersey_number": row.get("jersey_number")
        if row.get("jersey_number") is not None
        else player_payload.get("jersey_number"),
    }


def _lineup_candidates(payload: FixturePayload, team_id: int) -> List[dict]:
    lineups = payload.data.lineups or []
    team_players = []
    for row in lineups:
        normalized = _normalize_lineup_row(row)
        if not normalized:
            continue
        if int(normalized.get("team_id")) == int(team_id):
            team_players.append(normalized)

    if not team_players:
        return []

    starters = [p for p in team_players if p.get("formation_position") not in (None, "")]
    if len(starters) < 7:
        starters = sorted(
            team_players,
            key=lambda p: (
                _to_float(p.get("type_id"), default=999),
                _to_float(p.get("jersey_number"), default=999),
            ),
        )[:11]
    else:
        starters = sorted(starters, key=lambda p: _to_float(p.get("formation_position"), default=999))[:11]

    return starters


def _position_weight(player: dict) -> float:
    formation_position = _to_float(player.get("formation_position"), default=0)
    if formation_position > 0:
        if formation_position <= 1:
            base = 0.03
        elif formation_position <= 5:
            base = 0.07
        elif formation_position <= 8:
            base = 0.12
        else:
            base = 0.22
    else:
        base = 0.1

    jersey = int(_to_float(player.get("jersey_number"), default=0))
    if jersey in {7, 9, 10, 11}:
        base += 0.02

    return base


def goal_scorer_probabilities(payload: FixturePayload, team_id: int, lambda_team: float, top_n: int = 5) -> List[dict]:
    players = _lineup_candidates(payload, team_id)
    if not players:
        return []

    weights = [_position_weight(player) for player in players]
    total_weight = sum(weights)
    if total_weight <= 0:
        return []

    results = []
    for player, weight in zip(players, weights):
        share = weight / total_weight
        expected_goals = share * lambda_team
        prob_scores = 1.0 - math.exp(-expected_goals)
        results.append(
            {
                "player_id": player.get("player_id"),
                "player_name": player.get("player_name") or f"Oyuncu {player.get('player_id')}",
                "score_probability": prob_scores,
                "expected_goal_share": share,
            }
        )

    results.sort(key=lambda x: x["score_probability"], reverse=True)
    return results[:top_n]


def simulate_scorelines(lambda_home: float, lambda_away: float, runs: int = 10000, seed: int = 42):
    rng = np.random.default_rng(seed)
    home_goals = rng.poisson(lam=lambda_home, size=runs)
    away_goals = rng.poisson(lam=lambda_away, size=runs)
    scores = list(zip(home_goals, away_goals))
    return scores


def _poisson_prob_vector(lmbd: float, max_goals: int = MAX_ANALYTIC_GOALS) -> np.ndarray:
    lam = max(0.01, float(lmbd))
    goals = np.arange(max_goals + 1, dtype=float)
    factorial = np.array([math.factorial(int(g)) for g in goals], dtype=float)
    probs = np.exp(-lam) * np.power(lam, goals) / factorial
    missing_tail = max(0.0, 1.0 - float(probs.sum()))
    probs[-1] += missing_tail
    total = float(probs.sum())
    if total <= 0:
        probs = np.zeros(max_goals + 1, dtype=float)
        probs[0] = 1.0
        return probs
    return probs / total


def _dixon_coles_tau(home_goals: int, away_goals: int, lambda_home: float, lambda_away: float, rho: float) -> float:
    if home_goals == 0 and away_goals == 0:
        return max(0.01, 1.0 - (lambda_home * lambda_away * rho))
    if home_goals == 0 and away_goals == 1:
        return max(0.01, 1.0 + (lambda_home * rho))
    if home_goals == 1 and away_goals == 0:
        return max(0.01, 1.0 + (lambda_away * rho))
    if home_goals == 1 and away_goals == 1:
        return max(0.01, 1.0 - rho)
    return 1.0


def scoreline_probability_matrix(
    lambda_home: float,
    lambda_away: float,
    *,
    max_goals: int = MAX_ANALYTIC_GOALS,
    rho: float = DEFAULT_DIXON_COLES_RHO,
) -> np.ndarray:
    home = _poisson_prob_vector(lambda_home, max_goals=max_goals)
    away = _poisson_prob_vector(lambda_away, max_goals=max_goals)
    matrix = np.outer(home, away)

    dc_matrix = np.asarray(matrix, dtype=float).copy()
    for home_goal in (0, 1):
        for away_goal in (0, 1):
            tau = _dixon_coles_tau(home_goal, away_goal, lambda_home=lambda_home, lambda_away=lambda_away, rho=rho)
            dc_matrix[home_goal, away_goal] = dc_matrix[home_goal, away_goal] * tau

    total = float(dc_matrix.sum())
    if total <= 0:
        return matrix
    return dc_matrix / total


def outcome_probabilities_from_matrix(matrix: np.ndarray) -> dict:
    work = np.asarray(matrix, dtype=float)
    return {
        "home_win": float(np.tril(work, k=-1).sum()),
        "draw": float(np.trace(work)),
        "away_win": float(np.triu(work, k=1).sum()),
    }


def summarize_score_matrix(matrix: np.ndarray, top_n: int = 10) -> List[Dict[str, float]]:
    pairs: List[tuple[int, int, float]] = []
    for home_goals in range(matrix.shape[0]):
        for away_goals in range(matrix.shape[1]):
            pairs.append((home_goals, away_goals, float(matrix[home_goals, away_goals])))
    pairs.sort(key=lambda item: item[2], reverse=True)
    return [
        {"score": f"{home}-{away}", "probability": prob}
        for home, away, prob in pairs[: max(1, int(top_n))]
    ]


def goal_timing_model(lambda_home: float, lambda_away: float, runs: int, seed: int = 42):
    rng = np.random.default_rng(seed)
    total_goals = rng.poisson(lam=lambda_home + lambda_away, size=runs)
    timing_hist = np.zeros(91, dtype=int)
    first_goal_minutes = []
    for g in total_goals:
        if g == 0:
            continue
        minutes = rng.integers(low=1, high=91, size=g)
        minutes.sort()
        timing_hist[minutes] += 1
        first_goal_minutes.append(int(minutes[0]))
    return timing_hist.tolist(), first_goal_minutes


def summarize_scores(scores: List[Tuple[int, int]], top_n: int = 10):
    counter = Counter(scores)
    total = len(scores)
    most_common = counter.most_common(top_n)
    return [{"score": f"{h}-{a}", "probability": count / total} for (h, a), count in most_common]


def summarize_first_goal(first_goal_minutes: List[int]) -> List[Dict[str, float]]:
    if not first_goal_minutes:
        return []
    counter = Counter(first_goal_minutes)
    total = len(first_goal_minutes)
    return [{"minute": minute, "probability": count / total} for minute, count in counter.most_common(10)]


def outcome_probabilities(scores: List[Tuple[int, int]]):
    total = len(scores)
    home = sum(1 for h, a in scores if h > a) / total
    draw = sum(1 for h, a in scores if h == a) / total
    away = 1.0 - home - draw
    return {"home_win": home, "draw": draw, "away_win": away}


def _normalize_prob_vector(values: np.ndarray) -> np.ndarray:
    out = np.clip(np.asarray(values, dtype=float), 1e-9, 1.0)
    total = float(out.sum())
    if total <= 0:
        return np.array([1 / 3, 1 / 3, 1 / 3], dtype=float)
    return out / total


def _apply_probability_calibration(prob_vector: np.ndarray, calibration_payload: dict) -> np.ndarray:
    if not calibration_payload:
        return _normalize_prob_vector(prob_vector)

    out = np.asarray(prob_vector, dtype=float).copy()
    rows = calibration_payload.get("rows") or []
    if not isinstance(rows, list) or not rows:
        return _normalize_prob_vector(out)

    outcome_to_idx = {"home_win": 0, "draw": 1, "away_win": 2}
    for row_idx, row in enumerate(rows):
        if not isinstance(row, dict) or not bool(row.get("enabled")):
            continue
        idx = outcome_to_idx.get(str(row.get("outcome") or "").strip())
        if idx is None and row_idx < 3:
            idx = row_idx
        if idx is None:
            continue
        coef = float(row.get("coef") or 1.0)
        intercept = float(row.get("intercept") or 0.0)
        logit = (coef * out[idx]) + intercept
        out[idx] = 1.0 / (1.0 + math.exp(-logit))

    return _normalize_prob_vector(out)


def _extract_market_prob_vector(features: dict) -> Optional[np.ndarray]:
    row = []
    for col in ("market_prob_home", "market_prob_draw", "market_prob_away"):
        value = features.get(col)
        if value is None or _is_nan(value):
            return None
        row.append(float(value))
    row_array = np.asarray(row, dtype=float)
    total = float(row_array.sum())
    if total <= 0:
        return None
    if np.any(row_array < 0):
        return None
    return _normalize_prob_vector(row_array)


def _blend_with_market_odds(
    model_probs: np.ndarray,
    market_probs: Optional[np.ndarray],
    odds_blend_meta: dict,
) -> tuple[np.ndarray, dict]:
    model_probs = _normalize_prob_vector(model_probs)
    enabled = bool(odds_blend_meta.get("enabled"))
    weight_model = float(odds_blend_meta.get("weight_model") or 1.0)
    weight_model = float(max(0.0, min(1.0, weight_model)))
    weight_market = float(1.0 - weight_model)
    used_market_odds = False

    if enabled and market_probs is not None:
        mixed = (weight_model * model_probs) + (weight_market * market_probs)
        model_probs = _normalize_prob_vector(mixed)
        used_market_odds = bool(weight_market > 0.0)

    return model_probs, {
        "enabled": enabled,
        "used_market_odds": used_market_odds,
        "weight_model": weight_model,
        "weight_market": weight_market,
        "market_probabilities": {
            "home_win": float(market_probs[0]) if market_probs is not None else None,
            "draw": float(market_probs[1]) if market_probs is not None else None,
            "away_win": float(market_probs[2]) if market_probs is not None else None,
        },
    }


def _dynamic_monte_carlo_runs(settings: Settings, total_lambda: float) -> int:
    configured_min = max(300, int(getattr(settings, "simulate_min_monte_carlo_runs", 1500)))
    configured_max = max(configured_min, int(getattr(settings, "simulate_max_monte_carlo_runs", settings.monte_carlo_runs)))
    ratio = max(0.0, min(1.0, (float(total_lambda) - 1.0) / 4.0))
    runs = int(configured_min + ((configured_max - configured_min) * ratio))
    return max(configured_min, min(configured_max, runs))


def _missing_key_features(features: dict) -> list[str]:
    missing: list[str] = []
    for col in KEY_FEATURE_COLUMNS:
        value = features.get(col)
        if value is None or _is_nan(value):
            missing.append(col)
    return missing


def _model_age_days(trained_at_value: Optional[str]) -> Optional[float]:
    if not trained_at_value:
        return None
    try:
        trained_at = datetime.fromisoformat(str(trained_at_value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if trained_at.tzinfo is None:
        trained_at = trained_at.replace(tzinfo=timezone.utc)
    now_utc = datetime.now(timezone.utc)
    delta = now_utc - trained_at.astimezone(timezone.utc)
    return max(0.0, round(delta.total_seconds() / 86400.0, 3))


def key_drivers(payload: FixturePayload, used_history_form: bool, *, odds_blend_used: bool = False) -> List[str]:
    messages = []
    data = payload.data
    messages.append("Pre-match rolling form and ELO strength signals are included.")
    if used_history_form:
        messages.append("Historical team form backfilled missing pre-match context.")
    if data.trends:
        messages.append("Recent form trends included.")
    if data.lineups:
        messages.append("Lineups parsed for expected XI strength and goal-scorer likelihood.")
    if data.sidelined:
        messages.append("Injury/suspension data applied to downgrade strength.")
    if data.referees:
        messages.append("Referee card/penalty tendencies considered.")
    if data.weatherreport:
        messages.append("Weather factors (temperature, wind, humidity) considered.")
    if odds_blend_used:
        messages.append("SportMonks market odds blended with model probabilities.")
    if not messages:
        messages.append("Using baseline shot/possession metrics as key drivers.")
    return messages


def simulate_fixture(fixture_id: int, settings: Optional[Settings] = None, model_id: Optional[str] = None):
    settings = settings or get_settings()
    client = SportMonksClient(
        api_token=settings.sportmonks_api_token,
        dummy_mode=settings.dummy_mode,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        cache_ttl=settings.cache_ttl_seconds,
    )
    payload = client.get_fixture(fixture_id)
    fixture_league_id = getattr(payload.data, "league_id", None)
    resolved_model = resolve_model_for_league(
        settings,
        league_id=int(fixture_league_id) if fixture_league_id is not None else None,
        requested_model_id=model_id,
        routing_key=int(fixture_id),
    )
    resolved_model_id = str(resolved_model.get("model_id") or "").strip() or None

    lambda_home_model, lambda_away_model, model_meta = _load_models_cached(model_id=resolved_model_id, settings=settings)

    feats = _build_feature_vector_cached(payload, settings)
    used_history_form = _inject_historical_form(feats, payload, settings)
    missing_key_features = _missing_key_features(feats)

    model_feature_columns = list(model_meta.get("feature_columns") or FEATURE_COLUMNS)
    X = np.array([[0.0 if feats.get(col) is None else float(feats.get(col)) for col in model_feature_columns]])

    lambda_calibration = model_meta.get("lambda_calibration") or {}
    home_scale = _to_float(lambda_calibration.get("home_scale"), default=1.0)
    away_scale = _to_float(lambda_calibration.get("away_scale"), default=1.0)
    if home_scale <= 0:
        home_scale = 1.0
    if away_scale <= 0:
        away_scale = 1.0

    lambda_home_raw = float(lambda_home_model.predict(X)[0]) * float(home_scale)
    lambda_away_raw = float(lambda_away_model.predict(X)[0]) * float(away_scale)
    lambda_home = max(0.05, min(6.5, lambda_home_raw))
    lambda_away = max(0.05, min(6.5, lambda_away_raw))

    score_matrix = scoreline_probability_matrix(
        lambda_home=lambda_home,
        lambda_away=lambda_away,
        max_goals=int(model_meta.get("score_matrix_max_goals") or MAX_ANALYTIC_GOALS),
        rho=float(model_meta.get("dixon_coles_rho") or DEFAULT_DIXON_COLES_RHO),
    )
    raw_outcomes = outcome_probabilities_from_matrix(score_matrix)
    raw_prob_vector = np.array([raw_outcomes["home_win"], raw_outcomes["draw"], raw_outcomes["away_win"]], dtype=float)

    probability_calibration = model_meta.get("probability_calibration") or {}
    calibrated_probs = _apply_probability_calibration(raw_prob_vector, probability_calibration)

    market_probs = _extract_market_prob_vector(feats)
    blended_probs, odds_blend_info = _blend_with_market_odds(
        calibrated_probs,
        market_probs=market_probs,
        odds_blend_meta=model_meta.get("odds_blend") or {},
    )
    outcomes = {
        "home_win": float(blended_probs[0]),
        "draw": float(blended_probs[1]),
        "away_win": float(blended_probs[2]),
    }

    runs = _dynamic_monte_carlo_runs(settings, total_lambda=lambda_home + lambda_away)
    timing_hist, first_goal_minutes = goal_timing_model(lambda_home, lambda_away, runs=runs)

    home, away = _get_fixture_teams(payload)
    home_scorers = goal_scorer_probabilities(payload, home.id, lambda_home)
    away_scorers = goal_scorer_probabilities(payload, away.id, lambda_away)

    model_age_days = _model_age_days(str(resolved_model.get("trained_at") or model_meta.get("trained_at") or ""))
    quality_flags = {
        "used_global_fallback": str(resolved_model.get("selection_mode") or "") == "global_fallback",
        "missing_key_features": missing_key_features,
        "model_age_days": model_age_days,
    }

    result = {
        "fixture_id": fixture_id,
        "match": {
            "home_team_id": home.id,
            "away_team_id": away.id,
            "home_team_name": home.name,
            "home_team_logo": _participant_logo(home),
            "away_team_name": away.name,
            "away_team_logo": _participant_logo(away),
            "starting_at": payload.data.starting_at,
            "league_id": fixture_league_id,
        },
        "model": {
            "model_id": resolved_model.get("model_id") or model_meta.get("model_id"),
            "model_name": resolved_model.get("model_name") or model_meta.get("model_name"),
            "model_version": resolved_model.get("model_version") or model_meta.get("model_version"),
            "trained_at": resolved_model.get("trained_at") or model_meta.get("trained_at"),
            "selection_mode": resolved_model.get("selection_mode"),
            "feature_columns": model_feature_columns,
            "lambda_calibration": lambda_calibration,
            "probability_calibration": probability_calibration,
            "odds_blend": model_meta.get("odds_blend"),
        },
        "lambda_home": lambda_home,
        "lambda_away": lambda_away,
        "outcomes": outcomes,
        "top_scorelines": summarize_score_matrix(score_matrix),
        "goal_timing_hist": timing_hist,
        "first_goal_minute_distribution": summarize_first_goal(first_goal_minutes),
        "goal_scorer_predictions": {
            "home_team": home_scorers,
            "away_team": away_scorers,
        },
        "calibration": {
            "version": model_meta.get("model_version") or resolved_model.get("model_version"),
            "lambda": {
                "method": "mean_scale",
                "home_scale": float(home_scale),
                "away_scale": float(away_scale),
            },
            "probability": {
                "method": str(probability_calibration.get("method") or "none"),
                "applied": bool(probability_calibration),
            },
        },
        "odds_blend": odds_blend_info,
        "quality_flags": quality_flags,
        "performance": {
            "simulation_runs": int(runs),
            "outcome_mode": "analytic_poisson_dixon_coles",
            "timing_mode": "monte_carlo_dynamic",
        },
        "key_drivers": key_drivers(
            payload,
            used_history_form,
            odds_blend_used=bool(odds_blend_info.get("used_market_odds")),
        ),
    }
    return result
