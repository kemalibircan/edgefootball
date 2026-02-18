from datetime import date

import numpy as np
import pandas as pd
import pytest

import modeling.train as train


def _patch_training_df(monkeypatch, df: pd.DataFrame) -> None:
    monkeypatch.setattr(train, "_read_training_frame_from_db", lambda settings: df.copy())


def test_data_source_catalog_includes_market_odds():
    catalog = {item["key"]: item for item in train.get_data_source_catalog()}
    assert "market_odds" in catalog
    assert catalog["market_odds"]["columns"] == ["market_prob_home", "market_prob_draw", "market_prob_away"]


def test_load_training_frame_requires_real_dataset(monkeypatch):
    _patch_training_df(monkeypatch, pd.DataFrame())

    with pytest.raises(FileNotFoundError):
        train.load_training_frame(limit=100, league_id=600, allow_synthetic_fallback=False)


def test_outcome_metrics_perfect_direction():
    y_home = pd.Series([3, 1, 0], dtype=float)
    y_away = pd.Series([0, 1, 3], dtype=float)
    pred_home = np.array([3.0, 1.1, 0.2], dtype=float)
    pred_away = np.array([0.2, 1.0, 3.1], dtype=float)

    metrics = train._evaluate_outcome_predictions(
        y_home=y_home,
        y_away=y_away,
        pred_home=pred_home,
        pred_away=pred_away,
    )

    assert metrics["samples"] == 3
    assert float(metrics["accuracy"]) >= (2.0 / 3.0)
    assert float(metrics["brier"]) < 0.2
    assert float(metrics["log_loss"]) < 1.0


def test_resolve_feature_columns_prefers_pre_match_form():
    df = pd.DataFrame(
        [
            {
                "form_points_home": 1.5,
                "form_points_away": 1.1,
                "form_points_diff": 0.4,
                "elo_home_pre": 1510.0,
                "elo_away_pre": 1490.0,
                "elo_diff": 20.0,
                "weather_temp": 18.0,
                "referee_yellow_cards": 4.1,
                "home_team_id": 1,
                "away_team_id": 2,
            }
        ]
    )

    cols = train._resolve_feature_columns(df, ["team_form", "elo", "weather", "referee"])
    assert "form_points_home" in cols
    assert "form_points_away" in cols
    assert "elo_diff" in cols
    assert "weather_temp" in cols
    assert "referee_yellow_cards" in cols
    assert "home_team_id" not in cols


def test_load_training_frame_filters_by_date_range(monkeypatch):
    sample_df = pd.DataFrame(
        [
            {
                "fixture_id": 1,
                "league_id": 600,
                "home_team_id": 101,
                "away_team_id": 201,
                "event_date": "2026-02-09T17:00:00+00:00",
                "label_home_goals": 2,
                "label_away_goals": 1,
            },
            {
                "fixture_id": 2,
                "league_id": 600,
                "home_team_id": 102,
                "away_team_id": 202,
                "event_date": "2026-02-10T17:00:00+00:00",
                "label_home_goals": 1,
                "label_away_goals": 1,
            },
            {
                "fixture_id": 3,
                "league_id": 564,
                "home_team_id": 103,
                "away_team_id": 203,
                "event_date": "2026-02-10T17:00:00+00:00",
                "label_home_goals": 0,
                "label_away_goals": 2,
            },
        ]
    )
    _patch_training_df(monkeypatch, sample_df)

    filtered = train.load_training_frame(
            league_id=600,
            training_date_from=date(2026, 2, 10),
            training_date_to=date(2026, 2, 10),
            selected_sources=["team_info"],
            allow_synthetic_fallback=False,
        )

    assert len(filtered) == 1
    assert int(filtered.iloc[0]["fixture_id"]) == 2


