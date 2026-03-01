import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.admin import (
    SHOWCASE_SECTION_POPULAR_ODDS,
    get_fixtures_paged,
    load_showcase_slider_images,
    load_showcase_sections,
    replace_showcase_section_rows,
    router as admin_router,
    require_admin,
    require_superadmin,
)
from app.ai_commentary import generate_match_commentary
from app.auth import AuthUser, bootstrap_superadmin, consume_ai_credits, get_current_user, router as auth_router
from app.blog import admin_router as blog_admin_router
from app.blog import router as blog_router
from app.config import get_settings
from app.coupons import admin_router as coupons_admin_router
from app.coupons import router as coupons_router
from app.fixture_board import (
    FIXTURE_BOARD_CACHE_TABLE,
    ensure_fixture_board_tables,
    extract_fixture_markets_from_payload,
    get_fixture_board_page,
)
from app.image_generation import generate_slider_images_batch, generate_match_based_slider_images
from app.scheduler import start_scheduler, stop_scheduler
from app.seo import router as seo_router
from sportmonks_client.client import SportMonksClient
from modeling.simulate import simulate_fixture


app = FastAPI(
    title="Football Simulation API",
    description="Monte Carlo simulation for football fixtures using SportMonks v3",
    version="0.1.0",
    default_response_class=ORJSONResponse,
)
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://0.0.0.0:3001",
    ],
    # Local development hosts (localhost + private LAN IPs)
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(coupons_router)
app.include_router(coupons_admin_router)
app.include_router(blog_router)
app.include_router(blog_admin_router)
app.include_router(seo_router)


@app.on_event("startup")
def _bootstrap_auth():
    settings = get_settings()
    bootstrap_superadmin(settings)
    start_scheduler()


@app.on_event("shutdown")
def _shutdown_scheduler():
    stop_scheduler()


@app.get("/")
def root():
    return {"service": "football-simulation-api", "docs": "/docs", "admin_overview": "/admin/overview"}


@app.get("/health")
def health(settings=Depends(get_settings)):
    registered_paths = {getattr(route, "path", "") for route in app.routes if getattr(route, "path", None)}
    capabilities = {
        "blog_public": "/blog/posts" in registered_paths,
        "predictions_public": "/predictions/public" in registered_paths,
        "fixture_detail_public": "/fixtures/public/{fixture_id}" in registered_paths,
    }
    return {"status": "ok", "dummy_mode": settings.dummy_mode, "capabilities": capabilities}


@app.get("/showcase/public")
def showcase_public(settings=Depends(get_settings)):
    return load_showcase_sections(settings=settings, include_inactive=False)


@app.get("/slider/public")
def slider_public(settings=Depends(get_settings)):
    return load_showcase_slider_images(settings=settings, include_inactive=False)


@app.get("/fixtures/public")
def fixtures_public(
    page: int = 1,
    page_size: int = 12,
    league_id: Optional[int] = None,
    upcoming_only: bool = True,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = "desc",
    settings=Depends(get_settings),
):
    return get_fixtures_paged(
        page=page,
        page_size=page_size,
        league_id=league_id,
        upcoming_only=upcoming_only,
        q=q,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
        settings=settings,
    )


@app.get("/fixtures/public/today")
def fixtures_public_today(
    page: int = 1,
    page_size: int = 12,
    league_id: Optional[int] = None,
    q: Optional[str] = None,
    sort: str = "asc",
    day: Optional[date] = None,
    settings=Depends(get_settings),
):
    target_day = day or date.today()
    payload = get_fixtures_paged(
        page=page,
        page_size=page_size,
        league_id=league_id,
        upcoming_only=False,
        q=q,
        date_from=target_day,
        date_to=target_day,
        sort=sort,
        settings=settings,
    )
    payload["day"] = target_day.isoformat()
    return payload


