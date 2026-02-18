from __future__ import annotations

import argparse
import re
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

import pandas as pd
from loguru import logger
from sqlalchemy import MetaData, create_engine, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings

metadata = MetaData()

# Tables will be reflected at runtime to stay in sync with migrations
raw_fixtures_table = None
features_table = None

FEATURE_PATH = Path("artifacts/features.parquet")
FEATURE_SCHEMA_VERSION = "v2"
FEATURE_BUILD_RUNS_TABLE = "feature_build_runs"
ProgressCallback = Optional[Callable[[int, str, Dict[str, object]], None]]
FORM_WINDOW = 8
ELO_BASE = 1500.0
ELO_K = 20.0
ELO_HOME_ADVANTAGE = 65.0

# SportMonks statistic codes we transform into numeric team-level features.
TEAM_STAT_CODE_TO_FEATURE = {
    "shots-total": "shots",
    "shots-on-target": "shots_on_target",
    "ball-possession": "possession",
    "dangerous-attacks": "dangerous_attacks",
    "goals": "goals",
    "corners": "corners",
    "offsides": "offsides",
    "yellowcards": "yellow_cards",
    "redcards": "red_cards",
    "penalties": "penalties",
    "key-passes": "key_passes",
    "big-chances-created": "big_chances_created",
    "big-chances-missed": "big_chances_missed",
    "shots-blocked": "shots_blocked",
}

FORM_EXTRA_FEATURES = [
    "corners",
    "offsides",
    "yellow_cards",
    "red_cards",
    "penalties",
    "key_passes",
    "big_chances_created",
    "big_chances_missed",
    "shots_blocked",
]


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



def _json_safe_value(value):
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



def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return None



def _mean_or_default(values: list[Optional[float]], default: float, positive_only: bool = False) -> float:
    clean: list[float] = []
    for value in values:
        if value is None:
            continue
        v = float(value)
        if positive_only and v <= 0:
            continue
        clean.append(v)
    if not clean:
        return default
    return float(sum(clean) / len(clean))



def _summarize_team_history(history_rows: deque[dict]) -> dict:
    base = {
        "matches": float(len(history_rows)),
        "goals_for": _mean_or_default([item.get("goals_for") for item in history_rows], default=1.2),
        "goals_against": _mean_or_default([item.get("goals_against") for item in history_rows], default=1.2),
        "points": _mean_or_default([item.get("points") for item in history_rows], default=1.3),
        "shots": _mean_or_default([item.get("shots") for item in history_rows], default=11.0, positive_only=True),
        "shots_on_target": _mean_or_default(
            [item.get("shots_on_target") for item in history_rows], default=4.0, positive_only=True
        ),
        "possession": _mean_or_default(
            [item.get("possession") for item in history_rows], default=50.0, positive_only=True
        ),
        "dangerous_attacks": _mean_or_default(
            [item.get("dangerous_attacks") for item in history_rows], default=34.0, positive_only=True
        ),
    }
    for key in FORM_EXTRA_FEATURES:
        base[key] = _mean_or_default([item.get(key) for item in history_rows], default=0.0, positive_only=False)

    base["injury_count"] = _mean_or_default([item.get("injury_count") for item in history_rows], default=0.0)
    base["suspension_count"] = _mean_or_default([item.get("suspension_count") for item in history_rows], default=0.0)
    base["starter_count"] = _mean_or_default([item.get("starter_count") for item in history_rows], default=0.0)
    base["lineup_known"] = _mean_or_default([item.get("lineup_known") for item in history_rows], default=0.0)
    return base



def _result_points(goals_for: Optional[float], goals_against: Optional[float]) -> Optional[float]:
    if goals_for is None or goals_against is None:
        return None
    if goals_for > goals_against:
        return 3.0
    if goals_for < goals_against:
        return 0.0
    return 1.0



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



