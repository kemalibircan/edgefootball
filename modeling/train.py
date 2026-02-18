from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

import joblib
import numpy as np
import pandas as pd
from loguru import logger
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import TimeSeriesSplit
from sqlalchemy import create_engine, text

from app.config import Settings, get_settings
from data.features import FEATURE_PATH
from modeling.metrics import regression_metrics
from modeling.registry import MODEL_STORE_DIR, register_model

DEFAULT_SUPERLIG_LEAGUE_ID = 600

try:
    from lightgbm import LGBMRegressor
except ImportError:  # pragma: no cover
    LGBMRegressor = None

try:
    from catboost import CatBoostRegressor
except ImportError:  # pragma: no cover
    CatBoostRegressor = None

ARTIFACT_DIR = Path("artifacts")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

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

FORM_FEATURE_COLUMNS = [col for col in FEATURE_COLUMNS if col.startswith("form_")]

LIVE_STATS_COLUMNS = [
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
]

ELO_COLUMNS = ["elo_home_pre", "elo_away_pre", "elo_diff"]
REFEREE_COLUMNS = ["referee_yellow_cards", "referee_penalties"]
WEATHER_COLUMNS = ["weather_temp", "weather_wind", "weather_humidity"]
TEAM_INFO_COLUMNS = ["home_team_id", "away_team_id"]
INJURY_COLUMNS = ["injury_count_home", "injury_count_away", "suspension_count_home", "suspension_count_away"]
LINEUP_COLUMNS = ["lineup_known_home", "lineup_known_away", "starter_count_home", "starter_count_away"]
MARKET_ODDS_COLUMNS = ["market_prob_home", "market_prob_draw", "market_prob_away"]

DATA_SOURCE_CATALOG: Dict[str, Dict[str, Any]] = {
    "team_info": {
        "label": "Team IDs and team context",
        "description": "Home/Away team identity features.",
        "columns": TEAM_INFO_COLUMNS,
    },
    "team_form": {
        "label": "Pre-match team form",
        "description": "Rolling pre-match performance and strength deltas from previous fixtures.",
        "columns": FORM_FEATURE_COLUMNS,
    },
    "elo": {
        "label": "ELO strength",
        "description": "League-relative team strength estimate before kickoff.",
        "columns": ELO_COLUMNS,
    },
    "live_match_stats": {
        "label": "Live/instant stats",
        "description": "Match-time stats. Excluded by default with leakage guard.",
        "columns": LIVE_STATS_COLUMNS,
    },
    "weather": {
        "label": "Weather",
        "description": "Temperature, wind, humidity.",
        "columns": WEATHER_COLUMNS,
    },
    "referee": {
        "label": "Referee profile",
        "description": "Cards and penalties tendency.",
        "columns": REFEREE_COLUMNS,
    },
    "injuries": {
        "label": "Injuries and suspensions",
        "description": "Sidelined counts for injuries and suspensions.",
        "columns": INJURY_COLUMNS,
    },
    "lineup_strength": {
        "label": "Lineup strength",
        "description": "Known lineups and expected starter counts.",
        "columns": LINEUP_COLUMNS,
    },
    "market_odds": {
        "label": "Market odds probabilities",
        "description": "Pre-match implied probabilities from SportMonks odds.",
        "columns": MARKET_ODDS_COLUMNS,
    },
    "ball_coordinates": {
        "label": "Ball coordinates and territory style",
        "description": "Declared source. Numeric training features are not engineered yet.",
        "columns": [],
    },
}

DEFAULT_DATA_SOURCES = ["team_form", "elo", "injuries", "lineup_strength", "weather", "referee"]

LABEL_COLS = ["label_home_goals", "label_away_goals"]
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



def get_data_source_catalog() -> List[dict]:
    items = []
    for key, payload in DATA_SOURCE_CATALOG.items():
        items.append(
            {
                "key": key,
                "label": payload["label"],
                "description": payload["description"],
                "columns": list(payload["columns"]),
            }
        )
    return items



def _normalize_sources(data_sources: Optional[List[str]]) -> List[str]:
    if not data_sources:
        return list(DEFAULT_DATA_SOURCES)
    seen = set()
    normalized: List[str] = []
    for item in data_sources:
        key = str(item).strip()
        if key in DATA_SOURCE_CATALOG and key not in seen:
            seen.add(key)
            normalized.append(key)
    if not normalized:
        return list(DEFAULT_DATA_SOURCES)
    return normalized



def _apply_leakage_guard(selected_sources: List[str], settings: Settings) -> tuple[List[str], bool]:
    leakage_guard_active = True
    if settings.training_enable_live_stats_by_default:
        return list(selected_sources), False

    guarded_sources = [source for source in selected_sources if source != "live_match_stats"]
    if not guarded_sources:
        # Keep at least one usable default source if user only selected live stats.
        guarded_sources = [source for source in DEFAULT_DATA_SOURCES if source in DATA_SOURCE_CATALOG]
    return guarded_sources, leakage_guard_active



def _resolve_feature_columns(df: pd.DataFrame, selected_sources: List[str]) -> List[str]:
    selected_columns: List[str] = []
    for source in selected_sources:
        for col in DATA_SOURCE_CATALOG[source]["columns"]:
            if col in df.columns and col not in selected_columns:
                selected_columns.append(col)

    if not selected_columns:
        raise ValueError("No usable feature columns found for selected data sources.")
    return selected_columns



def _validate_schema_freshness(df: pd.DataFrame, selected_sources: List[str]) -> None:
    frame_columns = set(df.columns)
    missing_sources: list[str] = []
    for source in selected_sources:
        declared = list(DATA_SOURCE_CATALOG[source]["columns"])
        if not declared:
            continue
        available = [col for col in declared if col in frame_columns]
        if not available:
            missing_sources.append(source)

    if missing_sources:
        raise ValueError(
            "Schema freshness guard: selected sources missing all declared columns -> "
            + ", ".join(missing_sources)
        )



def _build_data_source_report(
    selected_sources: List[str],
    feature_columns: List[str],
    frame_columns: List[str],
) -> List[dict]:
    report: List[dict] = []
    frame_column_set = set(frame_columns)
    feature_column_set = set(feature_columns)
    selected_set = set(selected_sources)

    for key, payload in DATA_SOURCE_CATALOG.items():
        declared_cols = list(payload["columns"])
        available_cols = [col for col in declared_cols if col in frame_column_set]
        used_cols = [col for col in declared_cols if col in feature_column_set]
        selected = key in selected_set

        if not selected:
            status = "not_selected"
            note = "Source is available but not selected for this model."
        elif used_cols:
            status = "used_in_training"
            note = "Selected source contributed columns to model training."
        elif declared_cols:
            status = "selected_but_missing_columns"
            note = "Selected source has no available columns in the current feature frame."
        else:
            status = "selected_but_not_yet_engineered"
            note = "Selected source is tracked but numeric feature engineering is pending."

        report.append(
            {
                "key": key,
                "label": payload["label"],
                "description": payload["description"],
                "selected": selected,
                "status": status,
                "declared_columns": declared_cols,
                "available_columns": available_cols,
                "used_columns": used_cols,
                "note": note,
            }
        )

    return report