def test_load_training_frame_latest_mode_uses_most_recent_rows_when_limit_set(monkeypatch):
    sample_df = pd.DataFrame(
        [
            {
                "fixture_id": 11,
                "league_id": 600,
                "home_team_id": 111,
                "away_team_id": 211,
                "event_date": "2023-02-10T17:00:00+00:00",
                "label_home_goals": 1,
                "label_away_goals": 1,
            },
            {
                "fixture_id": 22,
                "league_id": 600,
                "home_team_id": 122,
                "away_team_id": 222,
                "event_date": "2025-12-10T17:00:00+00:00",
                "label_home_goals": 2,
                "label_away_goals": 0,
            },
            {
                "fixture_id": 33,
                "league_id": 600,
                "home_team_id": 133,
                "away_team_id": 233,
                "event_date": "2026-02-10T17:00:00+00:00",
                "label_home_goals": 3,
                "label_away_goals": 2,
            },
        ]
    )
    _patch_training_df(monkeypatch, sample_df)

    latest_rows = train.load_training_frame(
            league_id=600,
            limit=2,
            training_mode="latest",
            selected_sources=["team_info"],
            allow_synthetic_fallback=False,
        )

    fixture_ids = latest_rows["fixture_id"].astype(int).tolist()
    assert fixture_ids == [33, 22]


def test_load_training_frame_latest_mode_ignores_future_and_unlabeled_rows(monkeypatch):
    sample_df = pd.DataFrame(
        [
            {
                "fixture_id": 10,
                "league_id": 600,
                "home_team_id": 110,
                "away_team_id": 210,
                "event_date": "2019-02-10T17:00:00+00:00",
                "label_home_goals": 0,
                "label_away_goals": 1,
            },
            {
                "fixture_id": 20,
                "league_id": 600,
                "home_team_id": 120,
                "away_team_id": 220,
                "event_date": "2020-02-10T17:00:00+00:00",
                "label_home_goals": 2,
                "label_away_goals": 2,
            },
            {
                "fixture_id": 30,
                "league_id": 600,
                "home_team_id": 130,
                "away_team_id": 230,
                "event_date": "2021-02-10T17:00:00+00:00",
                "label_home_goals": 1,
                "label_away_goals": 0,
            },
            {
                "fixture_id": 40,
                "league_id": 600,
                "home_team_id": 140,
                "away_team_id": 240,
                "event_date": "2999-02-10T17:00:00+00:00",
                "label_home_goals": None,
                "label_away_goals": None,
            },
        ]
    )
    _patch_training_df(monkeypatch, sample_df)

    latest_rows = train.load_training_frame(
            league_id=600,
            limit=2,
            training_mode="latest",
            selected_sources=["team_info"],
            allow_synthetic_fallback=False,
        )

    fixture_ids = latest_rows["fixture_id"].astype(int).tolist()
    assert fixture_ids == [30, 20]


def test_load_training_frame_standard_mode_limit_uses_most_recent_completed_rows(monkeypatch):
    sample_df = pd.DataFrame(
        [
            {
                "fixture_id": 1,
                "league_id": 600,
                "home_team_id": 101,
                "away_team_id": 201,
                "event_date": "2021-02-10T17:00:00+00:00",
                "label_home_goals": 1,
                "label_away_goals": 0,
            },
            {
                "fixture_id": 2,
                "league_id": 600,
                "home_team_id": 102,
                "away_team_id": 202,
                "event_date": "2023-02-10T17:00:00+00:00",
                "label_home_goals": 2,
                "label_away_goals": 1,
            },
            {
                "fixture_id": 3,
                "league_id": 600,
                "home_team_id": 103,
                "away_team_id": 203,
                "event_date": "2026-02-10T17:00:00+00:00",
                "label_home_goals": 3,
                "label_away_goals": 2,
            },
            {
                "fixture_id": 4,
                "league_id": 600,
                "home_team_id": 104,
                "away_team_id": 204,
                "event_date": "2999-02-10T17:00:00+00:00",
                "label_home_goals": 1,
                "label_away_goals": 1,
            },
        ]
    )
    _patch_training_df(monkeypatch, sample_df)

    rows = train.load_training_frame(
            league_id=600,
            limit=2,
            training_mode="standard",
            selected_sources=["team_info"],
            allow_synthetic_fallback=False,
        )

    fixture_ids = rows["fixture_id"].astype(int).tolist()
    assert fixture_ids == [3, 2]