def _build_team_snapshot(row: pd.Series, side: str) -> dict:
    goals_for = _optional_float(row.get("label_home_goals" if side == "home" else "label_away_goals"))
    goals_against = _optional_float(row.get("label_away_goals" if side == "home" else "label_home_goals"))
    out = {
        "shots": _optional_float(row.get("shots_home" if side == "home" else "shots_away")),
        "shots_on_target": _optional_float(
            row.get("shots_on_target_home" if side == "home" else "shots_on_target_away")
        ),
        "possession": _optional_float(row.get("possession_home" if side == "home" else "possession_away")),
        "dangerous_attacks": _optional_float(
            row.get("dangerous_attacks_home" if side == "home" else "dangerous_attacks_away")
        ),
        "goals_for": goals_for,
        "goals_against": goals_against,
        "points": _result_points(goals_for, goals_against),
        "injury_count": _optional_float(row.get("injury_count_home" if side == "home" else "injury_count_away")),
        "suspension_count": _optional_float(
            row.get("suspension_count_home" if side == "home" else "suspension_count_away")
        ),
        "starter_count": _optional_float(row.get("starter_count_home" if side == "home" else "starter_count_away")),
        "lineup_known": _optional_float(row.get("lineup_known_home" if side == "home" else "lineup_known_away")),
    }
    for key in FORM_EXTRA_FEATURES:
        out[key] = _optional_float(row.get(f"{key}_home" if side == "home" else f"{key}_away"))
    return out



def _derive_pre_match_form_features(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    work = df.copy()
    event_dates = pd.to_datetime(work.get("event_date"), errors="coerce", utc=True)
    work = work.assign(
        _event_date_sort=event_dates.fillna(pd.Timestamp("1970-01-01T00:00:00+00:00")),
    )
    work = work.sort_values(["_event_date_sort", "fixture_id"], ascending=[True, True], kind="mergesort")
    work = work.reset_index(drop=True)

    team_histories: defaultdict[int, deque[dict]] = defaultdict(lambda: deque(maxlen=FORM_WINDOW))
    team_elo: defaultdict[int, float] = defaultdict(lambda: ELO_BASE)

    pre_match_rows: list[dict] = []
    for _, row in work.iterrows():
        home_id = int(row["home_team_id"])
        away_id = int(row["away_team_id"])

        home_history = _summarize_team_history(team_histories[home_id])
        away_history = _summarize_team_history(team_histories[away_id])

        home_elo_pre = float(team_elo[home_id])
        away_elo_pre = float(team_elo[away_id])

        pre = {
            "form_matches_home": home_history["matches"],
            "form_matches_away": away_history["matches"],
            "form_goals_for_home": home_history["goals_for"],
            "form_goals_for_away": away_history["goals_for"],
            "form_goals_against_home": home_history["goals_against"],
            "form_goals_against_away": away_history["goals_against"],
            "form_goal_balance_home": home_history["goals_for"] - home_history["goals_against"],
            "form_goal_balance_away": away_history["goals_for"] - away_history["goals_against"],
            "form_points_home": home_history["points"],
            "form_points_away": away_history["points"],
            "form_shots_home": home_history["shots"],
            "form_shots_away": away_history["shots"],
            "form_shots_on_target_home": home_history["shots_on_target"],
            "form_shots_on_target_away": away_history["shots_on_target"],
            "form_possession_home": home_history["possession"],
            "form_possession_away": away_history["possession"],
            "form_dangerous_attacks_home": home_history["dangerous_attacks"],
            "form_dangerous_attacks_away": away_history["dangerous_attacks"],
            "form_points_diff": home_history["points"] - away_history["points"],
            "form_goal_balance_diff": (home_history["goals_for"] - home_history["goals_against"])
            - (away_history["goals_for"] - away_history["goals_against"]),
            "form_shots_on_target_diff": home_history["shots_on_target"] - away_history["shots_on_target"],
            "form_possession_diff": home_history["possession"] - away_history["possession"],
            "form_dangerous_attacks_diff": home_history["dangerous_attacks"] - away_history["dangerous_attacks"],
            "elo_home_pre": home_elo_pre,
            "elo_away_pre": away_elo_pre,
            "elo_diff": home_elo_pre - away_elo_pre,
            "form_injury_count_home": home_history["injury_count"],
            "form_injury_count_away": away_history["injury_count"],
            "form_suspension_count_home": home_history["suspension_count"],
            "form_suspension_count_away": away_history["suspension_count"],
            "form_starter_count_home": home_history["starter_count"],
            "form_starter_count_away": away_history["starter_count"],
            "form_lineup_known_home": home_history["lineup_known"],
            "form_lineup_known_away": away_history["lineup_known"],
        }

        for key in FORM_EXTRA_FEATURES:
            pre[f"form_{key}_home"] = home_history[key]
            pre[f"form_{key}_away"] = away_history[key]
            pre[f"form_{key}_diff"] = home_history[key] - away_history[key]

        pre_match_rows.append(pre)

        home_snapshot = _build_team_snapshot(row, side="home")
        away_snapshot = _build_team_snapshot(row, side="away")
        team_histories[home_id].append(home_snapshot)
        team_histories[away_id].append(away_snapshot)

        home_goals = home_snapshot["goals_for"]
        away_goals = away_snapshot["goals_for"]
        if home_goals is not None and away_goals is not None:
            home_post, away_post = _elo_post_match(home_elo_pre, away_elo_pre, home_goals, away_goals)
            team_elo[home_id] = home_post
            team_elo[away_id] = away_post

    feature_df = pd.DataFrame(pre_match_rows)
    for col in feature_df.columns:
        work[col] = feature_df[col].values

    work = work.drop(columns=["_event_date_sort"], errors="ignore")
    return work



def load_tables(engine):
    metadata.reflect(engine, only=["raw_fixtures", "features"])
    global raw_fixtures_table, features_table
    raw_fixtures_table = metadata.tables["raw_fixtures"]
    features_table = metadata.tables["features"]



def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())



