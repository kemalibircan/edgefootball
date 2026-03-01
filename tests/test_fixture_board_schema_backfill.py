import app.fixture_board as fixture_board


def _normalize_sql(statement) -> str:
    return " ".join(str(statement).split())


def test_ensure_fixture_board_tables_backfills_live_score_columns_and_index():
    executed_sql: list[str] = []

    class _Connection:
        def execute(self, statement, params=None):
            executed_sql.append(_normalize_sql(statement))
            return None

    class _BeginContext:
        def __enter__(self):
            return _Connection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class _Engine:
        def begin(self):
            return _BeginContext()

    fixture_board.ensure_fixture_board_tables(_Engine())

    expected_statements = [
        f"ALTER TABLE {fixture_board.FIXTURE_BOARD_CACHE_TABLE} ADD COLUMN IF NOT EXISTS home_score INTEGER",
        f"ALTER TABLE {fixture_board.FIXTURE_BOARD_CACHE_TABLE} ADD COLUMN IF NOT EXISTS away_score INTEGER",
        f"ALTER TABLE {fixture_board.FIXTURE_BOARD_CACHE_TABLE} ADD COLUMN IF NOT EXISTS match_state TEXT",
        f"ALTER TABLE {fixture_board.FIXTURE_BOARD_CACHE_TABLE} ADD COLUMN IF NOT EXISTS match_minute INTEGER",
        f"ALTER TABLE {fixture_board.FIXTURE_BOARD_CACHE_TABLE} ADD COLUMN IF NOT EXISTS match_second INTEGER",
        f"ALTER TABLE {fixture_board.FIXTURE_BOARD_CACHE_TABLE} ADD COLUMN IF NOT EXISTS match_added_time INTEGER",
        f"CREATE INDEX IF NOT EXISTS idx_fixture_board_cache_is_live ON {fixture_board.FIXTURE_BOARD_CACHE_TABLE} (is_live) WHERE is_live = TRUE",
    ]

    for expected in expected_statements:
        assert any(expected in sql for sql in executed_sql), f"Missing expected SQL: {expected}"
