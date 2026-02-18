from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai_commentary import generate_match_commentary
from app.auth import AuthUser, consume_ai_credits, get_current_user, resolve_credit_cost
from app.chat_history import (
    create_chat_message,
    get_chat_thread_by_id,
    get_latest_chat_thread_by_fixture,
    list_chat_messages,
    list_chat_threads,
    search_chat_fixtures,
    update_chat_thread_last_message,
    upsert_chat_thread,
)
from app.config import Settings, get_settings
from app.coupon_builder import (
    append_generated_insight,
    cleanup_expired_coupon_runs,
    create_coupon_run,
    create_saved_coupon,
    delete_saved_coupon,
    find_generated_coupon_match,
    get_cached_generated_insight,
    list_saved_coupons,
    load_coupon_run_by_task,
    set_saved_coupon_status,
    set_coupon_run_status,
    set_coupon_run_task_id,
    update_saved_coupon_name,
)
from app.fixture_board import parse_fixture_cache_league_ids
from modeling.simulate import simulate_fixture
from worker.celery_app import celery_app, generate_coupons_task

_COUPON_AUTH_DEP = [Depends(get_current_user)]
router = APIRouter(prefix="/coupons", tags=["coupons"], dependencies=_COUPON_AUTH_DEP)
admin_router = APIRouter(prefix="/admin/coupons", tags=["coupons"], dependencies=_COUPON_AUTH_DEP)


class CouponGenerateRequest(BaseModel):
    days_window: int = Field(default=3, ge=2, le=3)
    matches_per_coupon: int = Field(default=3, ge=3, le=4)
    league_ids: Optional[list[int]] = None
    model_id: Optional[str] = Field(default=None, max_length=120)
    bankroll_tl: float = Field(default=1000, ge=100, le=10_000_000)
    include_math_coupons: bool = True


class CouponTaskInfo(BaseModel):
    task_id: str
    state: str
    progress: int
    stage: str
    result: Any = None


class CouponMatchInsightRequest(BaseModel):
    source: str = Field(pattern="^(generated|manual)$")
    task_id: Optional[str] = Field(default=None, max_length=200)
    fixture_id: int
    selection: Optional[str] = Field(default=None, pattern="^(1|0|2)$")
    model_id: Optional[str] = Field(default=None, max_length=120)
    language: str = Field(default="tr", max_length=8)


class CouponSavedItem(BaseModel):
    fixture_id: int
    home_team_name: str = Field(min_length=1, max_length=120)
    away_team_name: str = Field(min_length=1, max_length=120)
    home_team_logo: Optional[str] = Field(default=None, max_length=1000)
    away_team_logo: Optional[str] = Field(default=None, max_length=1000)
    starting_at: Optional[str] = Field(default=None, max_length=120)
    selection: str = Field(min_length=1, max_length=40)
    odd: float = Field(gt=1.0, le=1000.0)
    league_id: Optional[int] = None
    league_name: Optional[str] = Field(default=None, max_length=120)
    market_key: Optional[str] = Field(default=None, max_length=32)
    market_label: Optional[str] = Field(default=None, max_length=64)
    line: Optional[str] = Field(default=None, max_length=24)
    selection_display: Optional[str] = Field(default=None, max_length=64)


class CouponSavedSummary(BaseModel):
    coupon_count: int = Field(default=1, ge=1, le=999)
    stake: float = Field(default=50, ge=1, le=1_000_000)
    total_odds: float = Field(ge=1.0, le=1_000_000.0)
    coupon_amount: float = Field(ge=0.0, le=1_000_000_000.0)
    max_win: float = Field(ge=0.0, le=1_000_000_000.0)


class CouponSaveRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    risk_level: Optional[str] = Field(default=None, pattern="^(low|medium|high|manual)$")
    source_task_id: Optional[str] = Field(default=None, max_length=200)
    items: list[CouponSavedItem] = Field(min_length=1, max_length=20)
    summary: CouponSavedSummary


class CouponRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CouponSavedStatusResponse(BaseModel):
    ok: bool
    coupon_id: int
    status: str