def _extract_lineup_stats(data: dict, home_id: int, away_id: int) -> dict[str, float]:
    rows = data.get("lineups") or []
    if isinstance(rows, dict):
        rows = rows.get("data") or []
    if not isinstance(rows, list):
        rows = []

    counts = {
        int(home_id): {"total": 0, "starters": 0},
        int(away_id): {"total": 0, "starters": 0},
    }
    for row in rows:
        if not isinstance(row, dict):
            continue
        team_id_raw = row.get("team_id")
        if team_id_raw is None:
            team_id_raw = row.get("participant_id")
        try:
            team_id = int(team_id_raw)
        except (TypeError, ValueError):
            continue
        if team_id not in counts:
            continue
        counts[team_id]["total"] += 1
        if row.get("formation_position") not in (None, ""):
            counts[team_id]["starters"] += 1

    out = {
        "starter_count_home": float(counts[int(home_id)]["starters"]),
        "starter_count_away": float(counts[int(away_id)]["starters"]),
        "lineup_known_home": 1.0 if counts[int(home_id)]["starters"] >= 7 else 0.0,
        "lineup_known_away": 1.0 if counts[int(away_id)]["starters"] >= 7 else 0.0,
    }
    return out



def _extract_sidelined_stats(data: dict, home_id: int, away_id: int) -> dict[str, float]:
    rows = data.get("sidelined") or []
    if isinstance(rows, dict):
        rows = rows.get("data") or []
    if not isinstance(rows, list):
        rows = []

    counts = {
        int(home_id): {"injury": 0.0, "suspension": 0.0},
        int(away_id): {"injury": 0.0, "suspension": 0.0},
    }

    for row in rows:
        if not isinstance(row, dict):
            continue
        team_id_raw = row.get("team_id")
        if team_id_raw is None:
            team_id_raw = row.get("participant_id")
        if team_id_raw is None and isinstance(row.get("team"), dict):
            team_id_raw = row.get("team", {}).get("id")
        try:
            team_id = int(team_id_raw)
        except (TypeError, ValueError):
            continue
        if team_id not in counts:
            continue

        reason_text = _normalize_text(
            row.get("type")
            or row.get("reason")
            or row.get("description")
            or row.get("status")
            or row.get("comment")
            or ""
        )
        type_id = _to_float(row.get("type_id"), default=-1)

        if "susp" in reason_text or "ceza" in reason_text or type_id in {216, 118}:
            counts[team_id]["suspension"] += 1.0
        else:
            counts[team_id]["injury"] += 1.0

    return {
        "injury_count_home": float(counts[int(home_id)]["injury"]),
        "injury_count_away": float(counts[int(away_id)]["injury"]),
        "suspension_count_home": float(counts[int(home_id)]["suspension"]),
        "suspension_count_away": float(counts[int(away_id)]["suspension"]),
    }



