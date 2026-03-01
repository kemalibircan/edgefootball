# Test Rehberi - Slider ve Maçlar

## ✅ Düzeltilen Sorunlar

### 1. Bugünün Maçları Sorunu - ÇÖZÜLDÜ
**Problem:** Backend'den gelen veri yapısı (flat structure) ile frontend'in beklediği yapı (nested structure) uyuşmuyordu.

**Çözüm:** `MatchPredictionCenter.jsx` güncellendi:
- `fixture.id` → `fixture.fixture_id`
- `fixture.home_team?.name` → `fixture.home_team_name`
- `fixture.home_team?.logo_url` → `fixture.home_team_logo`
- `fixture.league?.name` → `fixture.league_name`

### 2. Slider Dizini Oluşturuldu
`app/static/slider/` dizini oluşturuldu.

---

## 🧪 Test Adımları

### A. Bugünün Maçlarını Test Et

1. **Sayfayı Yenile** (Cmd+Shift+R veya Ctrl+Shift+R)

2. **Ana Sayfada "Bugünün Maçları" bölümünü kontrol et**
   - ✅ 15 maç görüyor musunuz? (Süper Lig, Premier League, La Liga, Serie A)
   - ✅ Takım logoları yükleniyor mu?
   - ✅ Saat bilgileri doğru mu?
   - ✅ "Detay Gör" ve "AI'a Sor" butonları çalışıyor mu?

3. **Lig Filtreleme Test Et**
   - Süper Lig butonuna tıkla → Sadece Süper Lig maçları görmeli
   - Premier League → Sadece PL maçları
   - "Tüm Ligler" → Tüm maçlar

4. **Arama Testi**
   - "Galatasaray" yaz → Sadece Galatasaray maçı çıkmalı
   - "Real Madrid" yaz → Real Madrid maçı görünmeli

---

### B. Slider Görselleri - Otomasyonu Test Et

#### Şu Anda Durum:
- Slider **varsayılan Unsplash görselleri** kullanıyor (3 adet)
- DALL-E 3 ile otomatik görsel üretimi **henüz aktif değil**

#### DALL-E ile Otomatik Slider Görselleri Oluşturma:

**1. OpenAI API Key'ini Ayarla**

`.env` dosyasına ekle:
```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
DALLE_MODEL=dall-e-3
DAILY_GENERATION_ENABLED=true
```

**2. Backend'i Yeniden Başlat**
```bash
cd /Users/ali/Desktop/FootballAi
source venv/bin/activate  # veya activate.bat (Windows)
uvicorn app.main:app --reload --port 8001
```

**3. Admin Panel'den Görsel Oluştur**

Login olun ve şu URL'ye gidin:
```
http://localhost:3001/admin/odds-banner
```

**"DALL-E 3 Slider Görselleri"** bölümünde:
- "Generate 3 Slider Images" butonuna tıklayın
- 20-30 saniye bekleyin (DALL-E API yanıt vermeli)
- Oluşturulan görseller görünecek

**4. API ile Test (Alternatif)**

Terminal'de:
```bash
curl -X POST http://localhost:8001/admin/slider/generate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"count": 3}'
```

**5. Otomatik Günlük Oluşturma**

Scheduler aktif ise, her sabah 06:00'da otomatik olarak:
- ✅ 3 yeni slider görseli oluşturulacak
- ✅ Bugünün öne çıkan maçları AI tarafından seçilecek
- ✅ İddia oranları analiz edilecek

---

### C. Slider'ı Kontrol Et

1. **Ana Sayfada Slider Bölümüne Bak**
   - 3 görsel otomatik rotate oluyor mu? (4 saniye aralıkla)
   - Ok butonları çalışıyor mu?
   - Alt kısımdaki dot'lar doğru gösteriyor mu?

2. **API'den Görselleri Kontrol Et**
```bash
curl -s http://localhost:8001/slider/public | jq '.items | length'
```
Çıktı: `3` (veya daha fazla)

3. **Dosya Sisteminde Kontrol Et**
```bash
ls -la app/static/slider/
```
DALL-E görselleri burada depolanıyor.

---

## 🎨 DALL-E Prompts (Slider İçin)

Sistem şu promptları kullanıyor:

1. **"Modern football stadium at night with vibrant neon lights, dramatic sky, wide angle, professional photography style"**

2. **"Dynamic football match action moment, players in motion, intense atmosphere, stadium lights, cinematic style"**

3. **"Football tactics board with strategic formations, modern design, dramatic lighting, professional sports photography"**

---

## 🔧 Sorun Giderme

### Maçlar Hala Gözükmüyorsa:

1. **Console'u kontrol et** (F12 → Console sekmesi)
   ```javascript
   // Şu hatayı arıyoruz:
   Failed to load fixtures
   ```

2. **Backend loglarını kontrol et**
   ```bash
   # Terminal'de backend'in çalıştığı yerde
   # Şunu aramalısın:
   GET /fixtures/public/today
   ```

3. **API'yi manuel test et**
   ```bash
   curl http://localhost:8001/fixtures/public/today | jq '.total'
   ```
   Çıktı: `15` (veya bir sayı)

### Slider Görselleri Oluşturulmazsa:

1. **OpenAI API Key Kontrolü**
   ```bash
   echo $OPENAI_API_KEY  # Boş olmamalı
   ```

2. **Backend Logları**
   ```bash
   # Şunu aramalısın:
   POST /admin/slider/generate
   # Veya hata:
   OpenAI API error
   ```

3. **Yetki Kontrolü**
   - Admin paneline sadece **superadmin** hesabıyla erişilebilir
   - Normal kullanıcılar göremez

---

## 📊 Beklenen Sonuçlar

✅ **Ana Sayfa:**
- Hero Section (modern navy + lime tasarım)
- Slider (3+ görsel, otomatik rotate)
- AI Featured Highlights (yapay zeka skorları)
- **Bugünün Maçları** (15 maç + filtreler)
- Odds Analysis Board

✅ **Maç Listesi:**
- Takım logoları
- Lig isimleri
- Saat bilgisi
- "Detay Gör" → `/fixture/:id` sayfası
- "AI'a Sor" → Chat sidebar açılır

✅ **Slider Otomasyonu:**
- Manuel: Admin panelden "Generate" butonu
- Otomatik: Her gün sabah 06:00 (scheduler)

---

## 🚀 Bir Sonraki Adımlar

1. Sayfayı yenile ve maçları kontrol et
2. OpenAI API key varsa, slider görsellerini oluştur
3. Chat sidebar'ı test et ("AI'a Sor" butonuyla)
4. Fixture detail sayfasını test et (bir maça tıkla)

Herhangi bir sorun olursa, browser console'unu ve backend loglarını kontrol edin!