class ChatMessageCreateRequest(BaseModel):
    thread_id: Optional[int] = Field(default=None, ge=1)
    fixture_id: Optional[int] = None
    home_team_name: Optional[str] = Field(default=None, max_length=120)
    away_team_name: Optional[str] = Field(default=None, max_length=120)
    match_label: Optional[str] = Field(default=None, max_length=240)
    source: str = Field(default="manual", pattern="^(generated|manual)$")
    task_id: Optional[str] = Field(default=None, max_length=200)
    selection: Optional[str] = Field(default=None, pattern="^(1|0|2)$")
    model_id: Optional[str] = Field(default=None, max_length=120)
    question: str = Field(min_length=1, max_length=5000)
    language: str = Field(default="tr", max_length=8)
    new_session: bool = False


def _coupon_library_row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    items = row.get("items_json")
    summary = row.get("summary_json")
    if not isinstance(items, list):
        items = []
    if not isinstance(summary, dict):
        summary = {}
    return {
        "id": int(row.get("id") or 0),
        "name": str(row.get("name") or "Kupon"),
        "status": str(row.get("status") or "active"),
        "risk_level": row.get("risk_level"),
        "source_task_id": row.get("source_task_id"),
        "items": items,
        "summary": summary,
        "created_at": _to_iso(row.get("created_at")),
        "updated_at": _to_iso(row.get("updated_at")),
        "archived_at": _to_iso(row.get("archived_at")),
    }


def _to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(value)


def _best_selection_from_outcomes(outcomes: dict[str, Any]) -> Optional[str]:
    values = {
        "1": float(outcomes.get("home_win") or 0.0),
        "0": float(outcomes.get("draw") or 0.0),
        "2": float(outcomes.get("away_win") or 0.0),
    }
    if not values:
        return None
    return max(values, key=lambda key: values[key])


def _resolve_coupon_match_insight(
    request: CouponMatchInsightRequest,
    *,
    settings: Settings,
    current_user: AuthUser,
    consume_manual_credit: bool = True,
    user_question: Optional[str] = None,
) -> dict[str, Any]:
    source = str(request.source or "").strip().lower()
    if source not in {"generated", "manual"}:
        raise HTTPException(status_code=400, detail="source generated veya manual olmalidir.")

    if source == "generated":
        has_user_question = bool(str(user_question or "").strip())
        cleanup_expired_coupon_runs(settings)
        if not request.task_id:
            raise HTTPException(status_code=400, detail="Generated insight icin task_id zorunludur.")
        run = load_coupon_run_by_task(settings, task_id=request.task_id, user_id=current_user.id)
        if not run:
            raise HTTPException(status_code=404, detail="Kupon task bulunamadi.")
        if str(run.get("status")) != "completed":
            raise HTTPException(status_code=409, detail="Kupon task henuz tamamlanmadi.")

        effective_selection = request.selection
        match_item = find_generated_coupon_match(
            run.get("result_json"),
            fixture_id=int(request.fixture_id),
            selection=effective_selection,
        )
        if not match_item:
            raise HTTPException(status_code=404, detail="Bu fixture generated kupon sonucunda bulunamadi.")
        if effective_selection is None:
            effective_selection = str(match_item.get("selection") or "")

        cached = get_cached_generated_insight(
            run.get("result_json"),
            fixture_id=int(request.fixture_id),
            selection=effective_selection,
        )
        if isinstance(cached, dict) and not has_user_question:
            cached_copy = dict(cached)
            cached_copy["cached"] = True
            return cached_copy

        simulation_summary = match_item.get("simulation_summary")
        if (not isinstance(simulation_summary, dict) or not simulation_summary.get("outcomes")) and isinstance(cached, dict):
            cached_simulation = cached.get("simulation_summary")
            if isinstance(cached_simulation, dict) and cached_simulation.get("outcomes"):
                simulation_summary = cached_simulation
        if not isinstance(simulation_summary, dict) or not simulation_summary.get("outcomes"):
            simulation_summary = simulate_fixture(
                fixture_id=int(request.fixture_id),
                settings=settings,
                model_id=request.model_id,
            )

        commentary_payload = generate_match_commentary(
            settings=settings,
            fixture_id=int(request.fixture_id),
            simulation_result=simulation_summary,
            language=request.language,
            user_question=user_question,
        )
        model_payload = simulation_summary.get("model") if isinstance(simulation_summary, dict) else {}
        if not isinstance(model_payload, dict):
            model_payload = {}
        insight_payload = {
            "source": "generated",
            "fixture_id": int(request.fixture_id),
            "selection": effective_selection,
            "model_id": model_payload.get("model_id"),
            "model_name": model_payload.get("model_name"),
            "model_selection_mode": model_payload.get("selection_mode"),
            "simulation_summary": simulation_summary,
            "commentary": commentary_payload.get("commentary"),
            "provider": commentary_payload.get("provider"),
            "provider_error": commentary_payload.get("provider_error"),
            "analysis_table": commentary_payload.get("analysis_table", []),
            "odds_summary": commentary_payload.get("odds_summary"),
            "cached": False,
        }
        if not has_user_question:
            append_generated_insight(
                settings,
                run_id=int(run["id"]),
                fixture_id=int(request.fixture_id),
                selection=effective_selection,
                insight_payload=insight_payload,
            )
        return insight_payload

    simulation = simulate_fixture(
        fixture_id=int(request.fixture_id),
        settings=settings,
        model_id=request.model_id,
    )
    commentary_payload = generate_match_commentary(
        settings=settings,
        fixture_id=int(request.fixture_id),
        simulation_result=simulation,
        language=request.language,
        user_question=user_question,
    )
    model_payload = simulation.get("model") if isinstance(simulation, dict) else {}
    if not isinstance(model_payload, dict):
        model_payload = {}
    payload = {
        "source": "manual",
        "fixture_id": int(request.fixture_id),
        "selection": request.selection or _best_selection_from_outcomes(simulation.get("outcomes") or {}),
        "model_id": model_payload.get("model_id"),
        "model_name": model_payload.get("model_name"),
        "model_selection_mode": model_payload.get("selection_mode"),
        "simulation_summary": simulation,
        "commentary": commentary_payload.get("commentary"),
        "provider": commentary_payload.get("provider"),
        "provider_error": commentary_payload.get("provider_error"),
        "analysis_table": commentary_payload.get("analysis_table", []),
        "odds_summary": commentary_payload.get("odds_summary"),
        "cached": False,
    }
    if consume_manual_credit:
        credits_remaining = consume_ai_credits(settings=settings, user_id=current_user.id, reason="ai_commentary")
        payload["credits_remaining"] = int(credits_remaining)
    return payload