def _to_decimal_odd(value: Any) -> Optional[float]:
    odd = _to_float(value, default=0.0)
    if odd <= 1.0:
        return None
    return float(odd)



def _is_match_result_market(description: str) -> bool:
    d = _normalize_text(description)
    if not d:
        return False
    positive = ("match winner" in d) or ("fulltime result" in d) or ("full time result" in d)
    negative = (
        "half" in d
        or "handicap" in d
        or "over/under" in d
        or "both teams to score" in d
        or "btts" in d
    )
    return positive and not negative



def _classify_outcome(label: str, home_name: str, away_name: str) -> Optional[str]:
    val = _normalize_text(label)
    if val in {"1", "home", "ev", "ev sahibi"}:
        return "1"
    if val in {"x", "draw", "beraberlik", "0"}:
        return "0"
    if val in {"2", "away", "deplasman"}:
        return "2"
    if _normalize_text(home_name) and _normalize_text(home_name) in val:
        return "1"
    if _normalize_text(away_name) and _normalize_text(away_name) in val:
        return "2"
    return None



def _extract_market_probs(data: dict, home_name: str, away_name: str) -> dict[str, Optional[float]]:
    rows = data.get("odds") or []
    if isinstance(rows, dict):
        rows = rows.get("data") or []
    if not isinstance(rows, list):
        rows = []

    implied = {"1": [], "0": [], "2": []}
    for row in rows:
        if not isinstance(row, dict):
            continue
        market_desc = str(
            row.get("market_description")
            or row.get("market_name")
            or row.get("market")
            or row.get("market_type")
            or ""
        )
        if not _is_match_result_market(market_desc):
            continue

        label = str(row.get("label") or row.get("name") or row.get("selection") or row.get("outcome") or "")
        outcome = _classify_outcome(label, home_name=home_name, away_name=away_name)
        if outcome is None:
            continue
        odd_value = _to_decimal_odd(row.get("value") or row.get("odd") or row.get("odds"))
        if odd_value is None:
            continue
        implied[outcome].append(1.0 / odd_value)

    avg = {
        "1": float(sum(implied["1"]) / len(implied["1"])) if implied["1"] else None,
        "0": float(sum(implied["0"]) / len(implied["0"])) if implied["0"] else None,
        "2": float(sum(implied["2"]) / len(implied["2"])) if implied["2"] else None,
    }
    if any(v is None for v in avg.values()):
        return {"market_prob_home": None, "market_prob_draw": None, "market_prob_away": None}

    total = float(avg["1"] + avg["0"] + avg["2"])
    if total <= 0:
        return {"market_prob_home": None, "market_prob_draw": None, "market_prob_away": None}

    return {
        "market_prob_home": float(avg["1"] / total),
        "market_prob_draw": float(avg["0"] / total),
        "market_prob_away": float(avg["2"] / total),
    }



