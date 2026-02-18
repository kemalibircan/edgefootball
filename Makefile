PYTHON=python
PACKAGE=football_sim

install:
	uv pip install -r requirements.txt

lint:
	uv pip install -r requirements.txt --extra-index-url
	uv pip install ruff
	ruff check .

test:
	uv pip install -r requirements.txt
	pytest -q --disable-warnings --maxfail=1

ingest:
	$(PYTHON) -m data.ingest --start-date $(START) --end-date $(END) --league-id $(LEAGUE)

ingest-superlig-history:
	$(PYTHON) -m data.ingest --mode league-history --league-id $(LEAGUE) --target-count $(TARGET)

build-features:
	$(PYTHON) -m data.features --rebuild

train:
	$(PYTHON) -m modeling.train --limit $(LIMIT)

serve:
	uvicorn app.main:app --reload --port 8000

serve-web:
	cd web && npm install && npm run dev -- --port 3001

worker:
	celery -A worker.celery_app worker -l info

.PHONY: install lint test ingest ingest-superlig-history build-features train serve serve-web worker
