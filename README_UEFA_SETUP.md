# UEFA Champions League & Europa League Setup Guide

## Data Ingestion

To ingest historical data for Champions League and Europa League:

### Option 1: Using Python Script

```bash
# Ingest Champions League data (League ID: 2)
.venv/bin/python -m data.ingest --mode league-history --league-id 2 --target-count 1200

# Ingest Europa League data (League ID: 5)
.venv/bin/python -m data.ingest --mode league-history --league-id 5 --target-count 1200
```

### Option 2: Using Celery Worker Tasks

```bash
# Start the worker
celery -A worker.celery_app worker --loglevel=info

# In another terminal, trigger ingestion via Python
.venv/bin/python -c "from worker.celery_app import ingest_league_history_task; ingest_league_history_task.delay(2, 1200)"
.venv/bin/python -c "from worker.celery_app import ingest_league_history_task; ingest_league_history_task.delay(5, 1200)"
```

### Option 3: Via Admin API (Recommended)

Once the backend is running, use the admin endpoint:

```bash
# POST to /admin/tasks/ingest-league-history
curl -X POST "http://localhost:8000/admin/tasks/ingest-league-history" \
  -H "Content-Type: application/json" \
  -d '{"league_id": 2, "target_count": 1200}'

curl -X POST "http://localhost:8000/admin/tasks/ingest-league-history" \
  -H "Content-Type: application/json" \
  -d '{"league_id": 5, "target_count": 1200}'
```

## Feature Building

After ingestion, rebuild features:

```bash
.venv/bin/python -m data.features rebuild
```

## Model Training

Train league-specific models:

```bash
# Train Champions League model
.venv/bin/python -m modeling.train --league-id 2

# Train Europa League model
.venv/bin/python -m modeling.train --league-id 5
```

Or use the bootstrap task to train all configured leagues:

```bash
# Via Admin API
curl -X POST "http://localhost:8000/admin/tasks/bootstrap-league-models"
```

## Configuration

The following configuration has been added:

- **League IDs**: 2 (Champions League), 5 (Europa League)
- **Fixture Cache**: Automatically includes UEFA fixtures
- **Model Training**: Configured for league-specific models
- **Automatic Routing**: Models automatically selected based on fixture's league

## Verification

Check data status:

```bash
# Check raw fixtures
psql $DB_URL -c "SELECT COUNT(*) FROM raw_fixtures WHERE payload->'data'->>'league_id' IN ('2', '5');"

# Check features
psql $DB_URL -c "SELECT COUNT(*) FROM features f JOIN raw_fixtures r ON f.fixture_id = r.fixture_id WHERE r.payload->'data'->>'league_id' IN ('2', '5');"
```

## Model Status

Check model status via admin endpoint:

```bash
curl "http://localhost:8000/admin/league-models/status"
```