def extract_basic_features(payload: dict) -> dict:
    data = payload.get("data", {})
    participants = data.get("participants", [])
    if len(participants) < 2:
        raise ValueError("Fixture missing participants")
    home = next((p for p in participants if p.get("meta", {}).get("location") == "home"), participants[0])
    away = next((p for p in participants if p.get("meta", {}).get("location") == "away"), participants[1])

    stats = data.get("statistics", []) or []
    weather = data.get("weatherreport") or data.get("weatherReport") or {}
    referee = data.get("referee") or {}
    if not referee and data.get("referees"):
        referee = (data.get("referees") or [{}])[0]

    feature_by_team = defaultdict(dict)
    for item in stats:
        team_id = item.get("team_id") or item.get("participant_id")
        if team_id is None:
            continue
        raw_code = (item.get("type") or {}).get("code")
        feature_name = TEAM_STAT_CODE_TO_FEATURE.get(raw_code)
        if not feature_name:
            for fallback in TEAM_STAT_CODE_TO_FEATURE.values():
                if fallback in item:
                    try:
                        feature_by_team[int(team_id)][fallback] = float(item.get(fallback))
                    except (TypeError, ValueError):
                        pass
            continue

        value = item.get("data", {}).get("value")
        feature_by_team[int(team_id)][feature_name] = _to_float(value, default=0.0)

    def team_stat(team_id: int, field: str, default=0.0):
        return float(feature_by_team.get(int(team_id), {}).get(field, default))

    lineup_stats = _extract_lineup_stats(data, int(home["id"]), int(away["id"]))
    sidelined_stats = _extract_sidelined_stats(data, int(home["id"]), int(away["id"]))
    market_probs = _extract_market_probs(data, str(home.get("name") or ""), str(away.get("name") or ""))

    features = {
        "league_id": data.get("league_id"),
        "home_team_id": home["id"],
        "away_team_id": away["id"],
        "home_team_name": home.get("name"),
        "away_team_name": away.get("name"),
        "shots_home": team_stat(home["id"], "shots"),
        "shots_away": team_stat(away["id"], "shots"),
        "shots_on_target_home": team_stat(home["id"], "shots_on_target"),
        "shots_on_target_away": team_stat(away["id"], "shots_on_target"),
        "possession_home": team_stat(home["id"], "possession"),
        "possession_away": team_stat(away["id"], "possession"),
        "dangerous_attacks_home": team_stat(home["id"], "dangerous_attacks"),
        "dangerous_attacks_away": team_stat(away["id"], "dangerous_attacks"),
        "referee_yellow_cards": _to_float(referee.get("yellow_cards_per_game"), default=0.0),
        "referee_penalties": _to_float(referee.get("penalties_per_game"), default=0.0),
        "weather_temp": _to_float(weather.get("temperature"), default=0.0),
        "weather_wind": _to_float(weather.get("wind"), default=0.0),
        "weather_humidity": _to_float(weather.get("humidity"), default=0.0),
        "market_prob_home": market_probs["market_prob_home"],
        "market_prob_draw": market_probs["market_prob_draw"],
        "market_prob_away": market_probs["market_prob_away"],
        "injury_count_home": sidelined_stats["injury_count_home"],
        "injury_count_away": sidelined_stats["injury_count_away"],
        "suspension_count_home": sidelined_stats["suspension_count_home"],
        "suspension_count_away": sidelined_stats["suspension_count_away"],
        "lineup_known_home": lineup_stats["lineup_known_home"],
        "lineup_known_away": lineup_stats["lineup_known_away"],
        "starter_count_home": lineup_stats["starter_count_home"],
        "starter_count_away": lineup_stats["starter_count_away"],
    }
    for key in FORM_EXTRA_FEATURES:
        features[f"{key}_home"] = team_stat(home["id"], key)
        features[f"{key}_away"] = team_stat(away["id"], key)

    return features



def parse_match_labels(payload: dict) -> Tuple[Optional[int], Optional[int]]:
    data = payload.get("data", {})
    scores = data.get("scores")
    if not scores:
        return None, None

    if isinstance(scores, dict):
        for key in ("ft_score", "score", "fulltime"):
            value = scores.get(key)
            if isinstance(value, str):
                match = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", value)
                if match:
                    return int(match.group(1)), int(match.group(2))
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



