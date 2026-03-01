# Otomatik Günlük Maç Çekme Sistemi - Teknik Plan

## 🎯 Gereksinim

Her gün saat 00:00'da (gece yarısı) sistem otomatik olarak o günün maçlarını çeksin ve cache'e alsın.

## 🔍 Mevcut Durum Analizi

### Mevcut Scheduler Yapısı

Sistemde zaten **Celery Beat** ile çalışan bir scheduler var:

**Dosya**: [`worker/celery_app.py`](worker/celery_app.py:39)

```python
celery_app.conf.beat_schedule = {
    "refresh-fixture-board-cache-daily": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(
            hour=max(0, min(int(settings.fixture_cache_refresh_hour_utc), 23)),
            minute=max(0, min(int(settings.fixture_cache_refresh_minute_utc), 59)),
        ),
        "kwargs": {"trigger_type": "scheduled"},
    },
    "refresh-fixture-board-cache-live-window": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(minute="*/2"),  # Her 2 dakikada bir
        "kwargs": {"trigger_type": "scheduled_live_window"},
    },
}
```

### Mevcut Konfigürasyon

**Dosya**: [`app/config.py`](app/config.py:68)

```python
# Fixture board cache
fixture_cache_league_ids: str = "600,564,8,384,2,5"  # Süper Lig, La Liga, Premier League, Serie A, Champions League, Europa League
fixture_cache_horizon_days: int = 7  # 7 gün ilerisi
fixture_cache_refresh_hour_utc: int = 3  # UTC 03:00 (Türkiye 06:00)
fixture_cache_refresh_minute_utc: int = 15
```

## ⚠️ Sorun

Mevcut sistem:
1. ✅ Günlük olarak maçları çekiyor (UTC 03:15)
2. ✅ Her 2 dakikada canlı maçları güncelliyor
3. ❌ **ANCAK**: Gece yarısı (00:00) yeni günün maçlarını çekmiyor
4. ❌ Sabah 03:15'e kadar yeni günün maçları yüklenmiyor

## ✅ Çözüm: Gece Yarısı Maç Çekme

### Yaklaşım 1: Yeni Scheduler Job Ekle (Önerilen)

Gece yarısında özel bir job ekleyerek yeni günün maçlarını çek.

**Dosya**: `worker/celery_app.py`

```python
celery_app.conf.beat_schedule = {
    # Mevcut job'lar...
    
    # YENİ: Gece yarısı yeni günün maçlarını çek
    "refresh-fixture-board-cache-midnight": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(hour=0, minute=5),  # Her gün 00:05 (5 dakika buffer)
        "kwargs": {
            "trigger_type": "scheduled_midnight",
            "date_from": None,  # Bugünden başla
            "date_to": None,    # Horizon'a kadar
        },
    },
    
    "refresh-fixture-board-cache-daily": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(
            hour=max(0, min(int(settings.fixture_cache_refresh_hour_utc), 23)),
            minute=max(0, min(int(settings.fixture_cache_refresh_minute_utc), 59)),
        ),
        "kwargs": {"trigger_type": "scheduled"},
    },
    
    "refresh-fixture-board-cache-live-window": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(minute="*/2"),
        "kwargs": {"trigger_type": "scheduled_live_window"},
    },
}
```

### Yaklaşım 2: Mevcut Job'ı Güncelle

Mevcut daily job'ın saatini gece yarısına çek.

**Dosya**: `app/config.py`

```python
# Fixture board cache
fixture_cache_league_ids: str = "600,564,8,384,2,5"
fixture_cache_horizon_days: int = 7
fixture_cache_refresh_hour_utc: int = 21  # UTC 21:00 = Türkiye 00:00
fixture_cache_refresh_minute_utc: int = 5
```

**Avantaj**: Kod değişikliği gerektirmez, sadece config
**Dezavantaj**: Sabah güncellemesi olmaz

### Yaklaşım 3: Çoklu Günlük Refresh (En İyi)

Hem gece yarısı hem sabah maçları çek.

**Dosya**: `worker/celery_app.py`

