from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field

from app.admin import (
    get_fixtures_paged,
    load_showcase_slider_images,
    load_showcase_sections,
    router as admin_router,
)
from app.ai_commentary import generate_match_commentary
from app.auth import AuthUser, bootstrap_superadmin, consume_ai_credits, get_current_user, router as auth_router
from app.config import get_settings
from app.coupons import admin_router as coupons_admin_router
from app.coupons import router as coupons_router
from app.fixture_board import get_fixture_board_page
from modeling.simulate import simulate_fixture


app = FastAPI(
    title="Football Simulation API",
    description="Monte Carlo simulation for football fixtures using SportMonks v3",
    version="0.1.0",
    default_response_class=ORJSONResponse,
)

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


@app.on_event("startup")
def _bootstrap_auth():
    settings = get_settings()
    bootstrap_superadmin(settings)


@app.get("/")
def root():
    return {"service": "football-simulation-api", "docs": "/docs", "admin_overview": "/admin/overview"}


@app.get("/health")
def health(settings=Depends(get_settings)):
    return {"status": "ok", "dummy_mode": settings.dummy_mode}


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
    except FileNotFoundError as exc:  # model artifacts missing
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc))


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
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc))


# Minimal OpenAPI customisation to surface tags
app.openapi_tags = [
    {
        "name": "simulate",
        "description": "Run Monte Carlo simulation for a fixture_id returning probabilities, scorelines, and goal timing.",
    }
]
