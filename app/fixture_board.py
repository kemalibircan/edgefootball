from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, Optional

from loguru import logger
from sqlalchemy import create_engine, text

from app.config import Settings, get_settings
from sportmonks_client.client import SportMonksClient

FIXTURE_BOARD_CACHE_TABLE = "fixture_board_cache"
FIXTURE_BOARD_REFRESH_RUNS_TABLE = "fixture_board_refresh_runs"
SUPPORTED_GAME_TYPES = {
    "all": None,
    "match_result": "market_match_result_json",
    "first_half": "market_first_half_json",
    "handicap": "market_handicap_json",
    "over_under_25": "market_over_under_25_json",
    "btts": "market_btts_json",
}
DEFAULT_LEAGUE_NAMES = {
    600: "Super Lig",
    564: "La Liga",
    8: "Premier League",
    384: "Serie A",
    2: "Champions League",
    5: "Europa League",
}

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


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.replace(",", ".").replace("%", "").strip()
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _iso_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text_value = str(value).strip()
    return text_value or None


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


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _extract_pages(payload: dict) -> tuple[int, int]:
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


def parse_fixture_cache_league_ids(raw_value: Any) -> list[int]:
    if raw_value is None:
        return sorted(DEFAULT_LEAGUE_NAMES.keys())
    if isinstance(raw_value, (list, tuple, set)):
        values = list(raw_value)
    else:
        values = str(raw_value).split(",")
    parsed: list[int] = []
    seen = set()
    for item in values:
        league_id = _safe_int(item)
        if league_id is None or league_id in seen:
            continue
        seen.add(league_id)
        parsed.append(league_id)
    if not parsed:
        return sorted(DEFAULT_LEAGUE_NAMES.keys())
    return parsed


def get_fixture_cache_league_ids(settings: Settings) -> list[int]:
    return parse_fixture_cache_league_ids(settings.fixture_cache_league_ids)


def probe_configured_leagues(settings: Settings, league_ids: Optional[Iterable[int]] = None) -> dict:
    target_leagues = parse_fixture_cache_league_ids(
        list(league_ids) if league_ids is not None else settings.fixture_cache_league_ids
    )
    client = _build_client(settings)
    items: list[dict] = []
    unavailable_ids: list[int] = []

    for league_id in target_leagues:
        provider_name: Optional[str] = None
        provider_available = False
        try:
            payload = client.get_league(int(league_id), includes=[])
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, dict):
                provider_available = _safe_int(data.get("id")) is not None
                provider_name = str(data.get("name") or "").strip() or None
        except Exception as exc:
            logger.warning(
                "League provider probe failed for league_id={} err={}",
                league_id,
                f"{exc.__class__.__name__}: {exc}",
            )

        if not provider_available:
            unavailable_ids.append(int(league_id))

        items.append(
            {
                "league_id": int(league_id),
                "league_name": str(DEFAULT_LEAGUE_NAMES.get(int(league_id)) or f"League {league_id}"),
                "provider_available": bool(provider_available),
                "provider_name": provider_name,
            }
        )

    return {
        "items": items,
        "unavailable_ids": unavailable_ids,
    }


