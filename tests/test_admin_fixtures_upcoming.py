from datetime import datetime, timedelta, timezone

import app.admin as admin


def _fixture_summary(fixture_id: int, starting_at: str, league_id: int = 600) -> dict:
    dt = admin._parse_datetime(starting_at)
    return {
        "fixture_id": fixture_id,
        "league_id": league_id,
        "starting_at": starting_at,
        "home_team_name": f"Home {fixture_id}",
        "away_team_name": f"Away {fixture_id}",
        "match_label": f"Home {fixture_id} vs Away {fixture_id}",
        "is_upcoming": bool(dt and dt.date() >= datetime.now(timezone.utc).date()),
        "_sort_dt": dt,
    }


def test_filter_and_sort_fixtures_accepts_string_league_ids():
    future_day = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT17:00:00Z")
    items = [
        _fixture_summary(201, future_day, league_id="600"),
        _fixture_summary(202, future_day, league_id="564"),
    ]

    filtered = admin._filter_and_sort_fixtures(
        items,
        league_id=600,
        upcoming_only=True,
        sort="asc",
    )

    assert len(filtered) == 1
    assert filtered[0]["fixture_id"] == 201


def test_merge_fixture_lists_deduplicates_by_fixture_id():
    base = [_fixture_summary(10, "2026-02-09T17:00:00Z"), _fixture_summary(11, "2026-02-10T17:00:00Z")]
    live = [_fixture_summary(11, "2026-02-10T19:00:00Z"), _fixture_summary(12, "2026-02-11T17:00:00Z")]

    merged = admin._merge_fixture_lists(base, live)
    by_id = {item["fixture_id"]: item for item in merged}

    assert set(by_id.keys()) == {10, 11, 12}
    assert by_id[11]["starting_at"] == "2026-02-10T19:00:00Z"


def test_get_fixtures_paged_reads_from_cache_loader(monkeypatch):
    future_start = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT17:00:00Z")
    upcoming_fixture = _fixture_summary(19443115, future_start)
    monkeypatch.setattr(
        admin,
        "load_cached_fixture_summaries",
        lambda **kwargs: {
            "page": 1,
            "page_size": 12,
            "total": 1,
            "total_pages": 1,
            "items": [upcoming_fixture],
        },
    )
    monkeypatch.setattr(
        admin,
        "_load_live_fixture_summaries",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("should not call live loader")),
    )

    settings = admin.Settings(dummy_mode=True, sportmonks_api_token=None)
    payload = admin.get_fixtures_paged(
        page=1,
        page_size=12,
        league_id=600,
        upcoming_only=True,
        settings=settings,
    )

    assert payload["total"] == 1
    assert payload["items"][0]["fixture_id"] == 19443115


def test_get_today_superlig_matches_uses_cache(monkeypatch):
    fixture_date = datetime.now(timezone.utc).date().strftime("%Y-%m-%dT17:00:00Z")
    one_item = _fixture_summary(777, fixture_date, league_id=600)
    monkeypatch.setattr(
        admin,
        "load_cached_fixture_summaries",
        lambda **kwargs: {
            "page": 1,
            "page_size": 400,
            "total": 1,
            "total_pages": 1,
            "items": [one_item],
        },
    )

    settings = admin.Settings(dummy_mode=True, sportmonks_api_token=None)
    payload = admin.get_today_superlig_matches(league_id=600, settings=settings)

    assert payload["items"][0]["fixture_id"] == 777