def build_feature_frame(
    engine,
    progress_cb: ProgressCallback = None,
    start_progress: int = 5,
    end_progress: int = 70,
) -> pd.DataFrame:
    load_tables(engine)
    with engine.connect() as conn:
        rows = conn.execute(select(raw_fixtures_table.c.fixture_id, raw_fixtures_table.c.payload)).all()
    records = []
    total = len(rows)
    if total == 0:
        _emit_progress(progress_cb, end_progress, "Ham fixture bulunamadi")
        return pd.DataFrame(records)

    extract_end_progress = max(start_progress, end_progress - 8)
    for idx, (fixture_id, payload) in enumerate(rows, start=1):
        try:
            feats = extract_basic_features(payload)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to extract features for {}: {}", fixture_id, exc)
            continue
        home_goals, away_goals = parse_match_labels(payload)
        feats["fixture_id"] = fixture_id
        feats["event_date"] = payload.get("data", {}).get("starting_at")
        feats["label_home_goals"] = home_goals
        feats["label_away_goals"] = away_goals
        records.append(feats)
        if idx % 50 == 0 or idx == total:
            progress = start_progress + ((idx / total) * (extract_end_progress - start_progress))
            _emit_progress(
                progress_cb,
                progress,
                "Feature cikartiliyor",
                {"processed": idx, "total": total},
            )
    df = pd.DataFrame(records)
    if df.empty:
        return df
    _emit_progress(progress_cb, extract_end_progress + 2, "Pre-match form featurelari uretiliyor")
    df = _derive_pre_match_form_features(df)
    _emit_progress(progress_cb, end_progress, "Feature frame hazir", {"rows": int(len(df))})
    return df