def resolve_cache_window(
    settings: Settings,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> tuple[date, date]:
    today_utc = datetime.now(timezone.utc).date()
    window_start = date_from or today_utc
    horizon_days = max(0, int(settings.fixture_cache_horizon_days))
    window_end = date_to or (window_start + timedelta(days=horizon_days))
    if window_end < window_start:
        raise ValueError("date_to cannot be earlier than date_from.")
    return window_start, window_end


def ensure_fixture_board_tables(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {FIXTURE_BOARD_CACHE_TABLE} (
                    fixture_id BIGINT PRIMARY KEY,
                    league_id BIGINT NOT NULL,
                    league_name TEXT,
                    event_date DATE NOT NULL,
                    starting_at TIMESTAMPTZ,
                    status TEXT,
                    is_live BOOLEAN NOT NULL DEFAULT FALSE,
                    home_team_id BIGINT,
                    away_team_id BIGINT,
                    home_team_name TEXT,
                    away_team_name TEXT,
                    home_team_logo TEXT,
                    away_team_logo TEXT,
                    home_score INTEGER,
                    away_score INTEGER,
                    match_state TEXT,
                    match_minute INTEGER,
                    match_second INTEGER,
                    match_added_time INTEGER,
                    market_match_result_json JSONB,
                    market_first_half_json JSONB,
                    market_handicap_json JSONB,
                    market_over_under_25_json JSONB,
                    market_btts_json JSONB,
                    extra_market_count INT NOT NULL DEFAULT 0,
                    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
                    source_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {FIXTURE_BOARD_REFRESH_RUNS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    status TEXT NOT NULL,
                    requested_by BIGINT,
                    trigger_type TEXT NOT NULL DEFAULT 'scheduled',
                    date_from DATE,
                    date_to DATE,
                    league_ids_json JSONB,
                    fixtures_upserted INT NOT NULL DEFAULT 0,
                    fixtures_seen INT NOT NULL DEFAULT 0,
                    error TEXT,
                    started_at TIMESTAMPTZ,
                    finished_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_fixture_board_date_league_start
                ON {FIXTURE_BOARD_CACHE_TABLE} (event_date, league_id, starting_at)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_fixture_board_league_start
                ON {FIXTURE_BOARD_CACHE_TABLE} (league_id, starting_at)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_fixture_board_refresh_runs_created
                ON {FIXTURE_BOARD_REFRESH_RUNS_TABLE} (created_at DESC)
                """
            )
        )


def _build_client(settings: Settings) -> SportMonksClient:
    return SportMonksClient(
        api_token=settings.sportmonks_api_token,
        dummy_mode=settings.dummy_mode,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        cache_ttl=settings.cache_ttl_seconds,
        timeout_seconds=settings.sportmonks_timeout_seconds,
    )


def _participant_logo(participant: Optional[dict]) -> Optional[str]:
    if not participant:
        return None
    for key in ("image_path", "logo_path", "image", "logo", "image_url"):
        value = participant.get(key)
        if isinstance(value, str) and value.strip():
            return value
    image = participant.get("image")
    if isinstance(image, dict):
        for key in ("url", "path", "image_path", "logo_path"):
            value = image.get(key)
            if isinstance(value, str) and value.strip():
                return value
    logo = participant.get("logo")
    if isinstance(logo, dict):
        for key in ("url", "path", "image_path", "logo_path"):
            value = logo.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return None


def _extract_participants(data: dict) -> tuple[dict, dict]:
    participants = data.get("participants") or []
    if isinstance(participants, dict):
        participants = participants.get("data") or []
    if not isinstance(participants, list):
        participants = []

    home = next((p for p in participants if (p.get("meta") or {}).get("location") == "home"), None)
    away = next((p for p in participants if (p.get("meta") or {}).get("location") == "away"), None)
    if home is None and participants:
        home = participants[0]
    if away is None and len(participants) > 1:
        away = participants[1]
    home = home or {}
    away = away or {}
    return home, away


def _extract_status(data: dict) -> tuple[str, bool]:
    state = data.get("state")
    if isinstance(state, dict):
        status_text = str(state.get("name") or state.get("state") or state.get("short_name") or "").strip()
    else:
        status_text = str(data.get("status") or "").strip()

    status_norm = _normalize_text(status_text)
    is_live = bool(data.get("is_live"))
    if not is_live and status_norm:
        live_tokens = ("live", "inplay", "1st half", "2nd half", "halftime", "extra time")
        is_live = any(token in status_norm for token in live_tokens)
    if not status_text:
        status_text = "scheduled"
    return status_text, is_live


def _extract_league_name(data: dict, league_id: Optional[int]) -> Optional[str]:
    league = data.get("league")
    if isinstance(league, dict):
        league_name = str(league.get("name") or "").strip()
        if league_name:
            return league_name
    if league_id in DEFAULT_LEAGUE_NAMES:
        return DEFAULT_LEAGUE_NAMES[league_id]
    return None


def _to_decimal_odd(value: Any) -> Optional[float]:
    parsed = _safe_float(value)
    if parsed is None or parsed <= 1.0:
        return None
    return float(round(parsed, 2))


def _avg_or_none(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return round(float(sum(values) / len(values)), 2)


def _normalized_market_description(row: dict) -> str:
    return _normalize_text(
        row.get("market_description")
        or row.get("market_name")
        or row.get("market")
        or row.get("market_type")
        or ""
    )


def _normalized_selection_label(row: dict) -> str:
    return _normalize_text(row.get("label") or row.get("name") or row.get("selection") or row.get("outcome") or "")


def _parse_line_value(raw_value: Any) -> tuple[Optional[float], Optional[str]]:
    if raw_value is None:
        return None, None
    text_value = str(raw_value).strip()
    if not text_value:
        return None, None

    parsed = _safe_float(text_value)
    if parsed is not None:
        return float(parsed), text_value

    colon_match = re.search(r"([+-]?\d+(?:\.\d+)?)\s*:\s*([+-]?\d+(?:\.\d+)?)", text_value)
    if colon_match:
        left = _safe_float(colon_match.group(1))
        right = _safe_float(colon_match.group(2))
        if left is not None and right is not None:
            return float(left - right), text_value

    numeric_match = re.search(r"([+-]?\d+(?:\.\d+)?)", text_value)
    if numeric_match:
        parsed = _safe_float(numeric_match.group(1))
        if parsed is not None:
            return float(parsed), text_value

    return None, text_value


def _classify_1x2_outcome(label: str, home_name: str, away_name: str) -> Optional[str]:
    normalized = _normalize_text(label)
    if not normalized:
        return None
    if normalized in {"1", "home", "ev", "ev sahibi"}:
        return "1"
    if normalized in {"x", "draw", "beraberlik", "0"}:
        return "0"
    if normalized in {"2", "away", "deplasman"}:
        return "2"
    if home_name and _normalize_text(home_name) in normalized:
        return "1"
    if away_name and _normalize_text(away_name) in normalized:
        return "2"
    return None


def _classify_btts_outcome(label: str) -> Optional[str]:
    normalized = _normalize_text(label)
    if not normalized:
        return None
    if normalized in {"yes", "var", "evet"} or "yes" in normalized or "var" in normalized:
        return "yes"
    if normalized in {"no", "yok", "hayir", "hayır"} or "no" in normalized or "yok" in normalized:
        return "no"
    return None


def _classify_over_under_outcome(label: str) -> Optional[str]:
    normalized = _normalize_text(label)
    if not normalized:
        return None
    if "over" in normalized or "ust" in normalized or "üst" in normalized:
        return "over"
    if "under" in normalized or "alt" in normalized:
        return "under"
    return None


def _is_match_result_market(description: str) -> bool:
    if not description:
        return False
    positive = ("match winner" in description) or ("fulltime result" in description) or ("full time result" in description)
    negative = (
        "half" in description
        or "handicap" in description
        or "over/under" in description
        or "both teams to score" in description
        or "btts" in description
    )
    return positive and not negative


def _is_first_half_market(description: str) -> bool:
    if not description:
        return False
    return (
        "1st half result" in description
        or "first half result" in description
        or "half time result" in description
        or "halftime result" in description
    )


def _is_handicap_market(description: str) -> bool:
    return "handicap" in description if description else False


def _is_over_under_market(description: str) -> bool:
    if not description:
        return False
    return "over/under" in description or "total goals" in description


def _is_btts_market(description: str) -> bool:
    if not description:
        return False
    return "both teams to score" in description or "btts" in description


def _build_odds_markets(odds_rows: list[dict], home_name: str, away_name: str) -> dict:
    match_result: dict[str, list[float]] = {"1": [], "0": [], "2": []}
    first_half: dict[str, list[float]] = {"1": [], "0": [], "2": []}
    handicap_by_line: dict[str, dict[str, Any]] = {}
    over_under_by_line: dict[str, dict[str, Any]] = {}
    btts: dict[str, list[float]] = {"yes": [], "no": []}
    mapped_count = 0

    for row in odds_rows:
        if not isinstance(row, dict):
            continue
        odd_value = _to_decimal_odd(row.get("value") or row.get("odd") or row.get("odds"))
        if odd_value is None:
            continue

        description = _normalized_market_description(row)
        label = _normalized_selection_label(row)
        line_value, line_raw = _parse_line_value(row.get("line") or row.get("handicap") or row.get("total"))

        if _is_match_result_market(description):
            outcome = _classify_1x2_outcome(label, home_name=home_name, away_name=away_name)
            if outcome:
                match_result[outcome].append(odd_value)
                mapped_count += 1
            continue

        if _is_first_half_market(description):
            outcome = _classify_1x2_outcome(label, home_name=home_name, away_name=away_name)
            if outcome:
                first_half[outcome].append(odd_value)
                mapped_count += 1
            continue

        if _is_handicap_market(description):
            line_key = line_raw or str(line_value if line_value is not None else "0")
            if line_key not in handicap_by_line:
                handicap_by_line[line_key] = {
                    "line_raw": line_raw or line_key,
                    "line_value": line_value,
                    "1": [],
                    "0": [],
                    "2": [],
                }
            outcome = _classify_1x2_outcome(label, home_name=home_name, away_name=away_name)
            if outcome:
                handicap_by_line[line_key][outcome].append(odd_value)
                mapped_count += 1
            continue

        if _is_over_under_market(description):
            outcome = _classify_over_under_outcome(label)
            inferred_line_value = line_value
            inferred_line_raw = line_raw
            if inferred_line_value is None:
                match = re.search(r"([0-9]+(?:\.[0-9]+)?)", label)
                if match:
                    inferred_line_value = _safe_float(match.group(1))
                    inferred_line_raw = match.group(1)
            line_key = inferred_line_raw or str(inferred_line_value if inferred_line_value is not None else "2.5")
            if line_key not in over_under_by_line:
                over_under_by_line[line_key] = {
                    "line_raw": inferred_line_raw or line_key,
                    "line_value": inferred_line_value,
                    "over": [],
                    "under": [],
                }
            if outcome:
                over_under_by_line[line_key][outcome].append(odd_value)
                mapped_count += 1
            continue

        if _is_btts_market(description):
            outcome = _classify_btts_outcome(label)
            if outcome:
                btts[outcome].append(odd_value)
                mapped_count += 1
            continue

    def _pack_1x2(payload: dict[str, list[float]]) -> Optional[dict]:
        out = {"1": _avg_or_none(payload["1"]), "0": _avg_or_none(payload["0"]), "2": _avg_or_none(payload["2"])}
        if all(value is None for value in out.values()):
            return None
        return out

    def _pick_handicap_market() -> Optional[dict]:
        if not handicap_by_line:
            return None
        candidates: list[dict] = []
        for data in handicap_by_line.values():
            outcomes = {
                "1": _avg_or_none(data["1"]),
                "0": _avg_or_none(data["0"]),
                "2": _avg_or_none(data["2"]),
            }
            coverage = sum(1 for value in outcomes.values() if value is not None)
            if coverage == 0:
                continue
            line_val = data.get("line_value")
            line_distance = abs(line_val) if line_val is not None else 999.0
            candidates.append(
                {
                    "line": data.get("line_raw"),
                    "line_distance": line_distance,
                    "coverage": coverage,
                    **outcomes,
                }
            )
        if not candidates:
            return None
        candidates.sort(key=lambda item: (-item["coverage"], item["line_distance"], str(item.get("line") or "")))
        best = candidates[0]
        return {"line": best.get("line"), "1": best.get("1"), "0": best.get("0"), "2": best.get("2")}

    def _pick_over_under_market() -> Optional[dict]:
        if not over_under_by_line:
            return None
        candidates: list[dict] = []
        for data in over_under_by_line.values():
            over = _avg_or_none(data["over"])
            under = _avg_or_none(data["under"])
            if over is None and under is None:
                continue
            line_val = data.get("line_value")
            distance = abs(line_val - 2.5) if line_val is not None else 999.0
            candidates.append(
                {
                    "line": data.get("line_raw"),
                    "line_value": line_val,
                    "distance": distance,
                    "over": over,
                    "under": under,
                }
            )
        if not candidates:
            return None
        candidates.sort(key=lambda item: (item["distance"], str(item.get("line") or "")))
        best = candidates[0]
        line_display = best.get("line")
        if not line_display and best.get("line_value") is not None:
            line_display = str(best["line_value"])
        return {"line": line_display, "under": best.get("under"), "over": best.get("over")}

    market_match_result = _pack_1x2(match_result)
    market_first_half = _pack_1x2(first_half)
    market_handicap = _pick_handicap_market()
    market_over_under = _pick_over_under_market()
    market_btts = {"yes": _avg_or_none(btts["yes"]), "no": _avg_or_none(btts["no"])}
    if all(value is None for value in market_btts.values()):
        market_btts = None

    total_rows = len([row for row in odds_rows if isinstance(row, dict)])
    extra_market_count = max(0, total_rows - mapped_count)
    return {
        "market_match_result_json": market_match_result,
        "market_first_half_json": market_first_half,
        "market_handicap_json": market_handicap,
        "market_over_under_25_json": market_over_under,
        "market_btts_json": market_btts,
        "extra_market_count": extra_market_count,
    }


def _feature_score(row: dict, now_utc: datetime) -> float:
    completeness = 0
    for key in (
        "market_match_result_json",
        "market_first_half_json",
        "market_handicap_json",
        "market_over_under_25_json",
        "market_btts_json",
    ):
        if row.get(key):
            completeness += 1
    dt = row.get("starting_at")
    if not isinstance(dt, datetime):
        return float(completeness * 100)
    delta_hours = abs((dt - now_utc).total_seconds()) / 3600.0
    return float(completeness * 100) - min(72.0, delta_hours)


def _resolve_featured_fixture_ids(rows: list[dict], now_utc: datetime) -> set[int]:
    candidates: list[dict] = []
    for row in rows:
        fixture_id = _safe_int(row.get("fixture_id"))
        starting_at = row.get("starting_at")
        if fixture_id is None:
            continue
        if isinstance(starting_at, datetime) and starting_at < now_utc - timedelta(hours=3):
            continue
        candidates.append({**row, "_score": _feature_score(row, now_utc)})
    candidates.sort(
        key=lambda item: (
            -float(item.get("_score") or 0.0),
            item.get("starting_at") or now_utc + timedelta(days=10),
            int(item.get("fixture_id")),
        )
    )
    return {int(item["fixture_id"]) for item in candidates[:4]}


def _extract_scores(data: dict) -> tuple[Optional[int], Optional[int]]:
    """Extract home and away scores from fixture data."""
    scores = data.get("scores")
    if not scores:
        return None, None
    
    if isinstance(scores, dict):
        scores = scores.get("data") or []
    if not isinstance(scores, list):
        return None, None
    
    home_score = None
    away_score = None
    
    # Look for current score or full-time score
    for score_item in scores:
        if not isinstance(score_item, dict):
            continue
        description = str(score_item.get("description") or "").lower()
        type_name = str(score_item.get("type", {}).get("name") if isinstance(score_item.get("type"), dict) else "").lower()
        
        # Prefer current score, fallback to FT
        if "current" in description or "current" in type_name:
            home_score = _safe_int(score_item.get("score", {}).get("participant") if score_item.get("score", {}).get("goals") is None else score_item.get("score", {}).get("goals"))
            away_score = _safe_int(score_item.get("score", {}).get("participant") if score_item.get("score", {}).get("goals") is None else score_item.get("score", {}).get("goals"))
            if home_score is not None or away_score is not None:
                break
        elif "ft" in description or "fulltime" in description or "full time" in type_name:
            if home_score is None:  # Only use FT if we don't have current
                home_score = _safe_int(score_item.get("score", {}).get("participant") if score_item.get("score", {}).get("goals") is None else score_item.get("score", {}).get("goals"))
                away_score = _safe_int(score_item.get("score", {}).get("participant") if score_item.get("score", {}).get("goals") is None else score_item.get("score", {}).get("goals"))
    
    # Alternative: try to get scores from participant scores
    if home_score is None and away_score is None:
        for score_item in scores:
            if not isinstance(score_item, dict):
                continue
            participant_id = _safe_int(score_item.get("participant_id"))
            score_value = _safe_int(score_item.get("score", {}).get("goals") if isinstance(score_item.get("score"), dict) else None)
            if participant_id and score_value is not None:
                # We need to match this with participant IDs, but for simplicity, 
                # assume first is home, second is away
                if home_score is None:
                    home_score = score_value
                elif away_score is None:
                    away_score = score_value
    
    return home_score, away_score


def _extract_state(data: dict) -> tuple[Optional[str], Optional[int], Optional[int], Optional[int]]:
    """Extract match state information (state name, minute, second, added time)."""
    state = data.get("state")
    if not state:
        return None, None, None, None
    
    if isinstance(state, dict):
        state = state.get("data") or state
    
    if not isinstance(state, dict):
        return None, None, None, None
    
    state_name = state.get("state") or state.get("name")
    minute = _safe_int(state.get("minute"))
    second = _safe_int(state.get("second"))
    added_time = _safe_int(state.get("added_time"))
    
    return state_name, minute, second, added_time


def _build_fixture_board_row(fixture: dict, refreshed_at: datetime) -> Optional[dict]:
    data = fixture.get("data") if isinstance(fixture.get("data"), dict) else fixture
    if not isinstance(data, dict):
        return None
    fixture_id = _safe_int(data.get("id"))
    if fixture_id is None:
        return None

    starting_at = _parse_datetime(data.get("starting_at"))
    event_date = starting_at.date() if starting_at else datetime.now(timezone.utc).date()
    league_id = _safe_int(data.get("league_id"))
    home, away = _extract_participants(data)
    status_text, is_live = _extract_status(data)
    home_score, away_score = _extract_scores(data)
    match_state, match_minute, match_second, match_added_time = _extract_state(data)

    odds_rows = data.get("odds") or []
    if isinstance(odds_rows, dict):
        odds_rows = odds_rows.get("data") or []
    if not isinstance(odds_rows, list):
        odds_rows = []

    odds_payload = _build_odds_markets(
        odds_rows=odds_rows,
        home_name=str(home.get("name") or ""),
        away_name=str(away.get("name") or ""),
    )

    row = {
        "fixture_id": fixture_id,
        "league_id": league_id,
        "league_name": _extract_league_name(data, league_id),
        "event_date": event_date,
        "starting_at": starting_at,
        "status": status_text,
        "is_live": bool(is_live),
        "home_team_id": _safe_int(home.get("id")),
        "away_team_id": _safe_int(away.get("id")),
        "home_team_name": str(home.get("name") or "Home"),
        "away_team_name": str(away.get("name") or "Away"),
        "home_team_logo": _participant_logo(home),
        "away_team_logo": _participant_logo(away),
        "home_score": home_score,
        "away_score": away_score,
        "match_state": match_state,
        "match_minute": match_minute,
        "match_second": match_second,
        "match_added_time": match_added_time,
        "market_match_result_json": odds_payload.get("market_match_result_json"),
        "market_first_half_json": odds_payload.get("market_first_half_json"),
        "market_handicap_json": odds_payload.get("market_handicap_json"),
        "market_over_under_25_json": odds_payload.get("market_over_under_25_json"),
        "market_btts_json": odds_payload.get("market_btts_json"),
        "extra_market_count": int(odds_payload.get("extra_market_count") or 0),
        "is_featured": False,
        "source_refreshed_at": refreshed_at,
    }
    return row


def _insert_run(conn, *, trigger_type: str, requested_by: Optional[int], date_from: date, date_to: date, league_ids: list[int], started_at: datetime) -> int:
    row = conn.execute(
        text(
            f"""
            INSERT INTO {FIXTURE_BOARD_REFRESH_RUNS_TABLE} (
                status, requested_by, trigger_type, date_from, date_to, league_ids_json,
                fixtures_upserted, fixtures_seen, started_at, created_at
            )
            VALUES (
                'running', :requested_by, :trigger_type, :date_from, :date_to, CAST(:league_ids_json AS JSONB),
                0, 0, :started_at, :created_at
            )
            RETURNING id
            """
        ),
        {
            "requested_by": requested_by,
            "trigger_type": trigger_type,
            "date_from": date_from,
            "date_to": date_to,
            "league_ids_json": json.dumps(league_ids),
            "started_at": started_at,
            "created_at": started_at,
        },
    ).mappings().first()
    return int(row["id"])


def _finish_run(
    conn,
    run_id: int,
    *,
    status: str,
    fixtures_upserted: int,
    fixtures_seen: int,
    finished_at: datetime,
    error: Optional[str] = None,
) -> None:
    conn.execute(
        text(
            f"""
            UPDATE {FIXTURE_BOARD_REFRESH_RUNS_TABLE}
            SET status = :status,
                fixtures_upserted = :fixtures_upserted,
                fixtures_seen = :fixtures_seen,
                error = :error,
                finished_at = :finished_at
            WHERE id = :run_id
            """
        ),
        {
            "run_id": int(run_id),
            "status": status,
            "fixtures_upserted": int(fixtures_upserted),
            "fixtures_seen": int(fixtures_seen),
            "error": error,
            "finished_at": finished_at,
        },
    )


def refresh_fixture_board_cache(
    *,
    settings: Optional[Settings] = None,
    trigger_type: str = "scheduled",
    requested_by: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    league_ids: Optional[Iterable[int]] = None,
    progress_cb: ProgressCallback = None,
) -> dict:
    resolved_settings = settings or get_settings()
    target_leagues = parse_fixture_cache_league_ids(list(league_ids) if league_ids is not None else resolved_settings.fixture_cache_league_ids)
    window_start, window_end = resolve_cache_window(resolved_settings, date_from=date_from, date_to=date_to)
    engine = create_engine(resolved_settings.db_url)
    ensure_fixture_board_tables(engine)

    started_at = datetime.now(timezone.utc)
    run_id = None
    with engine.begin() as conn:
        run_id = _insert_run(
            conn,
            trigger_type=trigger_type,
            requested_by=requested_by,
            date_from=window_start,
            date_to=window_end,
            league_ids=target_leagues,
            started_at=started_at,
        )

    fixtures_seen = 0
    rows: list[dict] = []
    client = _build_client(resolved_settings)
    total_days = max(1, (window_end - window_start).days + 1)
    current_day = window_start
    day_index = 0

    try:
        _emit_progress(progress_cb, 5, "Fixture cache refresh basladi")
        while current_day <= window_end:
            day_index += 1
            day_progress_base = 8 + int((day_index / total_days) * 45)
            _emit_progress(
                progress_cb,
                day_progress_base,
                f"{current_day.isoformat()} tarihli maclar cekiliyor",
                {"date": current_day.isoformat()},
            )
            page = 1
            while True:
                payload = client.get_fixtures_by_date(
                    current_day,
                    includes=["participants", "odds", "scores", "state", "league"],
                    page=page,
                    per_page=100,
                )
                fixture_items = payload.get("data") or []
                if not isinstance(fixture_items, list):
                    fixture_items = []
                for fixture in fixture_items:
                    if not isinstance(fixture, dict):
                        continue
                    fixtures_seen += 1
                    fixture_league_id = _safe_int(fixture.get("league_id"))
                    if fixture_league_id not in target_leagues:
                        continue
                    row = _build_fixture_board_row(fixture, refreshed_at=started_at)
                    if row is None:
                        continue
                    rows.append(row)
                current_page, last_page = _extract_pages(payload)
                pagination = payload.get("pagination") or (payload.get("meta") or {}).get("pagination") or {}
                has_more = bool(pagination.get("has_more"))
                if has_more:
                    page = current_page + 1
                    continue
                if current_page >= last_page:
                    break
                page += 1
            current_day = current_day + timedelta(days=1)

        now_utc = datetime.now(timezone.utc)
        featured_ids = _resolve_featured_fixture_ids(rows, now_utc=now_utc)
        for row in rows:
            row["is_featured"] = int(row["fixture_id"]) in featured_ids

        _emit_progress(
            progress_cb,
            65,
            "Fixture cache tablosu guncelleniyor",
            {"fixtures_seen": fixtures_seen, "fixtures_upserted": len(rows)},
        )

        with engine.begin() as conn:
            upsert_sql = text(
                f"""
                INSERT INTO {FIXTURE_BOARD_CACHE_TABLE} (
                    fixture_id, league_id, league_name, event_date, starting_at, status, is_live,
                    home_team_id, away_team_id, home_team_name, away_team_name, home_team_logo, away_team_logo,
                    home_score, away_score, match_state, match_minute, match_second, match_added_time,
                    market_match_result_json, market_first_half_json, market_handicap_json,
                    market_over_under_25_json, market_btts_json, extra_market_count, is_featured,
                    source_refreshed_at, created_at, updated_at
                )
                VALUES (
                    :fixture_id, :league_id, :league_name, :event_date, :starting_at, :status, :is_live,
                    :home_team_id, :away_team_id, :home_team_name, :away_team_name, :home_team_logo, :away_team_logo,
                    :home_score, :away_score, :match_state, :match_minute, :match_second, :match_added_time,
                    CAST(:market_match_result_json AS JSONB), CAST(:market_first_half_json AS JSONB),
                    CAST(:market_handicap_json AS JSONB), CAST(:market_over_under_25_json AS JSONB),
                    CAST(:market_btts_json AS JSONB), :extra_market_count, :is_featured,
                    :source_refreshed_at, :created_at, :updated_at
                )
                ON CONFLICT (fixture_id) DO UPDATE SET
                    league_id = EXCLUDED.league_id,
                    league_name = EXCLUDED.league_name,
                    event_date = EXCLUDED.event_date,
                    starting_at = EXCLUDED.starting_at,
                    status = EXCLUDED.status,
                    is_live = EXCLUDED.is_live,
                    home_team_id = EXCLUDED.home_team_id,
                    away_team_id = EXCLUDED.away_team_id,
                    home_team_name = EXCLUDED.home_team_name,
                    away_team_name = EXCLUDED.away_team_name,
                    home_team_logo = EXCLUDED.home_team_logo,
                    away_team_logo = EXCLUDED.away_team_logo,
                    home_score = EXCLUDED.home_score,
                    away_score = EXCLUDED.away_score,
                    match_state = EXCLUDED.match_state,
                    match_minute = EXCLUDED.match_minute,
                    match_second = EXCLUDED.match_second,
                    match_added_time = EXCLUDED.match_added_time,
                    market_match_result_json = EXCLUDED.market_match_result_json,
                    market_first_half_json = EXCLUDED.market_first_half_json,
                    market_handicap_json = EXCLUDED.market_handicap_json,
                    market_over_under_25_json = EXCLUDED.market_over_under_25_json,
                    market_btts_json = EXCLUDED.market_btts_json,
                    extra_market_count = EXCLUDED.extra_market_count,
                    is_featured = EXCLUDED.is_featured,
                    source_refreshed_at = EXCLUDED.source_refreshed_at,
                    updated_at = EXCLUDED.updated_at
                """
            )
            for row in rows:
                conn.execute(
                    upsert_sql,
                    {
                        "fixture_id": row.get("fixture_id"),
                        "league_id": row.get("league_id"),
                        "league_name": row.get("league_name"),
                        "event_date": row.get("event_date"),
                        "starting_at": row.get("starting_at"),
                        "status": row.get("status"),
                        "is_live": bool(row.get("is_live")),
                        "home_team_id": row.get("home_team_id"),
                        "away_team_id": row.get("away_team_id"),
                        "home_team_name": row.get("home_team_name"),
                        "away_team_name": row.get("away_team_name"),
                        "home_team_logo": row.get("home_team_logo"),
                        "away_team_logo": row.get("away_team_logo"),
                        "market_match_result_json": json.dumps(row.get("market_match_result_json"))
                        if row.get("market_match_result_json") is not None
                        else None,
                        "market_first_half_json": json.dumps(row.get("market_first_half_json"))
                        if row.get("market_first_half_json") is not None
                        else None,
                        "market_handicap_json": json.dumps(row.get("market_handicap_json"))
                        if row.get("market_handicap_json") is not None
                        else None,
                        "market_over_under_25_json": json.dumps(row.get("market_over_under_25_json"))
                        if row.get("market_over_under_25_json") is not None
                        else None,
                        "market_btts_json": json.dumps(row.get("market_btts_json"))
                        if row.get("market_btts_json") is not None
                        else None,
                        "extra_market_count": int(row.get("extra_market_count") or 0),
                        "is_featured": bool(row.get("is_featured")),
                        "source_refreshed_at": row.get("source_refreshed_at") or started_at,
                        "created_at": started_at,
                        "updated_at": datetime.now(timezone.utc),
                    },
                )

            conn.execute(
                text(
                    f"""
                    DELETE FROM {FIXTURE_BOARD_CACHE_TABLE}
                    WHERE league_id = ANY(:league_ids)
                      AND (event_date < :date_from OR event_date > :date_to)
                    """
                ),
                {
                    "league_ids": target_leagues,
                    "date_from": window_start,
                    "date_to": window_end,
                },
            )
            _finish_run(
                conn,
                run_id,
                status="completed",
                fixtures_upserted=len(rows),
                fixtures_seen=fixtures_seen,
                finished_at=datetime.now(timezone.utc),
                error=None,
            )

        _emit_progress(
            progress_cb,
            100,
            "Fixture cache refresh tamamlandi",
            {"fixtures_seen": fixtures_seen, "fixtures_upserted": len(rows), "run_id": run_id},
        )
        return {
            "run_id": run_id,
            "status": "completed",
            "fixtures_seen": fixtures_seen,
            "fixtures_upserted": len(rows),
            "date_from": window_start.isoformat(),
            "date_to": window_end.isoformat(),
            "league_ids": target_leagues,
        }
    except Exception as exc:
        logger.exception("Fixture board cache refresh failed: {}", exc)
        with engine.begin() as conn:
            _finish_run(
                conn,
                run_id,
                status="failed",
                fixtures_upserted=len(rows),
                fixtures_seen=fixtures_seen,
                finished_at=datetime.now(timezone.utc),
                error=f"{exc.__class__.__name__}: {exc}",
            )
        raise


def _row_to_summary(row: dict) -> dict:
    dt = row.get("starting_at")
    if isinstance(dt, datetime):
        sort_dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    else:
        parsed = _parse_datetime(row.get("starting_at"))
        sort_dt = parsed or datetime(1970, 1, 1, tzinfo=timezone.utc)
    today_utc = datetime.now(timezone.utc).date()
    return {
        "fixture_id": int(row.get("fixture_id")),
        "league_id": _safe_int(row.get("league_id")),
        "league_name": row.get("league_name"),
        "starting_at": _iso_or_none(sort_dt),
        "home_team_id": _safe_int(row.get("home_team_id")),
        "away_team_id": _safe_int(row.get("away_team_id")),
        "home_team_name": str(row.get("home_team_name") or "Home"),
        "away_team_name": str(row.get("away_team_name") or "Away"),
        "home_team_logo": row.get("home_team_logo"),
        "away_team_logo": row.get("away_team_logo"),
        "match_label": f"{row.get('home_team_name') or 'Home'} vs {row.get('away_team_name') or 'Away'}",
        "is_upcoming": bool(sort_dt.date() >= today_utc),
        "_sort_dt": sort_dt,
    }


def _build_board_where_sql(
    *,
    league_id: Optional[int],
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    upcoming_only: bool,
    game_type: str,
    featured_only: bool,
) -> tuple[str, dict]:
    where_parts: list[str] = []
    params: dict[str, Any] = {}
    today_utc = datetime.now(timezone.utc).date()

    if league_id is not None:
        where_parts.append("league_id = :league_id")
        params["league_id"] = int(league_id)
    if upcoming_only:
        where_parts.append("event_date >= :today_utc")
        params["today_utc"] = today_utc
    if date_from is not None:
        where_parts.append("event_date >= :date_from")
        params["date_from"] = date_from
    if date_to is not None:
        where_parts.append("event_date <= :date_to")
        params["date_to"] = date_to
    if q:
        where_parts.append(
            "(LOWER(COALESCE(home_team_name, '')) LIKE :q OR LOWER(COALESCE(away_team_name, '')) LIKE :q OR LOWER(COALESCE(league_name, '')) LIKE :q)"
        )
        params["q"] = f"%{_normalize_text(q)}%"
    if featured_only:
        where_parts.append("is_featured = TRUE")
    game_type_key = str(game_type or "all").strip().lower()
    if game_type_key not in SUPPORTED_GAME_TYPES:
        game_type_key = "all"
    market_col = SUPPORTED_GAME_TYPES[game_type_key]
    if market_col:
        where_parts.append(f"{market_col} IS NOT NULL")

    where_sql = ""
    if where_parts:
        where_sql = "WHERE " + " AND ".join(where_parts)
    return where_sql, params


def load_cached_fixture_summaries(
    settings: Settings,
    *,
    page: int = 1,
    page_size: int = 12,
    limit: Optional[int] = None,
    league_id: Optional[int] = None,
    upcoming_only: bool = True,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = "desc",
) -> dict:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)

    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(limit if limit is not None else page_size), 300))
    where_sql, params = _build_board_where_sql(
        league_id=league_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
        upcoming_only=upcoming_only,
        game_type="all",
        featured_only=False,
    )
    sort_dir = "ASC" if str(sort).lower() == "asc" else "DESC"
    count_sql = text(f"SELECT COUNT(*) FROM {FIXTURE_BOARD_CACHE_TABLE} {where_sql}")
    query_sql = text(
        f"""
        SELECT fixture_id, league_id, league_name, starting_at, home_team_id, away_team_id,
               home_team_name, away_team_name, home_team_logo, away_team_logo
        FROM {FIXTURE_BOARD_CACHE_TABLE}
        {where_sql}
        ORDER BY starting_at {sort_dir}, fixture_id {sort_dir}
        LIMIT :limit OFFSET :offset
        """
    )
    params_count = dict(params)
    params_rows = dict(params)
    params_rows["limit"] = safe_page_size
    params_rows["offset"] = (safe_page - 1) * safe_page_size

    with engine.connect() as conn:
        total = int(conn.execute(count_sql, params_count).scalar_one() or 0)
        rows = conn.execute(query_sql, params_rows).mappings().all()

    items = [_row_to_summary(dict(row)) for row in rows]
    total_pages = max(1, ((total + safe_page_size - 1) // safe_page_size)) if total else 1
    return {
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
        "items": items,
    }


def _row_to_board_item(row: dict) -> dict:
    out = dict(row)
    for key in (
        "market_match_result_json",
        "market_first_half_json",
        "market_handicap_json",
        "market_over_under_25_json",
        "market_btts_json",
    ):
        value = out.get(key)
        if isinstance(value, str):
            try:
                out[key] = json.loads(value)
            except Exception:
                out[key] = None
    out["fixture_id"] = _safe_int(out.get("fixture_id"))
    out["league_id"] = _safe_int(out.get("league_id"))
    out["home_team_id"] = _safe_int(out.get("home_team_id"))
    out["away_team_id"] = _safe_int(out.get("away_team_id"))
    out["extra_market_count"] = int(out.get("extra_market_count") or 0)
    out["is_featured"] = bool(out.get("is_featured"))
    out["is_live"] = bool(out.get("is_live"))
    out["event_date"] = _iso_or_none(out.get("event_date"))
    out["starting_at"] = _iso_or_none(out.get("starting_at"))
    out["source_refreshed_at"] = _iso_or_none(out.get("source_refreshed_at"))
    out["match_label"] = f"{out.get('home_team_name') or 'Home'} vs {out.get('away_team_name') or 'Away'}"
    
    # Add scores if available
    if out.get("home_score") is not None or out.get("away_score") is not None:
        out["scores"] = {
            "home_score": out.get("home_score"),
            "away_score": out.get("away_score"),
        }
    
    # Add state if available
    if out.get("match_state") or out.get("match_minute") is not None:
        out["state"] = {
            "state": out.get("match_state"),
            "minute": out.get("match_minute"),
            "second": out.get("match_second"),
            "added_time": out.get("match_added_time"),
        }
    
    out["markets"] = {
        "match_result": out.get("market_match_result_json"),
        "first_half": out.get("market_first_half_json"),
        "handicap": out.get("market_handicap_json"),
        "over_under_25": out.get("market_over_under_25_json"),
        "btts": out.get("market_btts_json"),
    }
    return out


def get_fixture_board_page(
    settings: Settings,
    *,
    page: int = 1,
    page_size: int = 40,
    league_id: Optional[int] = None,
    q: Optional[str] = None,
    target_date: Optional[date] = None,
    sort: str = "asc",
    game_type: str = "all",
    featured_only: bool = False,
) -> dict:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)
    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 200))

    where_sql, params = _build_board_where_sql(
        league_id=league_id,
        q=q,
        date_from=target_date,
        date_to=target_date,
        upcoming_only=target_date is None,
        game_type=game_type,
        featured_only=featured_only,
    )
    sort_dir = "ASC" if str(sort).lower() == "asc" else "DESC"

    count_sql = text(f"SELECT COUNT(*) FROM {FIXTURE_BOARD_CACHE_TABLE} {where_sql}")
    query_sql = text(
        f"""
        SELECT fixture_id, league_id, league_name, event_date, starting_at, status, is_live,
               home_team_id, away_team_id, home_team_name, away_team_name, home_team_logo, away_team_logo,
               home_score, away_score, match_state, match_minute, match_second, match_added_time,
               market_match_result_json, market_first_half_json, market_handicap_json,
               market_over_under_25_json, market_btts_json, extra_market_count, is_featured, source_refreshed_at
        FROM {FIXTURE_BOARD_CACHE_TABLE}
        {where_sql}
        ORDER BY is_live DESC, event_date {sort_dir}, starting_at {sort_dir}, fixture_id {sort_dir}
        LIMIT :limit OFFSET :offset
        """
    )
    params_count = dict(params)
    params_rows = dict(params)
    params_rows["limit"] = safe_page_size
    params_rows["offset"] = (safe_page - 1) * safe_page_size

    with engine.connect() as conn:
        total = int(conn.execute(count_sql, params_count).scalar_one() or 0)
        rows = conn.execute(query_sql, params_rows).mappings().all()

    items = [_row_to_board_item(dict(row)) for row in rows]
    total_pages = max(1, ((total + safe_page_size - 1) // safe_page_size)) if total else 1
    return {
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
        "sort": "asc" if sort_dir == "ASC" else "desc",
        "game_type": str(game_type or "all").strip().lower(),
        "featured_only": bool(featured_only),
        "items": items,
    }


def get_fixture_cache_status(settings: Settings, *, validate_provider: bool = False) -> dict:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)
    window_start, window_end = resolve_cache_window(settings)
    now_utc = datetime.now(timezone.utc)
    configured_league_ids = get_fixture_cache_league_ids(settings)

    latest_run = None
    latest_success = None
    with engine.connect() as conn:
        latest_run = conn.execute(
            text(
                f"""
                SELECT id, status, requested_by, trigger_type, date_from, date_to, league_ids_json,
                       fixtures_upserted, fixtures_seen, error, started_at, finished_at, created_at
                FROM {FIXTURE_BOARD_REFRESH_RUNS_TABLE}
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        ).mappings().first()
        latest_success = conn.execute(
            text(
                f"""
                SELECT id, status, requested_by, trigger_type, date_from, date_to, league_ids_json,
                       fixtures_upserted, fixtures_seen, error, started_at, finished_at, created_at
                FROM {FIXTURE_BOARD_REFRESH_RUNS_TABLE}
                WHERE status = 'completed'
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        ).mappings().first()
        cached_total = int(conn.execute(text(f"SELECT COUNT(*) FROM {FIXTURE_BOARD_CACHE_TABLE}")).scalar_one() or 0)
        window_total = int(
            conn.execute(
                text(
                    f"""
                    SELECT COUNT(*)
                    FROM {FIXTURE_BOARD_CACHE_TABLE}
                    WHERE event_date >= :date_from AND event_date <= :date_to
                    """
                ),
                {"date_from": window_start, "date_to": window_end},
            ).scalar_one()
            or 0
        )
        max_source_refreshed_at = conn.execute(
            text(f"SELECT MAX(source_refreshed_at) FROM {FIXTURE_BOARD_CACHE_TABLE}")
        ).scalar_one()

    stale = True
    if latest_success and latest_success.get("finished_at"):
        finished_at = latest_success["finished_at"]
        if isinstance(finished_at, datetime):
            if finished_at.tzinfo is None:
                finished_at = finished_at.replace(tzinfo=timezone.utc)
            stale = (now_utc - finished_at) > timedelta(hours=30)

    payload = {
        "stale": stale,
        "window_date_from": window_start.isoformat(),
        "window_date_to": window_end.isoformat(),
        "cached_total": cached_total,
        "window_total": window_total,
        "max_source_refreshed_at": _iso_or_none(max_source_refreshed_at),
        "latest_run": {key: _iso_or_none(value) if isinstance(value, (datetime, date)) else value for key, value in dict(latest_run).items()}
        if latest_run
        else None,
        "latest_success_run": {
            key: _iso_or_none(value) if isinstance(value, (datetime, date)) else value for key, value in dict(latest_success).items()
        }
        if latest_success
        else None,
    }

    if bool(validate_provider):
        payload["configured_league_ids"] = configured_league_ids
        payload["provider_validation"] = probe_configured_leagues(settings, configured_league_ids)

    return payload