@router.post("/generate")
@admin_router.post("/generate")
def generate_coupons(
    request: CouponGenerateRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    cleanup_expired_coupon_runs(settings)
    credit_cost = resolve_credit_cost(settings, "coupon_generate")
    consume_ai_credits(settings=settings, user_id=current_user.id, reason="coupon_generate")

    resolved_leagues = parse_fixture_cache_league_ids(
        request.league_ids if request.league_ids is not None else settings.fixture_cache_league_ids
    )
    run_payload = {
        "days_window": int(request.days_window),
        "matches_per_coupon": int(request.matches_per_coupon),
        "league_ids": resolved_leagues,
        "model_id": request.model_id,
        "bankroll_tl": float(request.bankroll_tl),
        "include_math_coupons": bool(request.include_math_coupons),
    }
    created = create_coupon_run(
        settings,
        user_id=current_user.id,
        request_payload=run_payload,
        credit_charged=credit_cost,
    )
    run_id = int(created.get("id") or 0)
    if run_id <= 0:
        raise HTTPException(status_code=500, detail="Kupon run kaydi olusturulamadi.")

    try:
        task = generate_coupons_task.delay(run_id)
        set_coupon_run_task_id(settings, run_id=run_id, task_id=str(task.id))
    except Exception as exc:
        set_coupon_run_status(
            settings,
            run_id=run_id,
            status="failed",
            error=f"TaskQueueError: {exc}",
            finished_at=datetime.now(timezone.utc),
        )
        raise HTTPException(status_code=500, detail=f"Kupon task kuyruga alinamadi: {exc}") from exc

    return {
        "run_id": run_id,
        "task_id": str(task.id),
        "credit_charged": int(credit_cost),
        "expires_at": _to_iso(created.get("expires_at")),
        "status": "queued",
    }


@router.get("/tasks/{task_id}", response_model=CouponTaskInfo)
@admin_router.get("/tasks/{task_id}", response_model=CouponTaskInfo)
def get_coupon_task(
    task_id: str,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    cleanup_expired_coupon_runs(settings)
    run = load_coupon_run_by_task(settings, task_id=task_id, user_id=current_user.id)
    if not run:
        raise HTTPException(status_code=404, detail="Kupon task bulunamadi.")

    async_result = AsyncResult(task_id, app=celery_app)
    raw_meta = async_result.info if isinstance(async_result.info, dict) else {}
    progress = int(raw_meta.get("progress") or (100 if async_result.ready() else 5))
    stage = str(raw_meta.get("stage") or run.get("status") or async_result.state)
    result_payload = run.get("result_json") if run.get("status") == "completed" else None

    return CouponTaskInfo(
        task_id=task_id,
        state=async_result.state,
        progress=max(0, min(progress, 100)),
        stage=stage,
        result=result_payload,
    )


@router.post("/saved")
@admin_router.post("/saved")
def save_coupon(
    request: CouponSaveRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    name = str(request.name or "").strip()
    if not name:
        label = {"low": "Dusuk Riskli Kupon", "medium": "Orta Riskli Kupon", "high": "Cok Riskli Kupon"}.get(
            request.risk_level or "",
            "Kupon",
        )
        name = f"{label} {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"
    row = create_saved_coupon(
        settings,
        user_id=current_user.id,
        name=name,
        items=[item.model_dump() for item in request.items],
        summary=request.summary.model_dump(),
        risk_level=request.risk_level,
        source_task_id=request.source_task_id,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Kupon kaydi olusturulamadi.")
    return _coupon_library_row_to_payload(row)


@router.get("/saved")
@admin_router.get("/saved")
def get_saved_coupons(
    archived: bool = False,
    limit: int = 50,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    status = "archived" if bool(archived) else "active"
    rows = list_saved_coupons(settings, user_id=current_user.id, status=status, limit=limit)
    return {
        "items": [_coupon_library_row_to_payload(row) for row in rows],
        "total": len(rows),
        "status": status,
    }


@router.patch("/saved/{coupon_id}")
@admin_router.patch("/saved/{coupon_id}")
def rename_saved_coupon(
    coupon_id: int,
    request: CouponRenameRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    name = str(request.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Kupon adi bos olamaz.")

    row = update_saved_coupon_name(
        settings,
        user_id=current_user.id,
        coupon_id=int(coupon_id),
        name=name,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Kupon bulunamadi.")
    return _coupon_library_row_to_payload(row)


@router.post("/saved/{coupon_id}/archive", response_model=CouponSavedStatusResponse)
@admin_router.post("/saved/{coupon_id}/archive", response_model=CouponSavedStatusResponse)
def archive_saved_coupon_endpoint(
    coupon_id: int,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    updated = set_saved_coupon_status(settings, user_id=current_user.id, coupon_id=int(coupon_id), status="archived")
    if not updated:
        raise HTTPException(status_code=404, detail="Kupon bulunamadi.")
    return CouponSavedStatusResponse(ok=True, coupon_id=int(coupon_id), status="archived")


@router.post("/saved/{coupon_id}/restore", response_model=CouponSavedStatusResponse)
@admin_router.post("/saved/{coupon_id}/restore", response_model=CouponSavedStatusResponse)
def restore_saved_coupon_endpoint(
    coupon_id: int,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    updated = set_saved_coupon_status(settings, user_id=current_user.id, coupon_id=int(coupon_id), status="active")
    if not updated:
        raise HTTPException(status_code=404, detail="Kupon bulunamadi.")
    return CouponSavedStatusResponse(ok=True, coupon_id=int(coupon_id), status="active")


@router.delete("/saved/{coupon_id}", response_model=CouponSavedStatusResponse)
@admin_router.delete("/saved/{coupon_id}", response_model=CouponSavedStatusResponse)
def delete_saved_coupon_endpoint(
    coupon_id: int,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    deleted = delete_saved_coupon(settings, user_id=current_user.id, coupon_id=int(coupon_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Kupon bulunamadi.")
    return CouponSavedStatusResponse(ok=True, coupon_id=int(coupon_id), status="deleted")


@router.post("/match-insight")
@admin_router.post("/match-insight")
def get_coupon_match_insight(
    request: CouponMatchInsightRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    return _resolve_coupon_match_insight(
        request=request,
        settings=settings,
        current_user=current_user,
        consume_manual_credit=True,
        user_question=None,
    )


@router.get("/chat/threads")
@admin_router.get("/chat/threads")
def get_chat_threads(
    limit: int = 50,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    items = list_chat_threads(settings, user_id=current_user.id, limit=limit)
    return {
        "items": items,
        "total": len(items),
    }


@router.get("/chat/threads/{thread_id}/messages")
@admin_router.get("/chat/threads/{thread_id}/messages")
def get_chat_thread_messages(
    thread_id: int,
    limit: int = 100,
    before_id: Optional[int] = None,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    thread = get_chat_thread_by_id(settings, thread_id=int(thread_id), user_id=current_user.id)
    if not thread:
        raise HTTPException(status_code=404, detail="Chat thread bulunamadi.")
    items = list_chat_messages(
        settings,
        thread_id=int(thread_id),
        user_id=current_user.id,
        limit=limit,
        before_id=before_id,
    )
    return {
        "thread": thread,
        "items": items,
        "total": len(items),
    }


@router.get("/chat/fixtures/search")
@admin_router.get("/chat/fixtures/search")
def get_chat_fixture_search(
    q: str = "",
    limit: int = 20,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    _ = current_user  # Explicit auth use.
    items = search_chat_fixtures(settings, q=q, limit=limit)
    return {
        "q": str(q or ""),
        "items": items,
        "total": len(items),
    }


@router.post("/chat/messages")
@admin_router.post("/chat/messages")
def create_chat_message_endpoint(
    request: ChatMessageCreateRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(get_current_user),
):
    question = str(request.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question zorunludur.")

    thread = None
    thread_from_request = None
    if request.thread_id is not None:
        thread_from_request = get_chat_thread_by_id(settings, thread_id=int(request.thread_id), user_id=current_user.id)
        if not thread_from_request:
            raise HTTPException(status_code=404, detail="Chat thread bulunamadi.")

    fixture_id = int(request.fixture_id) if request.fixture_id is not None else None
    home_team_name = str(request.home_team_name or "").strip()
    away_team_name = str(request.away_team_name or "").strip()
    match_label = str(request.match_label or "").strip()

    if request.new_session:
        if fixture_id is None and thread_from_request is not None:
            fixture_id = int(thread_from_request.get("fixture_id") or 0) or None
            if not home_team_name:
                home_team_name = str(thread_from_request.get("home_team_name") or "").strip()
            if not away_team_name:
                away_team_name = str(thread_from_request.get("away_team_name") or "").strip()
            if not match_label:
                match_label = str(thread_from_request.get("match_label") or "").strip()

        if fixture_id is None:
            raise HTTPException(status_code=400, detail="new_session icin fixture_id veya gecerli thread_id zorunludur.")

        if thread_from_request is not None and int(thread_from_request.get("fixture_id") or 0) != int(fixture_id):
            raise HTTPException(status_code=400, detail="thread_id ve fixture_id uyusmuyor.")

        if not match_label and home_team_name and away_team_name:
            match_label = f"{home_team_name} - {away_team_name}"
        thread = upsert_chat_thread(
            settings,
            user_id=current_user.id,
            fixture_id=int(fixture_id),
            home_team_name=home_team_name or None,
            away_team_name=away_team_name or None,
            match_label=match_label or None,
            last_message_at=datetime.now(timezone.utc),
        )
    else:
        if thread_from_request is not None:
            thread = thread_from_request
        else:
            if fixture_id is None:
                raise HTTPException(status_code=400, detail="thread_id yoksa fixture_id zorunludur.")
            thread = get_latest_chat_thread_by_fixture(
                settings,
                user_id=current_user.id,
                fixture_id=int(fixture_id),
            )
            if not thread:
                if not match_label and home_team_name and away_team_name:
                    match_label = f"{home_team_name} - {away_team_name}"
                thread = upsert_chat_thread(
                    settings,
                    user_id=current_user.id,
                    fixture_id=int(fixture_id),
                    home_team_name=home_team_name or None,
                    away_team_name=away_team_name or None,
                    match_label=match_label or None,
                    last_message_at=datetime.now(timezone.utc),
                )

        if fixture_id is not None and int(fixture_id) != int(thread.get("fixture_id") or 0):
            raise HTTPException(status_code=400, detail="thread_id ve fixture_id uyusmuyor.")

    if not thread:
        raise HTTPException(status_code=500, detail="Chat thread olusturulamadi.")

    thread_id = int(thread.get("id") or 0)
    if thread_id <= 0:
        raise HTTPException(status_code=500, detail="Chat thread kimligi gecersiz.")

    user_message_meta = {
        "source": request.source,
        "fixture_id": int(thread.get("fixture_id") or 0),
        "task_id": request.task_id,
        "selection": request.selection,
        "model_id": request.model_id,
        "language": request.language,
    }
    user_message = create_chat_message(
        settings,
        thread_id=thread_id,
        user_id=current_user.id,
        role="user",
        content_markdown=question,
        meta=user_message_meta,
        credit_charged=0,
    )
    update_chat_thread_last_message(settings, thread_id=thread_id, user_id=current_user.id, last_message_at=datetime.now(timezone.utc))

    insight_request = CouponMatchInsightRequest(
        source=request.source,
        task_id=request.task_id,
        fixture_id=int(thread.get("fixture_id") or 0),
        selection=request.selection,
        model_id=request.model_id,
        language=request.language,
    )
    insight_payload = _resolve_coupon_match_insight(
        request=insight_request,
        settings=settings,
        current_user=current_user,
        consume_manual_credit=False,
        user_question=question,
    )

    credits_remaining = consume_ai_credits(settings=settings, user_id=current_user.id, reason="ai_commentary")
    credit_cost = resolve_credit_cost(settings, "ai_commentary")
    commentary_text = str(insight_payload.get("commentary") or "").strip() or "AI yorumu olusturulamadi."
    assistant_message = create_chat_message(
        settings,
        thread_id=thread_id,
        user_id=current_user.id,
        role="assistant",
        content_markdown=commentary_text,
        meta={
            "source": insight_payload.get("source"),
            "fixture_id": int(thread.get("fixture_id") or 0),
            "task_id": request.task_id,
            "selection": insight_payload.get("selection"),
            "model_id": insight_payload.get("model_id"),
            "model_name": insight_payload.get("model_name"),
            "model_selection_mode": insight_payload.get("model_selection_mode"),
            "provider": insight_payload.get("provider"),
            "provider_error": insight_payload.get("provider_error"),
            "analysis_table": insight_payload.get("analysis_table", []),
            "odds_summary": insight_payload.get("odds_summary"),
            "simulation_summary": insight_payload.get("simulation_summary"),
            "cached": bool(insight_payload.get("cached")),
        },
        credit_charged=credit_cost,
    )
    update_chat_thread_last_message(settings, thread_id=thread_id, user_id=current_user.id, last_message_at=datetime.now(timezone.utc))

    refreshed_thread = get_chat_thread_by_id(settings, thread_id=thread_id, user_id=current_user.id) or thread
    return {
        "thread": refreshed_thread,
        "user_message": user_message,
        "assistant_message": assistant_message,
        "insight": {
            "commentary": insight_payload.get("commentary"),
            "analysis_table": insight_payload.get("analysis_table", []),
            "odds_summary": insight_payload.get("odds_summary"),
            "provider": insight_payload.get("provider"),
            "provider_error": insight_payload.get("provider_error"),
            "source": insight_payload.get("source"),
            "fixture_id": insight_payload.get("fixture_id"),
            "selection": insight_payload.get("selection"),
            "model_id": insight_payload.get("model_id"),
            "model_name": insight_payload.get("model_name"),
            "model_selection_mode": insight_payload.get("model_selection_mode"),
            "simulation_summary": insight_payload.get("simulation_summary"),
            "cached": bool(insight_payload.get("cached")),
        },
        "credits_remaining": int(credits_remaining),
    }