```python
celery_app.conf.beat_schedule = {
    # Gece yarısı: Yeni günün maçlarını çek
    "refresh-fixture-board-cache-midnight": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(hour=21, minute=5),  # UTC 21:05 = TR 00:05
        "kwargs": {
            "trigger_type": "scheduled_midnight",
            "league_ids": None,  # Tüm ligler
        },
    },
    
    # Sabah: Güncellemeleri çek (oran değişiklikleri, yeni maçlar)
    "refresh-fixture-board-cache-morning": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(hour=3, minute=15),  # UTC 03:15 = TR 06:15
        "kwargs": {
            "trigger_type": "scheduled_morning",
            "league_ids": None,
        },
    },
    
    # Canlı: Her 2 dakikada güncellemeler
    "refresh-fixture-board-cache-live-window": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(minute="*/2"),
        "kwargs": {"trigger_type": "scheduled_live_window"},
    },
    
    # Haftalık model eğitimi (mevcut)
    "bootstrap-league-models-weekly": {
        "task": "worker.celery_app.bootstrap_league_models_task",
        "schedule": crontab(
            day_of_week=str(max(0, min(int(settings.league_model_retrain_weekday_utc), 6))),
            hour=max(0, min(int(settings.league_model_retrain_hour_utc), 23)),
            minute=max(0, min(int(settings.league_model_retrain_minute_utc), 59)),
        ),
        "kwargs": {"trigger_type": "scheduled"},
    },
}
```

## 🏗️ Detaylı Implementasyon

### Adım 1: Config Güncellemesi

**Dosya**: `app/config.py`

```python
class Settings(BaseSettings):
    # ... mevcut ayarlar ...
    
    # Fixture board cache
    fixture_cache_league_ids: str = "600,564,8,384,2,5"
    fixture_cache_horizon_days: int = 7
    
    # Gece yarısı refresh (Türkiye saati 00:05)
    fixture_cache_midnight_refresh_hour_utc: int = 21
    fixture_cache_midnight_refresh_minute_utc: int = 5
    
    # Sabah refresh (Türkiye saati 06:15)
    fixture_cache_morning_refresh_hour_utc: int = 3
    fixture_cache_morning_refresh_minute_utc: int = 15
    
    # Canlı refresh interval (dakika)
    fixture_cache_live_refresh_interval_minutes: int = 2
```

### Adım 2: Celery Beat Schedule Güncellemesi

**Dosya**: `worker/celery_app.py`

```python
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "football_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.timezone = "UTC"

# Scheduler yapılandırması
celery_app.conf.beat_schedule = {
    # 1. Gece Yarısı Refresh (Türkiye 00:05)
    "refresh-fixture-board-cache-midnight": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(
            hour=max(0, min(int(settings.fixture_cache_midnight_refresh_hour_utc), 23)),
            minute=max(0, min(int(settings.fixture_cache_midnight_refresh_minute_utc), 59)),
        ),
        "kwargs": {
            "trigger_type": "scheduled_midnight",
            "requested_by": "system_midnight_refresh",
        },
    },
    
    # 2. Sabah Refresh (Türkiye 06:15)
    "refresh-fixture-board-cache-morning": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(
            hour=max(0, min(int(settings.fixture_cache_morning_refresh_hour_utc), 23)),
            minute=max(0, min(int(settings.fixture_cache_morning_refresh_minute_utc), 59)),
        ),
        "kwargs": {
            "trigger_type": "scheduled_morning",
            "requested_by": "system_morning_refresh",
        },
    },
    
    # 3. Canlı Refresh (Her 2 dakika)
    "refresh-fixture-board-cache-live-window": {
        "task": "worker.celery_app.refresh_fixture_board_cache_task",
        "schedule": crontab(
            minute=f"*/{max(1, min(int(settings.fixture_cache_live_refresh_interval_minutes), 59))}"
        ),
        "kwargs": {
            "trigger_type": "scheduled_live_window",
            "requested_by": "system_live_refresh",
        },
    },
    
    # 4. Haftalık Model Eğitimi
    "bootstrap-league-models-weekly": {
        "task": "worker.celery_app.bootstrap_league_models_task",
        "schedule": crontab(
            day_of_week=str(max(0, min(int(settings.league_model_retrain_weekday_utc), 6))),
            hour=max(0, min(int(settings.league_model_retrain_hour_utc), 23)),
            minute=max(0, min(int(settings.league_model_retrain_minute_utc), 59)),
        ),
        "kwargs": {"trigger_type": "scheduled"},
    },
}
```

### Adım 3: Task Fonksiyonunu İyileştir

**Dosya**: `worker/celery_app.py`

