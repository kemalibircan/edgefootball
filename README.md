# Football Match Simulation API

Monte Carlo simulation service for upcoming fixtures using SportMonks Football API v3.0. Produces 1X2 probabilities, top scorelines, goal timing histogram, and qualitative drivers.

## Stack
- FastAPI for serving `/simulate?fixture_id=...`
- Celery + Redis for background ingest/feature tasks
- Postgres for raw + feature storage (JSONB for raw payloads)
- LightGBM/CatBoost fallback to HistGradientBoosting for expected goals models
- React + Vite admin panel for operating the full pipeline
- Docker Compose for local orchestration

## Quickstart
1. Copy env template
```bash
cp .env.example .env
```
Set `SPORTMONKS_API_TOKEN`, `DB_URL`, `REDIS_URL`. Set `DUMMY_MODE=true` to run without external API.
If you want AI commentary in panel, also set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (`gpt-5` default).
Auth / kredi ayarlari:
- `AUTH_SECRET`
- `AUTH_INITIAL_CREDITS` (default 100)
- `AI_QUERY_CREDIT_COST` (default 10)
- `BOOTSTRAP_SUPERADMIN_EMAIL` / `BOOTSTRAP_SUPERADMIN_PASSWORD` (ilk acilista otomatik superadmin)
- `AUTH_CODE_TTL_MINUTES` (default 10)
- `AUTH_CODE_RESEND_COOLDOWN_SECONDS` (default 60)
- `AUTH_CODE_MAX_ATTEMPTS` (default 5)
- `GOOGLE_OAUTH_CLIENT_IDS` (`<WEB_CLIENT_ID>,<IOS_CLIENT_ID>,<ANDROID_CLIENT_ID_DEBUG>,<ANDROID_CLIENT_ID_RELEASE>`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME`, `SMTP_USE_TLS`, `SMTP_USE_SSL`
- `SMTP_TIMEOUT_SECONDS` (default 20), `SMTP_RETRY_ATTEMPTS` (default 2), `SMTP_RETRY_BACKOFF_SECONDS` (default 1.0)

2. Install deps (uv recommended)
```bash
uv pip install -r requirements.txt
```

3. Run services
```bash
docker-compose up --build
```
API at http://localhost:8001/docs (Docker mapping)
Admin panel at http://localhost:3001

Not: `worker-beat` servisi gunluk fixture cache refresh taskini otomatik tetikler (varsayilan 03:15 UTC).

4. Ingest data
```bash
make ingest START=2026-02-01 END=2026-02-08 LEAGUE=600
```

5. Build features
```bash
make build-features
```

6. Train models (artifacts -> `artifacts/`)
```bash
make train
```

7. Simulate
```bash
curl "http://localhost:8001/simulate?fixture_id=123"
```
Select a specific trained model:
```bash
curl "http://localhost:8001/simulate?fixture_id=123&model_id=<model_id>"
```

## Admin Panel (React, port 3001)
The panel (`web/`) lets you run and monitor:
- ingest tasks (`/admin/tasks/ingest`)
- feature build (`/admin/tasks/features`)
- model training (`/admin/tasks/train`)
- league history ingest (`/admin/tasks/ingest-league-history`)
- task status polling (`/admin/tasks/{task_id}`)
- system metrics (`/admin/overview`)
- fixture list with team names (`/admin/fixtures`)
- recent feature rows (`/admin/features/recent`)
- model catalog + details (`/admin/models`)
- model source catalog (`/admin/models/sources`)
- activate model (`/admin/models/{model_id}/activate`)
- fixture simulation (`/simulate`)
- fixture board cache status (`/admin/fixtures-cache/status`)
- fixture board cache refresh task (`/admin/tasks/fixtures-cache-refresh`)
- AI odds commentary (`/ai/commentary`)
- save pre-match prediction snapshots (`/admin/predictions/save`)
- list daily saved predictions (`/admin/predictions/daily`)
- refresh actual result check for saved prediction (`/admin/predictions/{prediction_id}/refresh-result`)

Panelde fixture ID elle girmeden takim isimleriyle mac secilip simulasyon calistirilabilir.
Ust bardaki lig secici ile ayni panelden Super Lig (600), La Liga (564), Premier League (8) ve Serie A (384) icin tum akislari yonetebilirsin.
Yeni `Oran Tahtasi` sayfasi (`/oran-tahtasi`) DB cache verisini kullanir; listeleme sirasinda canli API cagrisi yapmaz.
Sag panelde model listesi gorulur; modele tiklandiginda egitimde kullanilan veri kaynaklari (hava, hakem, takim bilgisi vb.) detaylari gorulur.
Mac simulasyonu sonrasinda AI yorum butonuyla model + odds + skor olasiliklarini aciklayan yorum uretilir.
AI yanitinda sakatlik/eksik oyuncu sayisi, lineup, hava ve hakem baglamini gosteren analiz tablosu da doner.
Ayni panelde "Maci Tahmin Olarak Kaydet" ile pre-match tahmin snapshot'u kaydedilir ve gunluk listede dogru/yanlis takibi yapilabilir.
Her AI yorum istegi kullanicidan `AI_QUERY_CREDIT_COST` kadar kredi dusurur (default 10).
Yeni kullanicilar varsayilan olarak `AUTH_INITIAL_CREDITS` kadar kredi ile acilir (default 100).

Ilk kurulumda sistemde hic kullanici yoksa `BOOTSTRAP_SUPERADMIN_EMAIL` / `BOOTSTRAP_SUPERADMIN_PASSWORD`
ile bir superadmin otomatik olusturulur.

## Email Auth Akisi
- Register: `POST /auth/register/request` ile kod gonderilir, `POST /auth/register/verify` ile hesap aktive olur.
- Login (sifre): `POST /auth/login` body `{\"email\",\"password\"}`.
- Login (kod): `POST /auth/login/code/request` + `POST /auth/login/code/verify`.
- Forgot password: `POST /auth/password/forgot/request` + `POST /auth/password/forgot/confirm`.
- Google login: `POST /auth/login/google` body `{\"id_token\":\"...\"}`.

### Google / Gmail Login Setup
1. Google Cloud Console > Credentials altinda su OAuth istemcilerini olustur:
- Android OAuth client(lar)i (`packageName=com.mobil`, debug/release SHA-1 fingerprintleri icin ayri ayri).
- iOS OAuth client (`bundleId=org.reactjs.native.example.mobil`).
- Web OAuth client (mobil uygulamanin backend'e gonderecegi `id_token` audience degeri).
2. Backend `.env` dosyasina su degeri ekle:
```env
GOOGLE_OAUTH_CLIENT_IDS=<WEB_CLIENT_ID>,<IOS_CLIENT_ID>,<ANDROID_CLIENT_ID_DEBUG>,<ANDROID_CLIENT_ID_RELEASE>
```
3. Mobil `.env.development` dosyasina su degerleri ekle:
```env
GOOGLE_WEB_CLIENT_ID=<WEB_CLIENT_ID>
GOOGLE_IOS_CLIENT_ID=<IOS_CLIENT_ID>
```
4. iOS URL scheme degerini `mobil/ios/mobil/Info.plist` icindeki
`com.googleusercontent.apps.REPLACE_WITH_IOS_REVERSED_CLIENT_ID`
placeholder alanina yaz.
5. Web frontend icin `GOOGLE_WEB_CLIENT_ID` veya `VITE_GOOGLE_WEB_CLIENT_ID` degerini ayarla.
   Vite konfigu bu iki anahtari da destekler ve root `.env` degerini okuyabilir.
   Docker kullaniyorsan `docker-compose.yml` icindeki `web` servisi bu degeri otomatik aktarir.
6. Backend `.env` icindeki `GOOGLE_OAUTH_CLIENT_IDS` listesinde web client ID de bulunmalidir.
7. Env degisikligi sonrasi web dev server'i yeniden baslat:
```bash
cd web
npm run dev -- --host 0.0.0.0 --port 3001
```

### Gmail SMTP (App Password) Ornegi
1. Google hesabinda 2FA aktif et.
2. App Password olustur.
3. `.env` dosyasina su degerleri gir:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_FROM_ADDRESS=you@gmail.com
SMTP_FROM_NAME=Football AI
SMTP_USE_TLS=true
SMTP_TIMEOUT_SECONDS=20
SMTP_RETRY_ATTEMPTS=2
SMTP_RETRY_BACKOFF_SECONDS=1.0
```

Run locally (without Docker):
```bash
cd web
npm install
npm run dev -- --port 3001
```

## Data Flow
- `data/ingest.py`: fetch fixtures with rich includes; store raw JSONB in Postgres `raw_fixtures`.
- `data/features.py`: derive pre-match features (rolling form, ELO strength, shots/possession profile, referee/weather signals), persist to Postgres `features` and Parquet for ML.
- `app/fixture_board.py`: configured lig listesi (varsayilan: Super Lig, LaLiga, Premier League, Serie A, Champions League, Europa League) icin fixture + odds board snapshot tablosunu gunceller. Canli mac penceresinde bugun verisi 2 dakikada bir yenilenir.
- `saved_predictions` table: stores immutable pre-match simulation + AI commentary snapshots and later match-result correctness updates.
- `modeling/train.py`: trains two regressors (lambda_home, lambda_away). Saves `lambda_home.pkl`, `lambda_away.pkl`, `meta.json`.
- `modeling/simulate.py`: loads artifacts, builds feature vector for fixture, samples Poisson scorelines (10k runs default), computes 1X2 probs, top scorelines, first-goal timing, key drivers.
- `worker/celery_app.py`: Celery tasks for ingest + feature building.

## Kaggle Export
Feature parquet lives at `artifacts/features.parquet`. Upload directly or convert to CSV via `pandas.read_parquet(...).to_csv('features.csv')`.

## Testing
```bash
make test
```

## Release Checklist (League Models)
Before production release, verify league-default model mapping for prediction flows:

1. Check league model status:
```bash
curl -H "Authorization: Bearer <TOKEN>" "http://localhost:8001/admin/league-models/status"
```
2. Confirm target leagues are mapped:
- `600` Super Lig
- `564` La Liga
- `8` Premier League
- `384` Serie A
- `2` Champions League
- `5` Europa League
3. If any league default is missing or degraded, run bootstrap:
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  "http://localhost:8001/admin/tasks/bootstrap-league-models" -d "{}"
```
4. Re-check `/admin/league-models/status` and verify defaults are ready before go-live.
5. Production deployment oncesi tum acik API/SMTP anahtarlarini rotate edin ve `.env` dosyasinda gecici deger birakmayin.

## Post-Deploy DB Stabilization Checklist
1. Startup migration logs:
```bash
docker logs footballai-api-1 | grep "Startup migrations completed"
docker logs footballai-worker-1 | grep "Startup migrations completed"
```
2. Deadlock kontrolu:
```bash
docker logs footballai-api-1 | grep -i "DeadlockDetected"
docker logs footballai-db-1 | grep -i "deadlock detected"
```
Beklenen sonuc: cikti olmamali.
3. Connection saturation kontrolu:
```bash
docker logs footballai-db-1 | grep -i "too many clients already"
```
Beklenen sonuc: cikti olmamali.

## Dummy Mode
Set `DUMMY_MODE=true` (and/or empty token). Client returns synthetic fixture payload so end-to-end flow works offline.

## Port note
- Postgres host port: `5434` (container 5432).
- API host port: `8001` (container 8000).
- Redis host port: `6380` (container 6379).
- React admin panel host port: `3001`.

## OpenAPI
FastAPI automatically exposes schema at `/openapi.json`; docs at `/docs`.

## Mobile App (React Native, no Expo)
Mobile client lives under `mobil/` and is built with bare React Native CLI + TypeScript.

### Stack
- React Native 0.84 (bare, Expo yok)
- React Navigation (`native-stack`, `bottom-tabs`)
- NativeWind (Tailwind)
- Zustand + AsyncStorage
- TanStack Query
- Ionicons (`react-native-vector-icons`)

### Setup
```bash
cd mobil
npm install
```

For iOS pods:
```bash
cd ios
bundle exec pod install
cd ..
```

Set mobile env values in:
- `mobil/.env.development`
```env
API_BASE_URL=http://localhost:8001
GOOGLE_WEB_CLIENT_ID=<WEB_CLIENT_ID>
GOOGLE_IOS_CLIENT_ID=<IOS_CLIENT_ID>
```

### Run
```bash
cd mobil
npm run start
```

In another terminal:
```bash
cd mobil
npm run ios
```

or
```bash
cd mobil
npm run android
```

### Implemented Mobile Flows
- Auth: login/register/forgot-password/logout
- Fixture board listing and filters
- Fixture detail, model selection, simulation, AI commentary
- Coupon generation + task polling
- Saved coupons (active/archive/restore/delete)

## Notes
- Rate limiting + caching implemented in `sportmonks_client/client.py`.
- Raw responses stored as JSONB for reproducibility.
- Training split is time-aware using `event_date`.
- Training now requires a real feature dataset by default (no silent synthetic fallback).