def _ensure_feature_build_runs_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {FEATURE_BUILD_RUNS_TABLE} (
                    run_id BIGSERIAL PRIMARY KEY,
                    source_raw_count INT NOT NULL DEFAULT 0,
                    features_written INT NOT NULL DEFAULT 0,
                    stale_deleted INT NOT NULL DEFAULT 0,
                    schema_version TEXT NOT NULL DEFAULT 'v2',
                    status TEXT NOT NULL DEFAULT 'running',
                    notes TEXT,
                    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    finished_at TIMESTAMPTZ
                )
                """
            )
        )



def _begin_feature_build_run(engine, *, source_raw_count: int, schema_version: str) -> Optional[int]:
    _ensure_feature_build_runs_table(engine)
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    f"""
                    INSERT INTO {FEATURE_BUILD_RUNS_TABLE} (
                        source_raw_count, schema_version, status, started_at
                    ) VALUES (
                        :source_raw_count, :schema_version, 'running', :started_at
                    )
                    RETURNING run_id
                    """
                ),
                {
                    "source_raw_count": int(source_raw_count),
                    "schema_version": str(schema_version or FEATURE_SCHEMA_VERSION),
                    "started_at": datetime.now(timezone.utc),
                },
            ).mappings().first()
            return int(row["run_id"]) if row else None
    except Exception:
        return None



def _finish_feature_build_run(
    engine,
    *,
    run_id: Optional[int],
    features_written: int,
    stale_deleted: int,
    status: str,
    notes: Optional[str] = None,
) -> None:
    if run_id is None:
        return
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"""
                    UPDATE {FEATURE_BUILD_RUNS_TABLE}
                    SET features_written = :features_written,
                        stale_deleted = :stale_deleted,
                        status = :status,
                        notes = :notes,
                        finished_at = :finished_at
                    WHERE run_id = :run_id
                    """
                ),
                {
                    "run_id": int(run_id),
                    "features_written": int(features_written),
                    "stale_deleted": int(stale_deleted),
                    "status": str(status),
                    "notes": notes,
                    "finished_at": datetime.now(timezone.utc),
                },
            )
    except Exception:
        return



def persist_features(
    engine,
    df: pd.DataFrame,
    progress_cb: ProgressCallback = None,
    start_progress: int = 70,
    end_progress: int = 95,
    full_rebuild: bool = False,
) -> tuple[int, int]:
    load_tables(engine)
    df = df.set_index("fixture_id")
    total = len(df.index)
    stale_deleted = 0
    _emit_progress(progress_cb, start_progress, "Feature tablosu yaziliyor", {"processed": 0, "total": total})
    with engine.begin() as conn:
        if full_rebuild:
            stale_deleted = int(
                conn.execute(
                    text(
                        """
                        DELETE FROM features f
                        WHERE NOT EXISTS (
                            SELECT 1 FROM raw_fixtures r WHERE r.fixture_id = f.fixture_id
                        )
                        """
                    )
                ).rowcount
                or 0
            )

        for idx, (fixture_id, row) in enumerate(df.iterrows(), start=1):
            payload = {key: _json_safe_value(value) for key, value in row.to_dict().items()}
            stmt = pg_insert(features_table).values(
                fixture_id=int(fixture_id),
                home_team_id=int(payload["home_team_id"]),
                away_team_id=int(payload["away_team_id"]),
                feature_vector=payload,
                label_home_goals=payload.get("label_home_goals"),
                label_away_goals=payload.get("label_away_goals"),
                event_date=payload.get("event_date"),
            ).on_conflict_do_update(
                index_elements=[features_table.c.fixture_id],
                set_={
                    "feature_vector": payload,
                    "label_home_goals": payload.get("label_home_goals"),
                    "label_away_goals": payload.get("label_away_goals"),
                    "event_date": payload.get("event_date"),
                },
            )
            conn.execute(stmt)
            if idx % 50 == 0 or idx == total:
                progress = start_progress + ((idx / max(1, total)) * (end_progress - start_progress))
                _emit_progress(
                    progress_cb,
                    progress,
                    "Feature tablosu yaziliyor",
                    {"processed": idx, "total": total},
                )
    FEATURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(FEATURE_PATH, index=True)
    logger.info("Persisted {} feature rows to DB and {} (stale_deleted={})", len(df), FEATURE_PATH, stale_deleted)
    return int(len(df)), int(stale_deleted)



def build_and_persist_features(progress_cb: ProgressCallback = None, full_rebuild: bool = False) -> int:
    settings = get_settings()
    engine = create_engine(settings.db_url)

    source_raw_count = 0
    try:
        with engine.connect() as conn:
            source_raw_count = int(conn.execute(text("SELECT COUNT(*) FROM raw_fixtures")).scalar() or 0)
    except Exception:
        source_raw_count = 0

    run_id = _begin_feature_build_run(
        engine,
        source_raw_count=source_raw_count,
        schema_version=FEATURE_SCHEMA_VERSION,
    )

    _emit_progress(progress_cb, 5, "Ham fixture verisi okunuyor")
    df = build_feature_frame(engine, progress_cb=progress_cb, start_progress=5, end_progress=70)
    if df.empty:
        logger.warning("No features built; raw fixtures may be empty")
        _finish_feature_build_run(
            engine,
            run_id=run_id,
            features_written=0,
            stale_deleted=0,
            status="completed",
            notes="No rows extracted from raw fixtures",
        )
        _emit_progress(progress_cb, 100, "Feature build tamamlandi", {"feature_count": 0})
        return 0

    features_written, stale_deleted = persist_features(
        engine,
        df,
        progress_cb=progress_cb,
        start_progress=70,
        end_progress=95,
        full_rebuild=bool(full_rebuild),
    )
    _finish_feature_build_run(
        engine,
        run_id=run_id,
        features_written=features_written,
        stale_deleted=stale_deleted,
        status="completed",
        notes="full_rebuild" if full_rebuild else "incremental",
    )
    _emit_progress(
        progress_cb,
        100,
        "Feature build tamamlandi",
        {
            "feature_count": int(features_written),
            "stale_deleted": int(stale_deleted),
            "schema_version": FEATURE_SCHEMA_VERSION,
        },
    )
    return int(features_written)



def parse_args():
    parser = argparse.ArgumentParser(description="Build feature table from raw fixtures")
    parser.add_argument("--rebuild", action="store_true", help="Rebuild feature parquet")
    parser.add_argument("--full-rebuild", action="store_true", help="Cleanup stale rows and rebuild all features")
    return parser.parse_args()



def main():
    args = parse_args()
    build_and_persist_features(full_rebuild=bool(args.full_rebuild or args.rebuild))


if __name__ == "__main__":
    main()