```python
@celery_app.task(bind=True)
def refresh_fixture_board_cache_task(
    self,
    trigger_type: str = "manual",
    requested_by: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    league_ids: Optional[List[int]] = None,
):
    """
    Refresh fixture board cache.
    
    Args:
        trigger_type: Type of trigger (manual, scheduled_midnight, scheduled_morning, scheduled_live_window)
        requested_by: Who requested the refresh
        date_from: Start date (ISO format)
        date_to: End date (ISO format)
        league_ids: List of league IDs to refresh
    """
    logger.info(
        "Refreshing fixture board cache (trigger_type={}, requested_by={}, date_from={}, date_to={}, league_ids={})",
        trigger_type,
        requested_by,
        date_from,
        date_to,
        league_ids,
    )
    
    settings = get_settings()
    self.update_state(state="PROGRESS", meta={"progress": 1, "stage": "Basladi"})
    
    # Trigger type'a göre özel davranış
    if trigger_type == "scheduled_midnight":
        logger.info("Midnight refresh: Fetching new day's fixtures")
        # Yeni günün maçlarını çek
        date_from_obj = None  # Bugünden başla
        date_to_obj = None    # Horizon'a kadar
        
    elif trigger_type == "scheduled_morning":
        logger.info("Morning refresh: Updating fixtures and odds")
        # Güncellemeleri çek
        date_from_obj = None
        date_to_obj = None
        
    elif trigger_type == "scheduled_live_window":
        # Sadece bugün ve yarının maçlarını güncelle (performans)
        from datetime import date, timedelta
        today = date.today()
        date_from_obj = today
        date_to_obj = today + timedelta(days=1)
        logger.info(f"Live window refresh: {date_from_obj} to {date_to_obj}")
        
    else:
        # Manuel veya diğer
        date_from_obj = datetime.fromisoformat(date_from).date() if date_from else None
        date_to_obj = datetime.fromisoformat(date_to).date() if date_to else None
    
    try:
        result = refresh_fixture_board_cache(
            settings=settings,
            date_from=date_from_obj,
            date_to=date_to_obj,
            league_ids=league_ids,
            trigger_type=trigger_type,
            requested_by=requested_by or "system",
        )
        
        logger.info(
            "Fixture board cache refresh completed: {} fixtures cached",
            result.get("cached_count", 0)
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Fixture board cache refresh failed: {e}", exc_info=True)
        raise
```

### Adım 4: Logging İyileştirmesi

**Dosya**: `app/fixture_board.py`

```python
def refresh_fixture_board_cache(
    *,
    settings: Optional[Settings] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    league_ids: Optional[Iterable[int]] = None,
    trigger_type: str = "manual",
    requested_by: str = "unknown",
) -> dict:
    """
    Refresh fixture board cache.
    """
    resolved_settings = settings or get_settings()
    target_leagues = parse_fixture_cache_league_ids(
        list(league_ids) if league_ids is not None else resolved_settings.fixture_cache_league_ids
    )
    window_start, window_end = resolve_cache_window(
        resolved_settings, 
        date_from=date_from, 
        date_to=date_to
    )
    
    logger.info(
        f"Starting fixture cache refresh: "
        f"trigger={trigger_type}, "
        f"requested_by={requested_by}, "
        f"window={window_start} to {window_end}, "
        f"leagues={target_leagues}"
    )
    
    # ... mevcut implementasyon ...
    
    logger.info(
        f"Fixture cache refresh completed: "
        f"cached={cached_count} fixtures, "
        f"duration={duration_seconds}s"
    )
    
    return {
        "cached_count": cached_count,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "leagues": target_leagues,
        "trigger_type": trigger_type,
        "requested_by": requested_by,
    }
```

## 📊 Scheduler Zaman Çizelgesi

```
Türkiye Saati (UTC+3)
─────────────────────────────────────────────────────────────

00:05 → Gece Yarısı Refresh
        - Yeni günün tüm maçlarını çek
        - 7 gün ilerisi için cache oluştur
        - Tüm ligler (Süper Lig, La Liga, Premier League, vb.)

06:15 → Sabah Refresh
        - Oran güncellemelerini çek
        - Yeni eklenen maçları çek
        - Maç saati değişikliklerini güncelle

Her 2 Dakika → Canlı Refresh
        - Sadece bugün ve yarının maçları
        - Canlı skor güncellemeleri
        - Maç durumu değişiklikleri

Pazar 09:00 → Haftalık Model Eğitimi
        - Tüm ligler için model eğitimi
        - Yeni verileri kullan
```

