import data.ingest as ingest


class _FakeClient:
    pass



def test_ingest_league_history_uses_detail_fixture_ingest(monkeypatch):
    captured = {}

    monkeypatch.setattr(ingest, "_build_client", lambda: _FakeClient())
    monkeypatch.setattr(ingest, "ensure_tables", lambda engine: None)

    class _Engine:
        pass

    monkeypatch.setattr(ingest, "create_engine", lambda db_url: _Engine())
    monkeypatch.setattr(
        ingest,
        "fetch_fixture_ids_by_league_history",
        lambda client, league_id, target_count: [101, 102, 103],
    )

    def _ingest_fixture_ids(*, fixture_ids, client, progress_cb=None, start_progress=0, end_progress=100):
        captured["fixture_ids"] = fixture_ids
        captured["start_progress"] = start_progress
        captured["end_progress"] = end_progress
        return list(fixture_ids)

    monkeypatch.setattr(ingest, "ingest_fixture_ids", _ingest_fixture_ids)

    out = ingest.ingest_league_history(league_id=8, target_count=1000)

    assert out == [101, 102, 103]
    assert captured["fixture_ids"] == [101, 102, 103]
    assert captured["start_progress"] == 25
    assert captured["end_progress"] == 100


def test_main_accepts_legacy_league_mode_alias(monkeypatch):
    captured = {}

    class _Args:
        mode = "league"
        league_id = 5
        target_count = 1200
        start_date = "2026-02-01"
        end_date = "2026-02-01"

    monkeypatch.setattr(ingest, "parse_args", lambda: _Args())
    monkeypatch.setattr(
        ingest,
        "ingest_league_history",
        lambda league_id, target_count: captured.update({"league_id": league_id, "target_count": target_count}),
    )
    monkeypatch.setattr(ingest, "ingest_range", lambda start, end, league_id=None: None)

    ingest.main()

    assert captured["league_id"] == 5
    assert captured["target_count"] == 1200