def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return slug or "model"



def _build_model_identity(model_name: Optional[str]) -> Dict[str, str]:
    trained_at = datetime.now(timezone.utc)
    timestamp = trained_at.strftime("%Y%m%d%H%M%S")
    normalized_name = (model_name or "").strip() or f"SuperLig Model {timestamp}"
    model_id = f"{_slugify(normalized_name)}-{timestamp}-{uuid4().hex[:6]}"
    version = trained_at.strftime("v%Y.%m.%d.%H%M%S")
    return {
        "model_id": model_id,
        "model_name": normalized_name,
        "model_version": version,
        "trained_at": trained_at.isoformat(),
    }



def _time_aware_split_indices(
    frame: pd.DataFrame,
    event_dates: Optional[pd.Series] = None,
) -> tuple[pd.Index, pd.Index]:
    if frame.empty:
        raise ValueError("Training frame is empty.")
    ordered_idx = frame.index
    if event_dates is not None and not event_dates.dropna().empty:
        normalized_dates = pd.to_datetime(event_dates, errors="coerce", utc=True)
        ordered_idx = normalized_dates.fillna(pd.Timestamp("1970-01-01T00:00:00+00:00")).sort_values().index
    cut = max(1, int(len(ordered_idx) * 0.8))
    if cut >= len(ordered_idx):
        cut = len(ordered_idx) - 1
    return ordered_idx[:cut], ordered_idx[cut:]



