from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from app.config import Settings, get_settings
from app.league_model_routing import resolve_model_for_league
from modeling.simulate import load_models
from modeling.train import (
    LABEL_COLS,
    _apply_probability_calibration,
    _blend_with_market_probs,
    _evaluate_outcome_probability_matrix,
    _extract_market_prob_matrix,
    _prob_matrix_from_lambdas,
    load_training_frame,
)

MODEL_EVALUATIONS_TABLE = "model_evaluations"
ARTIFACT_DIR = Path("artifacts") / "backtests"


def _ensure_model_evaluations_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {MODEL_EVALUATIONS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    model_id TEXT NOT NULL,
                    league_id BIGINT,
                    window_from DATE,
                    window_to DATE,
                    samples INT NOT NULL DEFAULT 0,
                    accuracy DOUBLE PRECISION,
                    brier DOUBLE PRECISION,
                    log_loss DOUBLE PRECISION,
                    calibration_json JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_model_evaluations_model_created
                ON {MODEL_EVALUATIONS_TABLE} (model_id, created_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_model_evaluations_league_created
                ON {MODEL_EVALUATIONS_TABLE} (league_id, created_at DESC)
                """
            )
        )


def _safe_date(value: object) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        if value.tzinfo is None:
            value = value.tz_localize("UTC")
        return value.date().isoformat()
    try:
        parsed = pd.to_datetime(value, errors="coerce", utc=True)
    except Exception:
        parsed = None
    if parsed is None or pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _outcome_index(home_goals: float, away_goals: float) -> int:
    if home_goals > away_goals:
        return 0
    if home_goals < away_goals:
        return 2
    return 1


def _build_calibration_buckets(
    y_home: pd.Series,
    y_away: pd.Series,
    prob_matrix: np.ndarray,
    bucket_count: int = 10,
) -> list[dict]:
    bucket_count = max(2, int(bucket_count))
    buckets = [
        {
            "bucket": idx,
            "start": float(idx / bucket_count),
            "end": float((idx + 1) / bucket_count),
            "count": 0,
            "avg_confidence": 0.0,
            "accuracy": 0.0,
        }
        for idx in range(bucket_count)
    ]

    for home_true, away_true, row in zip(y_home, y_away, prob_matrix):
        probs = np.asarray(row, dtype=float)
        probs = np.clip(probs, 1e-9, 1.0)
        probs = probs / float(np.sum(probs))
        pred_idx = int(np.argmax(probs))
        confidence = float(probs[pred_idx])
        actual_idx = _outcome_index(float(home_true), float(away_true))
        bucket_idx = min(bucket_count - 1, int(confidence * bucket_count))
        bucket = buckets[bucket_idx]
        bucket["count"] += 1
        bucket["avg_confidence"] += confidence
        if pred_idx == actual_idx:
            bucket["accuracy"] += 1.0

    out: list[dict] = []
    for bucket in buckets:
        count = int(bucket["count"])
        if count <= 0:
            continue
        out.append(
            {
                "bucket": int(bucket["bucket"]),
                "start": float(bucket["start"]),
                "end": float(bucket["end"]),
                "count": count,
                "avg_confidence": float(bucket["avg_confidence"] / count),
                "accuracy": float(bucket["accuracy"] / count),
            }
        )
    return out


def _predict_prob_matrix(df_slice: pd.DataFrame, model_home, model_away, model_meta: dict) -> np.ndarray:
    feature_columns = list(model_meta.get("feature_columns") or [])
    if not feature_columns:
        raise ValueError("Model metadata does not contain feature_columns for backtest.")

    X = df_slice[feature_columns].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    pred_home = np.clip(np.asarray(model_home.predict(X), dtype=float), 0.05, 6.5)
    pred_away = np.clip(np.asarray(model_away.predict(X), dtype=float), 0.05, 6.5)

    lambda_cal = model_meta.get("lambda_calibration") or {}
    home_scale = float(lambda_cal.get("home_scale") or 1.0)
    away_scale = float(lambda_cal.get("away_scale") or 1.0)
    if home_scale <= 0:
        home_scale = 1.0
    if away_scale <= 0:
        away_scale = 1.0
    pred_home = np.clip(pred_home * home_scale, 0.05, 6.5)
    pred_away = np.clip(pred_away * away_scale, 0.05, 6.5)

    probs = _prob_matrix_from_lambdas(pred_home, pred_away)
    probs = _apply_probability_calibration(probs, model_meta.get("probability_calibration") or {})

    odds_blend = model_meta.get("odds_blend") or {}
    blend_weight = float(odds_blend.get("weight_model") or 1.0)
    market_probs = _extract_market_prob_matrix(df_slice)
    probs = _blend_with_market_probs(probs, market_probs, weight_model=blend_weight)
    return probs


def _build_windows(df: pd.DataFrame, windows: int, min_window: int) -> list[pd.DataFrame]:
    if df.empty:
        return []
    total = len(df)
    window_count = max(1, int(windows))
    window_size = max(int(min_window), int(total / window_count))
    start = max(0, total - (window_count * window_size))

    slices: list[pd.DataFrame] = []
    cursor = start
    while cursor < total:
        subset = df.iloc[cursor : min(total, cursor + window_size)]
        if subset.empty:
            break
        if len(subset) < 20 and slices:
            break
        slices.append(subset)
        cursor += window_size

    if not slices:
        slices = [df]
    return slices


def run_backtest(
    *,
    settings: Optional[Settings] = None,
    model_id: Optional[str] = None,
    league_id: Optional[int] = None,
    windows: int = 4,
    min_window: int = 120,
    persist: bool = True,
) -> dict:
    settings = settings or get_settings()
    resolved = resolve_model_for_league(
        settings,
        league_id=league_id,
        requested_model_id=model_id,
    )
    resolved_model_id = str(resolved.get("model_id") or "").strip()
    if not resolved_model_id:
        raise FileNotFoundError("Backtest icin model bulunamadi.")

    model_home, model_away, model_meta = load_models(model_id=resolved_model_id)
    frame = load_training_frame(
        league_id=league_id,
        training_mode="latest",
        allow_synthetic_fallback=False,
    )
    frame = frame.dropna(subset=LABEL_COLS).copy()
    if frame.empty:
        raise ValueError("Backtest icin etiketli veri bulunamadi.")
    if "event_date" in frame.columns:
        frame["_event_dt"] = pd.to_datetime(frame["event_date"], errors="coerce", utc=True)
        frame = frame.sort_values(["_event_dt", "fixture_id"], ascending=[True, True], kind="mergesort")
    else:
        frame = frame.sort_values("fixture_id", ascending=True, kind="mergesort")
    frame = frame.reset_index(drop=True)

    windows_df = _build_windows(frame, windows=windows, min_window=min_window)
    rows: list[dict] = []
    sample_weight = 0
    weighted_accuracy = 0.0
    weighted_brier = 0.0
    weighted_log_loss = 0.0

    for idx, df_slice in enumerate(windows_df, start=1):
        y_home = df_slice["label_home_goals"].astype(float).reset_index(drop=True)
        y_away = df_slice["label_away_goals"].astype(float).reset_index(drop=True)
        probs = _predict_prob_matrix(df_slice.reset_index(drop=True), model_home, model_away, model_meta)
        metrics = _evaluate_outcome_probability_matrix(y_home, y_away, probs)
        buckets = _build_calibration_buckets(y_home, y_away, probs)

        window_from = _safe_date(df_slice.iloc[0].get("event_date"))
        window_to = _safe_date(df_slice.iloc[-1].get("event_date"))
        samples = int(metrics.get("samples") or len(df_slice))
        weighted_accuracy += float(metrics.get("accuracy") or 0.0) * samples
        weighted_brier += float(metrics.get("brier") or 0.0) * samples
        weighted_log_loss += float(metrics.get("log_loss") or 0.0) * samples
        sample_weight += samples

        rows.append(
            {
                "window_index": idx,
                "window_from": window_from,
                "window_to": window_to,
                "samples": samples,
                "accuracy": metrics.get("accuracy"),
                "brier": metrics.get("brier"),
                "log_loss": metrics.get("log_loss"),
                "calibration_buckets": buckets,
            }
        )

    summary = {
        "model_id": resolved_model_id,
        "league_id": int(league_id) if league_id is not None else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "windows": rows,
        "window_count": len(rows),
        "samples": int(sample_weight),
        "accuracy": (weighted_accuracy / sample_weight) if sample_weight else None,
        "brier": (weighted_brier / sample_weight) if sample_weight else None,
        "log_loss": (weighted_log_loss / sample_weight) if sample_weight else None,
    }

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = ARTIFACT_DIR / f"backtest_{resolved_model_id}_{league_id or 'all'}.json"
    output_path.write_text(json.dumps(summary, indent=2))
    summary["artifact_path"] = str(output_path.resolve())

    if persist:
        engine = create_engine(settings.db_url)
        _ensure_model_evaluations_table(engine)
        created_at = datetime.now(timezone.utc)
        with engine.begin() as conn:
            for row in rows:
                conn.execute(
                    text(
                        f"""
                        INSERT INTO {MODEL_EVALUATIONS_TABLE} (
                            model_id, league_id, window_from, window_to, samples,
                            accuracy, brier, log_loss, calibration_json, created_at
                        ) VALUES (
                            :model_id, :league_id, :window_from, :window_to, :samples,
                            :accuracy, :brier, :log_loss, CAST(:calibration_json AS JSONB), :created_at
                        )
                        """
                    ),
                    {
                        "model_id": resolved_model_id,
                        "league_id": int(league_id) if league_id is not None else None,
                        "window_from": row.get("window_from"),
                        "window_to": row.get("window_to"),
                        "samples": int(row.get("samples") or 0),
                        "accuracy": row.get("accuracy"),
                        "brier": row.get("brier"),
                        "log_loss": row.get("log_loss"),
                        "calibration_json": json.dumps(
                            {
                                "window_index": row.get("window_index"),
                                "calibration_buckets": row.get("calibration_buckets"),
                            }
                        ),
                        "created_at": created_at,
                    },
                )
    return summary


def load_latest_backtest(*, settings: Optional[Settings] = None, league_id: Optional[int] = None) -> Optional[dict]:
    settings = settings or get_settings()
    engine = create_engine(settings.db_url)
    _ensure_model_evaluations_table(engine)

    sql = f"""
        SELECT model_id, league_id, window_from, window_to, samples, accuracy, brier, log_loss, calibration_json, created_at
        FROM {MODEL_EVALUATIONS_TABLE}
    """
    params = {}
    if league_id is not None:
        sql += " WHERE league_id = :league_id"
        params["league_id"] = int(league_id)
    sql += " ORDER BY created_at DESC, id DESC LIMIT 1"

    with engine.connect() as conn:
        row = conn.execute(text(sql), params).mappings().first()
    if not row:
        return None
    payload = dict(row)
    calibration = payload.get("calibration_json")
    if isinstance(calibration, str):
        try:
            payload["calibration_json"] = json.loads(calibration)
        except Exception:
            pass
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run rolling backtest and persist model evaluations.")
    parser.add_argument("--model-id", type=str, default=None)
    parser.add_argument("--league-id", type=int, default=None)
    parser.add_argument("--windows", type=int, default=4)
    parser.add_argument("--min-window", type=int, default=120)
    parser.add_argument("--no-persist", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_backtest(
        model_id=args.model_id,
        league_id=args.league_id,
        windows=args.windows,
        min_window=args.min_window,
        persist=not bool(args.no_persist),
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