## 🔧 .env Konfigürasyonu

```bash
# Fixture Cache Settings
FIXTURE_CACHE_LEAGUE_IDS=600,564,8,384,2,5
FIXTURE_CACHE_HORIZON_DAYS=7

# Gece Yarısı Refresh (Türkiye 00:05 = UTC 21:05)
FIXTURE_CACHE_MIDNIGHT_REFRESH_HOUR_UTC=21
FIXTURE_CACHE_MIDNIGHT_REFRESH_MINUTE_UTC=5

# Sabah Refresh (Türkiye 06:15 = UTC 03:15)
FIXTURE_CACHE_MORNING_REFRESH_HOUR_UTC=3
FIXTURE_CACHE_MORNING_REFRESH_MINUTE_UTC=15

# Canlı Refresh Interval (dakika)
FIXTURE_CACHE_LIVE_REFRESH_INTERVAL_MINUTES=2
```

## 🧪 Test Senaryoları

### Test 1: Manuel Trigger

```bash
# Celery task'ı manuel çalıştır
docker-compose exec worker celery -A worker.celery_app call \
  worker.celery_app.refresh_fixture_board_cache_task \
  --kwargs='{"trigger_type": "manual", "requested_by": "test_user"}'
```

### Test 2: Scheduler Kontrolü

```bash
# Celery beat schedule'ı kontrol et
docker-compose exec worker celery -A worker.celery_app inspect scheduled

# Aktif task'ları listele
docker-compose exec worker celery -A worker.celery_app inspect active
```

### Test 3: Log Kontrolü

```bash
# Worker loglarını izle
docker-compose logs -f worker

# Gece yarısı refresh logunu ara
docker-compose logs worker | grep "scheduled_midnight"
```

## 📈 Monitoring

### Celery Flower (Web UI)

```bash
# Flower'ı başlat
docker-compose exec worker celery -A worker.celery_app flower --port=5555

# Tarayıcıda aç
http://localhost:5555
```

### Prometheus Metrics (Opsiyonel)

```python
# worker/celery_app.py
from prometheus_client import Counter, Histogram

fixture_refresh_counter = Counter(
    'fixture_refresh_total',
    'Total fixture refresh operations',
    ['trigger_type', 'status']
)

fixture_refresh_duration = Histogram(
    'fixture_refresh_duration_seconds',
    'Fixture refresh duration',
    ['trigger_type']
)

@celery_app.task(bind=True)
def refresh_fixture_board_cache_task(self, trigger_type="manual", **kwargs):
    with fixture_refresh_duration.labels(trigger_type=trigger_type).time():
        try:
            result = refresh_fixture_board_cache(...)
            fixture_refresh_counter.labels(trigger_type=trigger_type, status='success').inc()
            return result
        except Exception as e:
            fixture_refresh_counter.labels(trigger_type=trigger_type, status='error').inc()
            raise
```

## ✅ Deployment Checklist

- [ ] Config değişkenleri `.env` dosyasına eklendi
- [ ] `app/config.py` güncellendi
- [ ] `worker/celery_app.py` scheduler güncellemesi yapıldı
- [ ] Celery worker yeniden başlatıldı
- [ ] Celery beat yeniden başlatıldı
- [ ] Scheduler job'ları kontrol edildi
- [ ] Test refresh çalıştırıldı
- [ ] Loglar kontrol edildi
- [ ] Gece yarısı refresh test edildi
- [ ] Monitoring kuruldu

## 🚀 Deployment Komutları

```bash
# 1. Kodu güncelle
git pull origin main

# 2. Docker container'ları yeniden başlat
docker-compose restart worker

# 3. Celery beat'i yeniden başlat
docker-compose restart beat

# 4. Logları kontrol et
docker-compose logs -f worker beat

# 5. Scheduler'ı kontrol et
docker-compose exec worker celery -A worker.celery_app inspect scheduled
```

## 🎯 Beklenen Sonuç

Sistemde artık:

1. ✅ **Gece 00:05**: Yeni günün tüm maçları otomatik çekilir
2. ✅ **Sabah 06:15**: Güncellemeler ve yeni maçlar çekilir
3. ✅ **Her 2 Dakika**: Canlı maçlar güncellenir
4. ✅ **Haftalık**: Model eğitimleri yapılır

Kullanıcılar gece yarısından itibaren yeni günün maçlarını görebilir!