def _sort_training_frame_by_recency(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    if "event_date" in df.columns:
        event_dates = pd.to_datetime(df["event_date"], errors="coerce", utc=True)
        if "fixture_id" in df.columns:
            fixture_ids = pd.to_numeric(df["fixture_id"], errors="coerce")
            return (
                df.assign(_event_date_sort=event_dates, _fixture_id_sort=fixture_ids)
                .sort_values(
                    ["_event_date_sort", "_fixture_id_sort"],
                    ascending=[False, False],
                    na_position="last",
                    kind="mergesort",
                )
                .drop(columns=["_event_date_sort", "_fixture_id_sort"], errors="ignore")
            )
        return (
            df.assign(_event_date_sort=event_dates)
            .sort_values("_event_date_sort", ascending=False, na_position="last", kind="mergesort")
            .drop(columns=["_event_date_sort"], errors="ignore")
        )

    if "fixture_id" in df.columns:
        fixture_ids = pd.to_numeric(df["fixture_id"], errors="coerce")
        return (
            df.assign(_fixture_id_sort=fixture_ids)
            .sort_values("_fixture_id_sort", ascending=False, na_position="last", kind="mergesort")
            .drop(columns=["_fixture_id_sort"], errors="ignore")
        )

    return df



def _limit_recent_completed_rows(df: pd.DataFrame, limit: int) -> pd.DataFrame:
    limited = df.copy()

    if "event_date" in limited.columns:
        event_dates = pd.to_datetime(limited["event_date"], errors="coerce", utc=True)
        today_utc = datetime.now(timezone.utc).date()
        limited = limited.loc[event_dates.notna() & (event_dates.dt.date <= today_utc)].copy()

    if set(LABEL_COLS).issubset(limited.columns):
        limited = limited.dropna(subset=LABEL_COLS).copy()

    limited = _sort_training_frame_by_recency(limited)
    if len(limited) < int(limit):
        logger.warning(
            "Requested {} rows for training limit but only {} completed rows are available.",
            limit,
            len(limited),
        )
    return limited.head(int(limit))



def _read_training_frame_from_db(settings: Settings) -> pd.DataFrame:
    query = text(
        """
        SELECT fixture_id, home_team_id, away_team_id, feature_vector, label_home_goals, label_away_goals, event_date
        FROM features
        ORDER BY event_date DESC NULLS LAST, fixture_id DESC
        """
    )
    engine = create_engine(settings.db_url)
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    records: list[dict[str, Any]] = []
    for row in rows:
        fv = dict(row.get("feature_vector") or {})
        fv.setdefault("fixture_id", row.get("fixture_id"))
        fv.setdefault("home_team_id", row.get("home_team_id"))
        fv.setdefault("away_team_id", row.get("away_team_id"))
        fv["event_date"] = row.get("event_date")
        fv["label_home_goals"] = row.get("label_home_goals")
        fv["label_away_goals"] = row.get("label_away_goals")
        records.append(fv)

    return pd.DataFrame(records)



def load_training_frame(
    limit: Optional[int] = None,
    league_id: Optional[int] = None,
    training_date_from: Optional[date] = None,
    training_date_to: Optional[date] = None,
    training_mode: Optional[str] = None,
    selected_sources: Optional[List[str]] = None,
    allow_synthetic_fallback: bool = False,
) -> pd.DataFrame:
    settings = get_settings()
    normalized_training_mode = str(training_mode or "standard").strip().lower()

    try:
        df = _read_training_frame_from_db(settings)
    except Exception as exc:
        if allow_synthetic_fallback:
            logger.warning("DB read failed for training frame; synthetic fallback is enabled: {}", exc)
            df = synthetic_training_data()
        else:
            raise RuntimeError(
                "Failed to load training frame from DB features table. "
                "Run ingest/build-features and verify DB connectivity."
            ) from exc

    if df.empty:
        if allow_synthetic_fallback:
            logger.warning("Feature table is empty; synthetic fallback is enabled")
            df = synthetic_training_data()
        else:
            raise FileNotFoundError("No feature rows found in DB. Build features before training.")

    if league_id is not None and "league_id" in df.columns:
        league_series = pd.to_numeric(df["league_id"], errors="coerce")
        df = df.loc[league_series == float(league_id)].copy()
        logger.info("Filtered training frame to league {} -> {} rows", league_id, len(df))
    if training_date_from or training_date_to:
        if "event_date" not in df.columns:
            raise ValueError("Date-range training requires event_date column in training dataset.")

        event_dates = pd.to_datetime(df["event_date"], errors="coerce", utc=True)
        mask = event_dates.notna()
        if training_date_from is not None:
            mask = mask & (event_dates.dt.date >= training_date_from)
        if training_date_to is not None:
            mask = mask & (event_dates.dt.date <= training_date_to)
        df = df.loc[mask].copy()
        logger.info(
            "Filtered training frame by date range {} - {} -> {} rows",
            training_date_from,
            training_date_to,
            len(df),
        )
    if normalized_training_mode == "latest":
        if "event_date" in df.columns:
            event_dates = pd.to_datetime(df["event_date"], errors="coerce", utc=True)
            today_utc = datetime.now(timezone.utc).date()
            played_mask = event_dates.notna() & (event_dates.dt.date <= today_utc)
            df = df.loc[played_mask].copy()
        if set(LABEL_COLS).issubset(df.columns):
            df = df.dropna(subset=LABEL_COLS).copy()
    df = _sort_training_frame_by_recency(df)
    if limit is not None:
        safe_limit = int(limit)
        if safe_limit <= 0:
            raise ValueError("Training limit must be greater than zero.")
        df = _limit_recent_completed_rows(df, safe_limit)
    if not set(LABEL_COLS).issubset(df.columns):
        if allow_synthetic_fallback:
            logger.warning("Label columns missing in dataset; synthetic labels will be generated for fallback mode")
            rng = np.random.default_rng(42)
            df["label_home_goals"] = rng.poisson(lam=1.4, size=len(df))
            df["label_away_goals"] = rng.poisson(lam=1.0, size=len(df))
        else:
            raise ValueError("Label columns missing in feature dataset. Rebuild features before training.")

    effective_sources = _normalize_sources(selected_sources)
    _validate_schema_freshness(df, effective_sources)
    return df



def synthetic_training_data(n: int = 200) -> pd.DataFrame:
    rng = np.random.default_rng(123)
    data = {
        "fixture_id": np.arange(n),
        "league_id": np.repeat(600, n),
        "home_team_id": rng.integers(1, 50, n),
        "away_team_id": rng.integers(1, 50, n),
        "form_matches_home": rng.integers(2, 9, n),
        "form_matches_away": rng.integers(2, 9, n),
        "form_goals_for_home": rng.normal(1.5, 0.4, n),
        "form_goals_for_away": rng.normal(1.2, 0.4, n),
        "form_goals_against_home": rng.normal(1.1, 0.4, n),
        "form_goals_against_away": rng.normal(1.3, 0.4, n),
        "form_goal_balance_home": rng.normal(0.3, 0.5, n),
        "form_goal_balance_away": rng.normal(-0.2, 0.5, n),
        "form_points_home": rng.normal(1.7, 0.5, n),
        "form_points_away": rng.normal(1.2, 0.5, n),
        "form_shots_home": rng.normal(12, 3, n),
        "form_shots_away": rng.normal(10, 3, n),
        "form_shots_on_target_home": rng.normal(5, 1.8, n),
        "form_shots_on_target_away": rng.normal(4, 1.5, n),
        "form_possession_home": rng.normal(52, 6, n),
        "form_possession_away": rng.normal(48, 6, n),
        "form_dangerous_attacks_home": rng.normal(36, 7, n),
        "form_dangerous_attacks_away": rng.normal(31, 7, n),
        "form_points_diff": rng.normal(0.5, 0.9, n),
        "form_goal_balance_diff": rng.normal(0.4, 0.8, n),
        "form_shots_on_target_diff": rng.normal(0.7, 1.1, n),
        "form_possession_diff": rng.normal(2.0, 4.0, n),
        "form_dangerous_attacks_diff": rng.normal(4.0, 6.0, n),
        "elo_home_pre": rng.normal(1515, 40, n),
        "elo_away_pre": rng.normal(1485, 40, n),
        "elo_diff": rng.normal(30, 55, n),
        "weather_temp": rng.normal(18, 5, n),
        "weather_wind": rng.normal(10, 3, n),
        "weather_humidity": rng.normal(60, 10, n),
        "referee_yellow_cards": rng.normal(4, 0.5, n),
        "referee_penalties": rng.normal(0.2, 0.05, n),
        "injury_count_home": rng.poisson(1.0, n),
        "injury_count_away": rng.poisson(1.0, n),
        "suspension_count_home": rng.poisson(0.3, n),
        "suspension_count_away": rng.poisson(0.3, n),
        "lineup_known_home": rng.binomial(1, 0.4, n),
        "lineup_known_away": rng.binomial(1, 0.4, n),
        "starter_count_home": rng.normal(9, 2, n),
        "starter_count_away": rng.normal(9, 2, n),
        "market_prob_home": rng.uniform(0.25, 0.6, n),
        "market_prob_draw": rng.uniform(0.15, 0.35, n),
    }
    df = pd.DataFrame(data)
    df["market_prob_away"] = 1.0 - df["market_prob_home"] - df["market_prob_draw"]
    df["label_home_goals"] = rng.poisson(1.5, n)
    df["label_away_goals"] = rng.poisson(1.1, n)
    df["event_date"] = pd.date_range(end=datetime.now(timezone.utc), periods=n, freq="D")
    return df



def _candidate_regressors() -> list[tuple[str, object]]:
    candidates: list[tuple[str, object]] = []
    if CatBoostRegressor is not None:
        candidates.append(
            (
                "CatBoost(depth=6,lr=0.05,iter=700)",
                CatBoostRegressor(
                    depth=6,
                    learning_rate=0.05,
                    iterations=700,
                    l2_leaf_reg=4.0,
                    loss_function="RMSE",
                    random_seed=42,
                    verbose=False,
                    allow_writing_files=False,
                ),
            )
        )
        candidates.append(
            (
                "CatBoost(depth=8,lr=0.04,iter=900)",
                CatBoostRegressor(
                    depth=8,
                    learning_rate=0.04,
                    iterations=900,
                    l2_leaf_reg=5.0,
                    loss_function="RMSE",
                    random_seed=42,
                    verbose=False,
                    allow_writing_files=False,
                ),
            )
        )
    if LGBMRegressor is not None:
        candidates.append(
            (
                "LightGBM(leaves=31,est=450)",
                LGBMRegressor(
                    num_leaves=31,
                    learning_rate=0.04,
                    n_estimators=450,
                    min_child_samples=20,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    force_col_wise=True,
                    verbosity=-1,
                    random_state=42,
                ),
            )
        )
        candidates.append(
            (
                "LightGBM(leaves=63,est=600)",
                LGBMRegressor(
                    num_leaves=63,
                    learning_rate=0.03,
                    n_estimators=600,
                    min_child_samples=18,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    force_col_wise=True,
                    verbosity=-1,
                    random_state=42,
                ),
            )
        )

    candidates.append(
        (
            "HistGB(depth=6,lr=0.05)",
            HistGradientBoostingRegressor(
                max_depth=6,
                learning_rate=0.05,
                max_iter=500,
                min_samples_leaf=20,
                random_state=42,
            ),
        )
    )
    candidates.append(
        (
            "HistGB(depth=8,lr=0.04)",
            HistGradientBoostingRegressor(
                max_depth=8,
                learning_rate=0.04,
                max_iter=650,
                min_samples_leaf=18,
                random_state=42,
            ),
        )
    )
    return candidates



def _model_prototype_by_name(model_name: str) -> Optional[object]:
    for name, model in _candidate_regressors():
        if name == model_name:
            return model
    return None



def _clone_model(model: object) -> object:
    return copy.deepcopy(model)



def _clip_lambda_predictions(y_pred: np.ndarray) -> np.ndarray:
    return np.clip(np.asarray(y_pred, dtype=float), 0.05, 6.5)



def _calibrate_lambda_predictions(y_true: pd.Series, y_pred: np.ndarray) -> tuple[np.ndarray, float]:
    clipped = _clip_lambda_predictions(y_pred)
    pred_mean = float(np.mean(clipped))
    true_mean = float(np.mean(y_true))
    if pred_mean <= 1e-9:
        return clipped, 1.0
    scale = true_mean / pred_mean
    scaled = _clip_lambda_predictions(clipped * scale)
    return scaled, float(scale)



def _poisson_prob_vector(lmbd: float, max_goals: int = 10) -> np.ndarray:
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



def _outcome_probs_from_lambdas(lambda_home: float, lambda_away: float, max_goals: int = 10) -> dict:
    home = _poisson_prob_vector(lambda_home, max_goals=max_goals)
    away = _poisson_prob_vector(lambda_away, max_goals=max_goals)
    matrix = np.outer(home, away)
    return {
        "home_win": float(np.tril(matrix, k=-1).sum()),
        "draw": float(np.trace(matrix)),
        "away_win": float(np.triu(matrix, k=1).sum()),
    }



def _outcome_from_labels(home_goals: float, away_goals: float) -> str:
    if home_goals > away_goals:
        return "home_win"
    if home_goals < away_goals:
        return "away_win"
    return "draw"



def _prob_matrix_from_lambdas(pred_home: np.ndarray, pred_away: np.ndarray) -> np.ndarray:
    out = []
    for home_val, away_val in zip(pred_home, pred_away):
        probs = _outcome_probs_from_lambdas(float(home_val), float(away_val), max_goals=10)
        out.append([float(probs["home_win"]), float(probs["draw"]), float(probs["away_win"])])
    return np.asarray(out, dtype=float)



def _evaluate_outcome_predictions(
    y_home: pd.Series,
    y_away: pd.Series,
    pred_home: np.ndarray,
    pred_away: np.ndarray,
) -> dict:
    probs = _prob_matrix_from_lambdas(pred_home, pred_away)
    return _evaluate_outcome_probability_matrix(y_home=y_home, y_away=y_away, prob_matrix=probs)



def _evaluate_outcome_probability_matrix(
    y_home: pd.Series,
    y_away: pd.Series,
    prob_matrix: np.ndarray,
) -> dict:
    total = len(y_home)
    if total == 0:
        return {"samples": 0, "accuracy": None, "brier": None, "log_loss": None}

    correct = 0
    brier_sum = 0.0
    log_loss_sum = 0.0

    for idx, (home_true, away_true) in enumerate(zip(y_home, y_away)):
        actual = _outcome_from_labels(float(home_true), float(away_true))
        probs = prob_matrix[idx]
        probs = np.clip(np.asarray(probs, dtype=float), 1e-9, 1.0)
        probs = probs / float(probs.sum())

        predicted = ("home_win", "draw", "away_win")[int(np.argmax(probs))]
        if predicted == actual:
            correct += 1

        targets = np.array(
            [1.0 if actual == "home_win" else 0.0, 1.0 if actual == "draw" else 0.0, 1.0 if actual == "away_win" else 0.0],
            dtype=float,
        )
        brier_sum += float(np.mean((probs - targets) ** 2))

        actual_idx = 0 if actual == "home_win" else (1 if actual == "draw" else 2)
        log_loss_sum += -math.log(float(probs[actual_idx]))

    return {
        "samples": int(total),
        "accuracy": float(correct / total),
        "brier": float(brier_sum / total),
        "log_loss": float(log_loss_sum / total),
    }



def _fit_candidate_models(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    label: str,
) -> list[dict]:
    if len(X_train) < 20 or len(X_val) < 5:
        raise ValueError(f"Not enough data for {label}. train={len(X_train)} val={len(X_val)}")

    candidates: list[dict] = []
    for model_name, model in _candidate_regressors():
        try:
            fitted_model = _clone_model(model)
            fitted_model.fit(X_train, y_train)
            y_pred = _clip_lambda_predictions(fitted_model.predict(X_val))
            mae, rmse = regression_metrics(y_val, y_pred)
            row = {
                "model_name": model_name,
                "model": fitted_model,
                "val_pred": y_pred,
                "mae": float(mae),
                "rmse": float(rmse),
            }
            candidates.append(row)
            logger.info(
                "Candidate {} for {} | MAE {:.3f} RMSE {:.3f}",
                model_name,
                label,
                mae,
                rmse,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("Candidate {} failed for {}: {}", model_name, label, exc)

    if not candidates:
        raise RuntimeError(f"No model could be trained for {label}")

    return candidates



def _select_best_pair_by_outcome_logloss(
    home_candidates: list[dict],
    away_candidates: list[dict],
    y_home_val: pd.Series,
    y_away_val: pd.Series,
) -> dict:
    home_by_name = {item["model_name"]: item for item in home_candidates}
    away_by_name = {item["model_name"]: item for item in away_candidates}
    common_names = [name for name in home_by_name.keys() if name in away_by_name]
    if not common_names:
        # Fallback if candidate sets diverged due optional deps.
        home_best = min(home_candidates, key=lambda item: float(item["rmse"]))
        away_best = min(away_candidates, key=lambda item: float(item["rmse"]))
        home_pred_scaled, home_scale = _calibrate_lambda_predictions(y_home_val, home_best["val_pred"])
        away_pred_scaled, away_scale = _calibrate_lambda_predictions(y_away_val, away_best["val_pred"])
        metrics = _evaluate_outcome_predictions(y_home_val, y_away_val, home_pred_scaled, away_pred_scaled)
        return {
            "selected_home": home_best,
            "selected_away": away_best,
            "home_scale": home_scale,
            "away_scale": away_scale,
            "pair_report": [
                {
                    "home_model": home_best["model_name"],
                    "away_model": away_best["model_name"],
                    "outcome_metrics": metrics,
                }
            ],
        }

    pair_report: list[dict] = []
    selected_row: Optional[dict] = None
    for name in common_names:
        home_item = home_by_name[name]
        away_item = away_by_name[name]
        home_pred_scaled, home_scale = _calibrate_lambda_predictions(y_home_val, home_item["val_pred"])
        away_pred_scaled, away_scale = _calibrate_lambda_predictions(y_away_val, away_item["val_pred"])
        outcome_metrics = _evaluate_outcome_predictions(
            y_home=y_home_val,
            y_away=y_away_val,
            pred_home=home_pred_scaled,
            pred_away=away_pred_scaled,
        )
        row = {
            "home_model": name,
            "away_model": name,
            "home_scale": float(home_scale),
            "away_scale": float(away_scale),
            "outcome_metrics": outcome_metrics,
            "home_rmse": float(home_item["rmse"]),
            "away_rmse": float(away_item["rmse"]),
        }
        pair_report.append(row)

        if selected_row is None:
            selected_row = row
            continue
        current = selected_row["outcome_metrics"]
        candidate = row["outcome_metrics"]
        current_key = (float(current.get("log_loss") or 9e9), float(current.get("brier") or 9e9), float(row["home_rmse"] + row["away_rmse"]))
        selected_key = (
            float(candidate.get("log_loss") or 9e9),
            float(candidate.get("brier") or 9e9),
            float(row["home_rmse"] + row["away_rmse"]),
        )
        if selected_key < current_key:
            selected_row = row

    assert selected_row is not None
    selected_name = str(selected_row["home_model"])

    return {
        "selected_home": home_by_name[selected_name],
        "selected_away": away_by_name[selected_name],
        "home_scale": float(selected_row["home_scale"]),
        "away_scale": float(selected_row["away_scale"]),
        "pair_report": pair_report,
        "selected_model_name": selected_name,
    }



def _fit_probability_calibration(
    y_home: pd.Series,
    y_away: pd.Series,
    raw_prob_matrix: np.ndarray,
) -> dict:
    outcomes = ["home_win", "draw", "away_win"]
    actuals = []
    for home_val, away_val in zip(y_home, y_away):
        actual = _outcome_from_labels(float(home_val), float(away_val))
        actuals.append(actual)

    calibration_rows: list[dict] = []
    for idx, outcome in enumerate(outcomes):
        y_binary = np.array([1 if item == outcome else 0 for item in actuals], dtype=int)
        x_prob = raw_prob_matrix[:, idx].reshape(-1, 1)

        if len(np.unique(y_binary)) < 2:
            calibration_rows.append({"outcome": outcome, "enabled": False, "coef": 1.0, "intercept": 0.0})
            continue

        model = LogisticRegression(solver="lbfgs", max_iter=300)
        try:
            model.fit(x_prob, y_binary)
            coef = float(model.coef_[0][0])
            intercept = float(model.intercept_[0])
            calibration_rows.append(
                {
                    "outcome": outcome,
                    "enabled": True,
                    "coef": coef,
                    "intercept": intercept,
                }
            )
        except Exception:
            calibration_rows.append({"outcome": outcome, "enabled": False, "coef": 1.0, "intercept": 0.0})

    return {
        "method": "platt_one_vs_rest",
        "rows": calibration_rows,
    }



def _apply_probability_calibration(raw_prob_matrix: np.ndarray, calibration_payload: dict) -> np.ndarray:
    if not calibration_payload:
        return np.asarray(raw_prob_matrix, dtype=float)

    out = np.asarray(raw_prob_matrix, dtype=float).copy()
    rows = calibration_payload.get("rows") or []
    if len(rows) != 3:
        return out

    for idx, row in enumerate(rows):
        if not bool(row.get("enabled")):
            continue
        coef = float(row.get("coef") or 1.0)
        intercept = float(row.get("intercept") or 0.0)
        logits = coef * out[:, idx] + intercept
        out[:, idx] = 1.0 / (1.0 + np.exp(-logits))

    out = np.clip(out, 1e-9, 1.0)
    sums = out.sum(axis=1).reshape(-1, 1)
    sums[sums <= 0] = 1.0
    return out / sums



def _extract_market_prob_matrix(df_slice: pd.DataFrame) -> np.ndarray:
    cols = ["market_prob_home", "market_prob_draw", "market_prob_away"]
    if not all(col in df_slice.columns for col in cols):
        return np.full((len(df_slice), 3), np.nan, dtype=float)

    market = df_slice[cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
    out = np.full_like(market, np.nan, dtype=float)
    for i in range(len(market)):
        row = market[i]
        if np.any(np.isnan(row)):
            continue
        total = float(np.sum(row))
        if total <= 0:
            continue
        norm = row / total
        if np.any(norm <= 0):
            continue
        out[i] = norm
    return out



def _blend_with_market_probs(model_probs: np.ndarray, market_probs: np.ndarray, weight_model: float) -> np.ndarray:
    out = np.asarray(model_probs, dtype=float).copy()
    w_model = float(max(0.0, min(1.0, weight_model)))
    w_market = 1.0 - w_model

    for i in range(len(out)):
        market_row = market_probs[i] if i < len(market_probs) else None
        if market_row is None or np.any(np.isnan(market_row)):
            continue
        mixed = (w_model * out[i]) + (w_market * market_row)
        mixed = np.clip(mixed, 1e-9, 1.0)
        out[i] = mixed / float(np.sum(mixed))

    return out



def _optimize_odds_blend_weight(
    y_home: pd.Series,
    y_away: pd.Series,
    model_probs: np.ndarray,
    market_probs: np.ndarray,
    grid_step: float,
) -> dict:
    valid_mask = ~np.isnan(market_probs).any(axis=1)
    valid_count = int(np.sum(valid_mask))
    if valid_count < 20:
        return {
            "enabled": False,
            "weight_model": 1.0,
            "weight_market": 0.0,
            "samples": valid_count,
            "optimized_metric": "log_loss",
            "best_log_loss": None,
        }

    step = max(0.01, float(grid_step))
    weights = np.arange(0.0, 1.0 + step, step)
    best: Optional[dict] = None

    y_home_valid = y_home.reset_index(drop=True)
    y_away_valid = y_away.reset_index(drop=True)

    for w in weights:
        blended = _blend_with_market_probs(model_probs, market_probs, weight_model=float(w))
        metrics = _evaluate_outcome_probability_matrix(y_home_valid, y_away_valid, blended)
        row = {
            "weight_model": float(w),
            "weight_market": float(1.0 - w),
            "metrics": metrics,
        }
        key = (
            float(metrics.get("log_loss") or 9e9),
            float(metrics.get("brier") or 9e9),
        )
        if best is None:
            best = {**row, "_key": key}
            continue
        if key < best["_key"]:
            best = {**row, "_key": key}

    assert best is not None
    return {
        "enabled": True,
        "weight_model": float(best["weight_model"]),
        "weight_market": float(best["weight_market"]),
        "samples": valid_count,
        "optimized_metric": "log_loss",
        "best_log_loss": float((best["metrics"] or {}).get("log_loss") or 0.0),
    }



def _walk_forward_cv(
    selected_model_name: str,
    X_all: pd.DataFrame,
    y_home: pd.Series,
    y_away: pd.Series,
    event_dates: Optional[pd.Series],
    n_splits: int,
) -> Optional[dict]:
    if len(X_all) < 120:
        return None

    prototype = _model_prototype_by_name(selected_model_name)
    if prototype is None:
        return None

    order_idx = X_all.index
    if event_dates is not None and not event_dates.dropna().empty:
        norm_dates = pd.to_datetime(event_dates, errors="coerce", utc=True)
        order_idx = norm_dates.fillna(pd.Timestamp("1970-01-01T00:00:00+00:00")).sort_values().index

    X = X_all.loc[order_idx].reset_index(drop=True)
    yh = y_home.loc[order_idx].reset_index(drop=True)
    ya = y_away.loc[order_idx].reset_index(drop=True)

    splits = max(2, int(n_splits))
    splitter = TimeSeriesSplit(n_splits=splits)
    fold_rows = []

    for fold_idx, (tr, va) in enumerate(splitter.split(X), start=1):
        if len(tr) < 40 or len(va) < 10:
            continue

        X_train = X.iloc[tr]
        X_val = X.iloc[va]
        y_home_train = yh.iloc[tr]
        y_home_val = yh.iloc[va]
        y_away_train = ya.iloc[tr]
        y_away_val = ya.iloc[va]

        try:
            home_model = _clone_model(prototype)
            away_model = _clone_model(prototype)
            home_model.fit(X_train, y_home_train)
            away_model.fit(X_train, y_away_train)
            home_pred = _clip_lambda_predictions(home_model.predict(X_val))
            away_pred = _clip_lambda_predictions(away_model.predict(X_val))

            home_pred_scaled, _ = _calibrate_lambda_predictions(y_home_val, home_pred)
            away_pred_scaled, _ = _calibrate_lambda_predictions(y_away_val, away_pred)

            probs = _prob_matrix_from_lambdas(home_pred_scaled, away_pred_scaled)
            metrics = _evaluate_outcome_probability_matrix(y_home_val, y_away_val, probs)
            fold_rows.append(
                {
                    "fold": fold_idx,
                    "train_rows": int(len(tr)),
                    "validation_rows": int(len(va)),
                    "accuracy": metrics.get("accuracy"),
                    "brier": metrics.get("brier"),
                    "log_loss": metrics.get("log_loss"),
                }
            )
        except Exception as exc:
            logger.warning("Walk-forward fold {} failed for {}: {}", fold_idx, selected_model_name, exc)

    if not fold_rows:
        return None

    acc_vals = [float(item["accuracy"]) for item in fold_rows if item.get("accuracy") is not None]
    brier_vals = [float(item["brier"]) for item in fold_rows if item.get("brier") is not None]
    loss_vals = [float(item["log_loss"]) for item in fold_rows if item.get("log_loss") is not None]

    return {
        "splits": int(splits),
        "folds_completed": int(len(fold_rows)),
        "average_accuracy": float(sum(acc_vals) / len(acc_vals)) if acc_vals else None,
        "average_brier": float(sum(brier_vals) / len(brier_vals)) if brier_vals else None,
        "average_log_loss": float(sum(loss_vals) / len(loss_vals)) if loss_vals else None,
        "folds": fold_rows,
    }



def save_artifacts(home_model, away_model, meta: dict, model_dir: Path) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(home_model, model_dir / "lambda_home.pkl")
    joblib.dump(away_model, model_dir / "lambda_away.pkl")
    (model_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    logger.info("Saved model artifacts to {}", model_dir)



def _snapshot_training_frame(df: pd.DataFrame, feature_columns: List[str], model_dir: Path) -> Path:
    paired_df = df.dropna(subset=LABEL_COLS).copy()
    snapshot_source = paired_df if not paired_df.empty else df
    if "fixture_id" not in snapshot_source.columns:
        snapshot_source = snapshot_source.reset_index().rename(columns={"index": "fixture_id"})

    base_columns = [
        "fixture_id",
        "event_date",
        "league_id",
        "home_team_id",
        "away_team_id",
        "home_team_name",
        "away_team_name",
        "market_prob_home",
        "market_prob_draw",
        "market_prob_away",
    ]
    snapshot_columns: List[str] = []
    for col in base_columns + feature_columns + LABEL_COLS:
        if col in snapshot_source.columns and col not in snapshot_columns:
            snapshot_columns.append(col)

    snapshot_df = snapshot_source[snapshot_columns].copy() if snapshot_columns else snapshot_source.copy()
    snapshot_path = model_dir / "training_frame.parquet"
    snapshot_df.to_parquet(snapshot_path, index=False)
    logger.info("Saved training frame snapshot to {} (rows={})", snapshot_path, len(snapshot_df))
    return snapshot_path



def _training_data_hash(df: pd.DataFrame, feature_columns: List[str]) -> str:
    cols = [col for col in ["fixture_id", "event_date", "league_id", *feature_columns, *LABEL_COLS] if col in df.columns]
    if not cols:
        return ""
    subset = df[cols].copy()
    hashed = pd.util.hash_pandas_object(subset, index=True).values
    return hashlib.sha256(hashed.tobytes()).hexdigest()



def _write_training_manifest(meta: dict, model_dir: Path) -> Path:
    manifest = {
        "model_id": meta.get("model_id"),
        "model_name": meta.get("model_name"),
        "model_version": meta.get("model_version"),
        "trained_at": meta.get("trained_at"),
        "model_scope": meta.get("model_scope"),
        "created_by_user_id": meta.get("created_by_user_id"),
        "created_by_username": meta.get("created_by_username"),
        "created_by_role": meta.get("created_by_role"),
        "description": meta.get("description"),
        "selected_data_sources": meta.get("selected_data_sources"),
        "feature_columns": meta.get("feature_columns"),
        "rows_available": meta.get("rows_available"),
        "rows_used": meta.get("rows_used"),
        "rows_with_home_label": meta.get("rows_with_home_label"),
        "rows_with_away_label": meta.get("rows_with_away_label"),
        "league_id": meta.get("league_id"),
        "limit": meta.get("limit"),
        "training_rows": meta.get("training_rows"),
        "validation_rows": meta.get("validation_rows"),
        "validation_outcome_metrics": meta.get("validation_outcome_metrics"),
        "validation_model_only_metrics": meta.get("validation_model_only_metrics"),
        "lambda_calibration": meta.get("lambda_calibration"),
        "probability_calibration": meta.get("probability_calibration"),
        "odds_blend": meta.get("odds_blend"),
        "walk_forward_cv": meta.get("walk_forward_cv"),
        "training_mode": meta.get("training_mode"),
        "training_date_from": meta.get("training_date_from"),
        "training_date_to": meta.get("training_date_to"),
        "feature_dataset_path": meta.get("feature_dataset_path"),
        "training_snapshot_path": meta.get("training_snapshot_path"),
        "feature_schema_version": meta.get("feature_schema_version"),
        "training_data_hash": meta.get("training_data_hash"),
        "leakage_guard": meta.get("leakage_guard"),
    }
    manifest_path = model_dir / "training_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    logger.info("Saved training manifest to {}", manifest_path)
    return manifest_path



def parse_args():
    parser = argparse.ArgumentParser(description="Train expected goals models")
    parser.add_argument("--limit", type=int, required=False)
    parser.add_argument("--league-id", type=int, required=False, default=None)
    parser.add_argument("--model-name", type=str, required=False, default=None)
    parser.add_argument("--description", type=str, required=False, default=None)
    parser.add_argument("--data-sources", type=str, required=False, default=None)
    parser.add_argument("--training-mode", type=str, required=False, default="standard")
    parser.add_argument("--training-date-from", type=str, required=False, default=None)
    parser.add_argument("--training-date-to", type=str, required=False, default=None)
    parser.add_argument("--inactive", action="store_true", help="Do not activate this model after training")
    parser.add_argument(
        "--allow-synthetic-fallback",
        action="store_true",
        help="Allow synthetic training data when DB features are unavailable (debug only).",
    )
    return parser.parse_args()



def run_training(
    limit: Optional[int] = None,
    league_id: Optional[int] = None,
    model_name: Optional[str] = None,
    data_sources: Optional[List[str]] = None,
    description: Optional[str] = None,
    set_active: bool = True,
    created_by_user_id: Optional[int] = None,
    created_by_username: Optional[str] = None,
    created_by_role: Optional[str] = None,
    model_scope: Optional[str] = None,
    training_mode: Optional[str] = None,
    training_date_from: Optional[date] = None,
    training_date_to: Optional[date] = None,
    allow_synthetic_fallback: bool = False,
    progress_cb: ProgressCallback = None,
) -> dict:
    settings = get_settings()
    normalized_training_mode = str(training_mode or "standard").strip().lower()
    selected_sources = _normalize_sources(data_sources)
    selected_sources, leakage_guard = _apply_leakage_guard(selected_sources, settings)
    _emit_progress(progress_cb, 5, "Egitim verisi yukleniyor")
    df = load_training_frame(
        limit=limit,
        league_id=league_id,
        training_date_from=training_date_from,
        training_date_to=training_date_to,
        training_mode=normalized_training_mode,
        selected_sources=selected_sources,
        allow_synthetic_fallback=allow_synthetic_fallback,
    )
    logger.info("Training rows available: {}", len(df))
    _emit_progress(progress_cb, 20, "Egitim verisi hazir", {"rows_available": int(len(df))})

    selected_feature_columns = _resolve_feature_columns(df, selected_sources)
    source_report = _build_data_source_report(selected_sources, selected_feature_columns, list(df.columns))
    logger.info("Training with feature columns: {}", selected_feature_columns)
    _emit_progress(
        progress_cb,
        30,
        "Feature kolonlari secildi",
        {"feature_columns": selected_feature_columns, "selected_sources": selected_sources, "leakage_guard": leakage_guard},
    )

    paired_labeled_rows = int(df.dropna(subset=LABEL_COLS).shape[0])
    home_labeled_rows = int(df["label_home_goals"].notna().sum()) if "label_home_goals" in df.columns else 0
    away_labeled_rows = int(df["label_away_goals"].notna().sum()) if "label_away_goals" in df.columns else 0

    paired_df = df.dropna(subset=LABEL_COLS).copy()
    if len(paired_df) < 60:
        raise ValueError(
            f"Insufficient paired labeled rows for robust training: {len(paired_df)}. "
            "Ingest more completed fixtures."
        )

    X_all = paired_df[selected_feature_columns].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    event_dates = None
    if "event_date" in paired_df.columns:
        event_dates = pd.to_datetime(paired_df["event_date"], errors="coerce", utc=True)
    train_idx, val_idx = _time_aware_split_indices(X_all, event_dates=event_dates)

    X_train = X_all.loc[train_idx]
    X_val = X_all.loc[val_idx]
    y_home_train = paired_df.loc[train_idx, "label_home_goals"].astype(float)
    y_home_val = paired_df.loc[val_idx, "label_home_goals"].astype(float)
    y_away_train = paired_df.loc[train_idx, "label_away_goals"].astype(float)
    y_away_val = paired_df.loc[val_idx, "label_away_goals"].astype(float)

    _emit_progress(progress_cb, 40, "Ev gol modeli adaylari egitiliyor")
    home_candidates = _fit_candidate_models(
        X_train=X_train,
        y_train=y_home_train,
        X_val=X_val,
        y_val=y_home_val,
        label="label_home_goals",
    )

    _emit_progress(progress_cb, 60, "Deplasman gol modeli adaylari egitiliyor")
    away_candidates = _fit_candidate_models(
        X_train=X_train,
        y_train=y_away_train,
        X_val=X_val,
        y_val=y_away_val,
        label="label_away_goals",
    )

    selected_pair = _select_best_pair_by_outcome_logloss(
        home_candidates=home_candidates,
        away_candidates=away_candidates,
        y_home_val=y_home_val,
        y_away_val=y_away_val,
    )

    selected_home = selected_pair["selected_home"]
    selected_away = selected_pair["selected_away"]
    selected_home_model = selected_home["model"]
    selected_away_model = selected_away["model"]
    selected_model_name = str(selected_pair.get("selected_model_name") or selected_home.get("model_name"))

    calibrated_home_pred, home_scale = _calibrate_lambda_predictions(y_home_val, selected_home["val_pred"])
    calibrated_away_pred, away_scale = _calibrate_lambda_predictions(y_away_val, selected_away["val_pred"])
    raw_prob_matrix = _prob_matrix_from_lambdas(calibrated_home_pred, calibrated_away_pred)

    prob_calibration = _fit_probability_calibration(y_home_val, y_away_val, raw_prob_matrix)
    calibrated_prob_matrix = _apply_probability_calibration(raw_prob_matrix, prob_calibration)
    model_only_outcome_metrics = _evaluate_outcome_probability_matrix(y_home_val, y_away_val, calibrated_prob_matrix)

    market_prob_matrix = _extract_market_prob_matrix(paired_df.loc[val_idx])
    odds_blend = _optimize_odds_blend_weight(
        y_home=y_home_val.reset_index(drop=True),
        y_away=y_away_val.reset_index(drop=True),
        model_probs=calibrated_prob_matrix,
        market_probs=market_prob_matrix,
        grid_step=float(settings.training_odds_blend_grid_step),
    )
    blended_prob_matrix = _blend_with_market_probs(
        calibrated_prob_matrix,
        market_prob_matrix,
        weight_model=float(odds_blend.get("weight_model") or 1.0),
    )

    outcome_metrics = _evaluate_outcome_probability_matrix(y_home_val, y_away_val, blended_prob_matrix)

    walk_forward_cv = _walk_forward_cv(
        selected_model_name=selected_model_name,
        X_all=X_all,
        y_home=paired_df["label_home_goals"].astype(float),
        y_away=paired_df["label_away_goals"].astype(float),
        event_dates=event_dates,
        n_splits=max(2, int(settings.training_walk_forward_splits)),
    )

    identity = _build_model_identity(model_name=model_name)
    model_dir = (MODEL_STORE_DIR / identity["model_id"]).resolve()
    model_dir.mkdir(parents=True, exist_ok=True)
    _emit_progress(progress_cb, 74, "Egitim verisi snapshot olarak kaydediliyor")
    snapshot_path = _snapshot_training_frame(df, selected_feature_columns, model_dir)

    training_hash = _training_data_hash(paired_df, selected_feature_columns)

    home_metrics = {
        "model_name": selected_home["model_name"],
        "mae": float(selected_home["mae"]),
        "rmse": float(selected_home["rmse"]),
        "calibration_scale": float(home_scale),
        "selection_metric": "validation_outcome_log_loss",
        "candidates": [
            {
                "model_name": item["model_name"],
                "mae": float(item["mae"]),
                "rmse": float(item["rmse"]),
            }
            for item in home_candidates
        ],
    }
    away_metrics = {
        "model_name": selected_away["model_name"],
        "mae": float(selected_away["mae"]),
        "rmse": float(selected_away["rmse"]),
        "calibration_scale": float(away_scale),
        "selection_metric": "validation_outcome_log_loss",
        "candidates": [
            {
                "model_name": item["model_name"],
                "mae": float(item["mae"]),
                "rmse": float(item["rmse"]),
            }
            for item in away_candidates
        ],
    }

    meta = {
        "model_id": identity["model_id"],
        "model_name": identity["model_name"],
        "model_version": identity["model_version"],
        "trained_at": identity["trained_at"],
        "model_scope": "ready" if str(model_scope or "").strip().lower() == "ready" else "user",
        "created_by_user_id": int(created_by_user_id) if created_by_user_id is not None else None,
        "created_by_username": (created_by_username or "").strip() or None,
        "created_by_role": (created_by_role or "").strip() or None,
        "description": description,
        "feature_columns": selected_feature_columns,
        "selected_data_sources": selected_sources,
        "data_source_report": source_report,
        "home_metrics": home_metrics,
        "away_metrics": away_metrics,
        "candidate_pair_report": selected_pair.get("pair_report") or [],
        "validation_model_only_metrics": model_only_outcome_metrics,
        "validation_outcome_metrics": outcome_metrics,
        "lambda_calibration": {
            "home_scale": float(home_scale),
            "away_scale": float(away_scale),
        },
        "probability_calibration": prob_calibration,
        "odds_blend": odds_blend,
        "walk_forward_cv": walk_forward_cv,
        "validation_rows": int(len(val_idx)),
        "training_rows": int(len(train_idx)),
        "rows_available": int(len(df)),
        "rows_used": paired_labeled_rows,
        "rows_with_home_label": home_labeled_rows,
        "rows_with_away_label": away_labeled_rows,
        "training_mode": normalized_training_mode,
        "training_date_from": training_date_from.isoformat() if isinstance(training_date_from, date) else None,
        "training_date_to": training_date_to.isoformat() if isinstance(training_date_to, date) else None,
        "league_id": league_id,
        "limit": limit,
        "artifact_dir": str(model_dir),
        "feature_dataset_path": "db://features",
        "training_snapshot_path": str(snapshot_path.resolve()),
        "feature_schema_version": str(settings.training_feature_schema_version),
        "training_data_hash": training_hash,
        "leakage_guard": bool(leakage_guard),
    }
    manifest_path = _write_training_manifest(meta, model_dir)
    meta["training_manifest_path"] = str(manifest_path.resolve())

    _emit_progress(progress_cb, 82, "Model artifact dosyalari yaziliyor")
    save_artifacts(selected_home_model, selected_away_model, meta, model_dir)
    _emit_progress(progress_cb, 92, "Model kataloguna kaydediliyor")
    registry_entry = {
        "model_id": identity["model_id"],
        "model_name": identity["model_name"],
        "version": identity["model_version"],
        "artifact_dir": str(model_dir),
        "trained_at": identity["trained_at"],
        "model_scope": meta.get("model_scope"),
        "created_by_user_id": meta.get("created_by_user_id"),
        "created_by_username": meta.get("created_by_username"),
        "created_by_role": meta.get("created_by_role"),
        "meta": meta,
    }
    register_model(registry_entry, set_active=set_active)

    try:
        _emit_progress(progress_cb, 96, "Rolling backtest calistiriliyor")
        from modeling.backtest import run_backtest

        backtest_summary = run_backtest(
            settings=settings,
            model_id=identity["model_id"],
            league_id=league_id,
            windows=max(2, int(settings.training_walk_forward_splits)),
            min_window=120,
            persist=True,
        )
        meta["backtest_summary"] = {
            "window_count": backtest_summary.get("window_count"),
            "samples": backtest_summary.get("samples"),
            "log_loss": backtest_summary.get("log_loss"),
            "brier": backtest_summary.get("brier"),
            "accuracy": backtest_summary.get("accuracy"),
            "artifact_path": backtest_summary.get("artifact_path"),
        }
        (model_dir / "meta.json").write_text(json.dumps(meta, indent=2))
        refreshed_manifest_path = _write_training_manifest(meta, model_dir)
        meta["training_manifest_path"] = str(refreshed_manifest_path.resolve())
        registry_entry["meta"] = meta
        register_model(registry_entry, set_active=set_active)
    except Exception as exc:
        logger.warning("Backtest step failed after training model {}: {}", identity["model_id"], exc)

    _emit_progress(
        progress_cb,
        100,
        "Model egitimi tamamlandi",
        {
            "model_id": identity["model_id"],
            "model_name": identity["model_name"],
            "rows_used": paired_labeled_rows,
        },
    )
    return meta



def main():
    args = parse_args()
    data_sources = [item.strip() for item in str(args.data_sources or "").split(",") if item.strip()]
    parsed_training_from = None
    parsed_training_to = None
    if args.training_date_from:
        parsed_training_from = datetime.fromisoformat(str(args.training_date_from)).date()
    if args.training_date_to:
        parsed_training_to = datetime.fromisoformat(str(args.training_date_to)).date()
    run_training(
        limit=args.limit,
        league_id=args.league_id,
        model_name=args.model_name,
        data_sources=data_sources or None,
        description=args.description,
        set_active=not args.inactive,
        training_mode=args.training_mode,
        training_date_from=parsed_training_from,
        training_date_to=parsed_training_to,
        allow_synthetic_fallback=bool(args.allow_synthetic_fallback),
    )


if __name__ == "__main__":
    main()