def _to_int_or_none(value):
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_iso_value(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _json_object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None


def _slugify_text(value: str) -> str:
    lowered = str(value or "").strip().lower()
    if not lowered:
        return "match"
    slug = re.sub(r"[^a-z0-9]+", "-", lowered)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug or "match"


def _extract_payload_data(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {}
    data = payload.get("data")
    if isinstance(data, dict):
        return data
    return payload


def _extract_payload_participants(data: dict) -> tuple[dict, dict]:
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
    return home or {}, away or {}


def _extract_payload_scores(data: dict) -> tuple[Optional[int], Optional[int]]:
    home_score = _to_int_or_none(data.get("home_score"))
    away_score = _to_int_or_none(data.get("away_score"))

    scores_payload = data.get("scores")
    score_rows = []
    if isinstance(scores_payload, dict):
        if isinstance(scores_payload.get("data"), list):
            score_rows = scores_payload.get("data") or []
        else:
            score_rows = [scores_payload]
    elif isinstance(scores_payload, list):
        score_rows = scores_payload

    for row in score_rows:
        if home_score is not None and away_score is not None:
            break
        if not isinstance(row, dict):
            continue
        participant = str((row.get("participant") or row.get("team") or {}).get("location") or "").strip().lower()
        score_value = _to_int_or_none(row.get("score") or row.get("goals"))
        if score_value is None:
            score_obj = row.get("score")
            if isinstance(score_obj, dict):
                score_value = _to_int_or_none(score_obj.get("goals"))
        if score_value is None:
            continue
        if participant == "home" and home_score is None:
            home_score = score_value
        elif participant == "away" and away_score is None:
            away_score = score_value

    return home_score, away_score


def _fixture_detail_from_cache(settings, fixture_id: int) -> Optional[dict]:
    engine = create_engine(settings.db_url)
    ensure_fixture_board_tables(engine)
    query = text(
        f"""
        SELECT fixture_id, league_id, league_name, event_date, starting_at, status, is_live,
               home_team_id, away_team_id, home_team_name, away_team_name, home_team_logo, away_team_logo,
               home_score, away_score, match_state, match_minute, match_second, match_added_time,
               market_match_result_json, market_first_half_json, market_handicap_json,
               market_over_under_25_json, market_btts_json
        FROM {FIXTURE_BOARD_CACHE_TABLE}
        WHERE fixture_id = :fixture_id
        LIMIT 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query, {"fixture_id": int(fixture_id)}).mappings().first()
    if not row:
        return None

    out = dict(row)
    home_name = str(out.get("home_team_name") or "Home").strip()
    away_name = str(out.get("away_team_name") or "Away").strip()
    match_label = f"{home_name} vs {away_name}"
    return {
        "fixture_id": int(out.get("fixture_id") or fixture_id),
        "league_id": _to_int_or_none(out.get("league_id")),
        "league_name": out.get("league_name"),
        "event_date": _to_iso_value(out.get("event_date")),
        "starting_at": _to_iso_value(out.get("starting_at")),
        "status": out.get("status"),
        "is_live": bool(out.get("is_live")),
        "home_team_id": _to_int_or_none(out.get("home_team_id")),
        "away_team_id": _to_int_or_none(out.get("away_team_id")),
        "home_team_name": home_name,
        "away_team_name": away_name,
        "home_team_logo": out.get("home_team_logo"),
        "away_team_logo": out.get("away_team_logo"),
        "match_label": match_label,
        "slug": _slugify_text(match_label),
        "scores": {
            "home_score": _to_int_or_none(out.get("home_score")),
            "away_score": _to_int_or_none(out.get("away_score")),
        },
        "state": {
            "state": out.get("match_state"),
            "minute": _to_int_or_none(out.get("match_minute")),
            "second": _to_int_or_none(out.get("match_second")),
            "added_time": _to_int_or_none(out.get("match_added_time")),
        },
        "markets": {
            "match_result": _json_object(out.get("market_match_result_json")),
            "first_half": _json_object(out.get("market_first_half_json")),
            "handicap": _json_object(out.get("market_handicap_json")),
            "over_under_25": _json_object(out.get("market_over_under_25_json")),
            "btts": _json_object(out.get("market_btts_json")),
        },
        "source": "fixture_board_cache",
    }


def _load_fixture_payload_for_markets(settings, fixture_id: int) -> tuple[dict, str]:
    query = text(
        """
        SELECT payload
        FROM raw_fixtures
        WHERE fixture_id = :fixture_id
        LIMIT 1
        """
    )
    raw_payload = None
    try:
        engine = create_engine(settings.db_url)
        with engine.connect() as conn:
            row = conn.execute(query, {"fixture_id": int(fixture_id)}).mappings().first()
            raw_payload = row.get("payload") if row else None
    except SQLAlchemyError as exc:
        logger.warning("Fixture markets raw_fixtures read failed fixture_id={} err={}", fixture_id, exc)

    if isinstance(raw_payload, dict):
        return dict(raw_payload), "raw_fixtures"

    client = SportMonksClient(
        api_token=settings.sportmonks_api_token,
        dummy_mode=settings.dummy_mode,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        cache_ttl=settings.cache_ttl_seconds,
        timeout_seconds=settings.sportmonks_timeout_seconds,
    )
    payload = client.get_fixture(
        int(fixture_id),
        includes=["participants", "scores", "odds"],
    ).model_dump(mode="json")
    return payload, "sportmonks"


def _fixture_detail_from_payload(payload: dict, fixture_id: int, source: str) -> Optional[dict]:
    data = _extract_payload_data(payload)
    if not isinstance(data, dict) or not data:
        return None

    home, away = _extract_payload_participants(data)
    home_name = str(home.get("name") or data.get("home_team_name") or "Home").strip()
    away_name = str(away.get("name") or data.get("away_team_name") or "Away").strip()
    home_score, away_score = _extract_payload_scores(data)
    league = data.get("league") if isinstance(data.get("league"), dict) else {}
    state = data.get("state") if isinstance(data.get("state"), dict) else {}
    status = str(state.get("name") or state.get("state") or data.get("status") or "scheduled").strip()
    status_norm = status.lower()
    is_live = bool(data.get("is_live")) or any(
        token in status_norm for token in ("live", "inplay", "1st half", "2nd half", "extra time", "halftime")
    )
    starting_at = data.get("starting_at") or data.get("starting_at_at")
    event_date = data.get("event_date")
    if not event_date and starting_at:
        event_date = str(starting_at)[:10]
    match_label = f"{home_name} vs {away_name}"
    parsed_markets = extract_fixture_markets_from_payload(payload, odds_policy="max")

    return {
        "fixture_id": int(fixture_id),
        "league_id": _to_int_or_none(data.get("league_id") or league.get("id")),
        "league_name": league.get("name") or data.get("league_name"),
        "event_date": _to_iso_value(event_date),
        "starting_at": _to_iso_value(starting_at),
        "status": status,
        "is_live": is_live,
        "home_team_id": _to_int_or_none(home.get("id") or data.get("home_team_id")),
        "away_team_id": _to_int_or_none(away.get("id") or data.get("away_team_id")),
        "home_team_name": home_name,
        "away_team_name": away_name,
        "home_team_logo": home.get("image_path") or home.get("logo_path") or data.get("home_team_logo"),
        "away_team_logo": away.get("image_path") or away.get("logo_path") or data.get("away_team_logo"),
        "match_label": match_label,
        "slug": _slugify_text(match_label),
        "scores": {
            "home_score": home_score,
            "away_score": away_score,
        },
        "state": {
            "state": state.get("state") or state.get("name"),
            "minute": _to_int_or_none(state.get("minute")),
            "second": _to_int_or_none(state.get("second")),
            "added_time": _to_int_or_none(state.get("added_time")),
        },
        "markets": parsed_markets.get("markets"),
        "source": source,
    }


@app.get("/fixtures/public/{fixture_id}")
def fixtures_public_detail(
    fixture_id: int,
    settings=Depends(get_settings),
):
    if int(fixture_id) <= 0:
        raise HTTPException(status_code=400, detail="fixture_id must be positive.")

    try:
        cached = _fixture_detail_from_cache(settings, int(fixture_id))
        if cached:
            return cached
    except Exception as exc:
        logger.warning("Fixture detail cache lookup failed fixture_id={} err={}", fixture_id, exc)

    try:
        payload, source = _load_fixture_payload_for_markets(settings, int(fixture_id))
        normalized = _fixture_detail_from_payload(payload, int(fixture_id), source)
        if not normalized:
            raise HTTPException(status_code=404, detail="Fixture not found.")
        return normalized
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc).lower()
        if "404" in message or "not found" in message:
            raise HTTPException(status_code=404, detail="Fixture not found.")
        logger.exception("Fixture detail load failed fixture_id={} err={}", fixture_id, exc)
        raise HTTPException(status_code=502, detail=f"Fixture detail unavailable: {exc}")


@app.get("/fixtures/public/{fixture_id}/markets")
def fixtures_public_markets(
    fixture_id: int,
    settings=Depends(get_settings),
):
    if int(fixture_id) <= 0:
        raise HTTPException(status_code=400, detail="fixture_id must be positive.")
    try:
        payload, source = _load_fixture_payload_for_markets(settings, fixture_id=int(fixture_id))
        parsed = extract_fixture_markets_from_payload(payload, odds_policy="max")
        now_utc = datetime.now(timezone.utc)
        return {
            "fixture_id": int(fixture_id),
            "markets": parsed.get("markets"),
            "extra_market_count": int(parsed.get("extra_market_count") or 0),
            "meta": {
                "odds_policy": "max",
                "source": source,
                "odds_row_count": int(parsed.get("odds_row_count") or 0),
                "fetched_at": now_utc.isoformat(),
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Fixture markets fetch failed fixture_id={} err={}", fixture_id, exc)
        raise HTTPException(status_code=502, detail=f"Fixture markets unavailable: {exc}")


@app.get("/fixtures/board")
def fixtures_board_public(
    page: int = 1,
    page_size: int = 40,
    league_id: Optional[int] = None,
    q: Optional[str] = None,
    target_date: Optional[date] = None,
    sort: str = "asc",
    game_type: str = "all",
    featured_only: bool = False,
    settings=Depends(get_settings),
):
    return get_fixture_board_page(
        settings=settings,
        page=page,
        page_size=page_size,
        league_id=league_id,
        q=q,
        target_date=target_date,
        sort=sort,
        game_type=game_type,
        featured_only=featured_only,
    )


@app.get("/simulate")
def simulate(
    fixture_id: int,
    model_id: Optional[str] = None,
    settings=Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        result = simulate_fixture(fixture_id=fixture_id, settings=settings, model_id=model_id)
        credits_remaining = consume_ai_credits(settings=settings, user_id=current_user.id, reason="simulate")
        result["credits_remaining"] = credits_remaining
        return result
    except HTTPException:
        raise
    except FileNotFoundError as exc:  # model artifacts missing / league model not found
        _detail = _league_model_error_detail(exc)
        raise HTTPException(status_code=503, detail=_detail)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc))


def _league_model_error_detail(exc: FileNotFoundError) -> str:
    """Turn league/model FileNotFoundError into a user- and admin-friendly API message."""
    msg = str(exc).strip()
    if "No ready/default model found for league" in msg or "No trained models available" in msg:
        return (
            msg + " "
            "An admin can run POST /admin/tasks/bootstrap-league-models to create league models."
        )
    return msg


class CommentaryRequest(BaseModel):
    fixture_id: int
    model_id: Optional[str] = None
    language: str = Field(default="tr", max_length=8)


@app.post("/ai/commentary")
def ai_commentary(
    request: CommentaryRequest,
    settings=Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        simulation = simulate_fixture(
            fixture_id=request.fixture_id,
            settings=settings,
            model_id=request.model_id,
        )
        llm_output = generate_match_commentary(
            settings=settings,
            fixture_id=request.fixture_id,
            simulation_result=simulation,
            language=request.language,
        )
        credits_remaining = consume_ai_credits(settings=settings, user_id=current_user.id, reason="ai_commentary")
        return {
            "fixture_id": request.fixture_id,
            "model": simulation.get("model"),
            "simulation": {
                "outcomes": simulation.get("outcomes"),
                "lambda_home": simulation.get("lambda_home"),
                "lambda_away": simulation.get("lambda_away"),
                "top_scorelines": simulation.get("top_scorelines", [])[:5],
            },
            "commentary": llm_output.get("commentary"),
            "provider": llm_output.get("provider"),
            "provider_model": llm_output.get("model"),
            "provider_error": llm_output.get("provider_error"),
            "odds_summary": llm_output.get("odds_summary"),
            "web_news": llm_output.get("web_news", []),
            "analysis_table": llm_output.get("analysis_table", []),
            "credits_remaining": credits_remaining,
        }
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        _detail = _league_model_error_detail(exc)
        raise HTTPException(status_code=503, detail=_detail)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc))


class SliderGenerationRequest(BaseModel):
    count: int = Field(default=3, ge=1, le=5)
    custom_prompts: Optional[list[str]] = None


@app.post("/admin/slider/generate")
async def generate_slider_images_endpoint(
    request: SliderGenerationRequest,
    settings=Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    """Generate slider images using DALL-E 3."""
    try:
        results = await generate_slider_images_batch(count=request.count, settings=settings)
        return {
            "success": True,
            "generated": len(results),
            "images": [
                {
                    "url": img["relative_url"],
                    "prompt": img["prompt"],
                    "metadata": img["metadata"],
                }
                for img in results
            ],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/admin/slider/generate-with-matches")
async def generate_match_slider_images_endpoint(
    settings=Depends(get_settings),
    current_user: AuthUser = Depends(require_superadmin),
):
    """Generate slider images based on today's matches with odds and AI predictions."""
    try:
        results = await generate_match_based_slider_images(settings=settings)
        return {
            "success": True,
            "generated": len(results),
            "images": [
                {
                    "url": img["relative_url"],
                    "prompt": img["prompt"],
                    "metadata": img["metadata"],
                }
                for img in results
            ],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class DailyHighlightsResponse(BaseModel):
    fixtures: list[dict]
    generated_at: str
    highlights_count: int


@app.post("/admin/daily-highlights/generate")
async def generate_daily_highlights_endpoint(
    target_date: Optional[date] = None,
    settings=Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    """Generate AI-powered daily highlights section."""
    target = target_date or date.today()
    
    try:
        fixtures_payload = get_fixtures_paged(
            page=1,
            page_size=20,
            league_id=None,
            upcoming_only=False,
            date_from=target,
            date_to=target,
            sort="desc",
            settings=settings,
        )

        featured_fixtures = []
        showcase_rows = []

        def _parse_positive_odd(value) -> Optional[float]:
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                return None
            if parsed <= 1:
                return None
            return parsed

        for fixture in fixtures_payload.get("items", []):
            if len(featured_fixtures) >= 4:
                break

            markets = fixture.get("markets") or {}
            match_result = markets.get("match_result") or {}
            if not isinstance(match_result, dict):
                continue

            odd_home = _parse_positive_odd(match_result.get("1", match_result.get("home")))
            odd_draw = _parse_positive_odd(match_result.get("0", match_result.get("draw")))
            odd_away = _parse_positive_odd(match_result.get("2", match_result.get("away")))
            if odd_home is None or odd_draw is None or odd_away is None:
                continue

            fixture_id_raw = fixture.get("fixture_id")
            try:
                fixture_id = int(fixture_id_raw) if fixture_id_raw is not None else None
            except (TypeError, ValueError):
                fixture_id = None

            home_team_name = str(fixture.get("home_team_name") or fixture.get("home_team") or "").strip()
            away_team_name = str(fixture.get("away_team_name") or fixture.get("away_team") or "").strip()
            if not home_team_name or not away_team_name:
                continue

            featured_fixtures.append(
                {
                    "fixture_id": fixture_id,
                    "home_team": home_team_name,
                    "away_team": away_team_name,
                    "league": fixture.get("league_name") or fixture.get("league"),
                    "starting_at": fixture.get("starting_at"),
                    "odds": {"home": odd_home, "draw": odd_draw, "away": odd_away},
                }
            )

            showcase_rows.append(
                {
                    "fixture_id": fixture_id,
                    "home_team_name": home_team_name,
                    "away_team_name": away_team_name,
                    "home_team_logo": fixture.get("home_team_logo"),
                    "away_team_logo": fixture.get("away_team_logo"),
                    "kickoff_at": fixture.get("starting_at"),
                    "odd_home": odd_home,
                    "odd_draw": odd_draw,
                    "odd_away": odd_away,
                    "model_score_home": None,
                    "model_score_away": None,
                    "display_order": len(showcase_rows),
                    "is_active": True,
                }
            )

        replace_showcase_section_rows(
            settings=settings,
            section_key=SHOWCASE_SECTION_POPULAR_ODDS,
            rows=showcase_rows,
            actor_user_id=int(current_user.id),
        )

        return {
            "success": True,
            "date": target.isoformat(),
            "fixtures": featured_fixtures,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "highlights_count": len(featured_fixtures),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class OddsAnalysisResponse(BaseModel):
    analysis: str
    value_bets: list[dict]
    trends: list[dict]
    generated_at: str


@app.post("/admin/odds-analysis/generate")
async def generate_odds_analysis_endpoint(
    target_date: Optional[date] = None,
    settings=Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    """AI analysis of current odds."""
    target = target_date or date.today()
    
    try:
        fixtures_payload = get_fixture_board_page(
            settings=settings,
            page=1,
            page_size=50,
            target_date=target,
            featured_only=True,
        )
        
        fixtures_with_odds = [
            f for f in fixtures_payload.get("items", [])
            if f.get("markets") and f.get("markets", {}).get("match_result")
        ][:10]
        
        value_bets = []
        for fixture in fixtures_with_odds:
            odds = fixture.get("markets", {}).get("match_result", {})
            if odds:
                home_odd = odds.get("home")
                draw_odd = odds.get("draw")
                away_odd = odds.get("away")
                
                if all([home_odd, draw_odd, away_odd]):
                    value_bets.append({
                        "fixture_id": fixture["id"],
                        "home_team": fixture["home_team"],
                        "away_team": fixture["away_team"],
                        "odds": {"1": home_odd, "X": draw_odd, "2": away_odd},
                        "league": fixture.get("league", {}).get("name"),
                    })
        
        analysis_text = "AI odds analysis will be generated here using OpenAI."
        
        return {
            "success": True,
            "date": target.isoformat(),
            "analysis": analysis_text,
            "value_bets": value_bets,
            "trends": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# Minimal OpenAPI customisation to surface tags
app.openapi_tags = [
    {
        "name": "simulate",
        "description": "Run Monte Carlo simulation for a fixture_id returning probabilities, scorelines, and goal timing.",
    }
]
