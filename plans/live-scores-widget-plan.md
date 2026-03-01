# Canlı Skor ve Oran Widget'ı - Mimari Plan

## 📋 Genel Bakış

Anasayfaya her dakika otomatik güncellenen canlı maç skorları ve oranlarını gösteren modern bir widget eklenecek. Widget, mevcut modern tasarım diline uygun olacak ve kullanıcı deneyimini artıracak.

## 🎯 Hedefler

1. **Canlı Skor Gösterimi**: Devam eden maçların anlık skorlarını göster
2. **Otomatik Güncelleme**: Her 60 saniyede bir veri çek
3. **Oran Değişiklikleri**: Oranların değişimini görsel olarak vurgula
4. **Modern Tasarım**: Mevcut glass-card ve neon-glow tasarımıyla uyumlu
5. **Responsive**: Mobil ve masaüstünde sorunsuz çalış

## 🏗️ Mimari Tasarım

### Bileşen Yapısı

```
web/src/components/home/
├── LiveScoresWidget.jsx       # Ana widget bileşeni
├── LiveScoresWidget.css       # Widget stilleri
├── LiveMatchCard.jsx          # Tek maç kartı
└── OddsChangeIndicator.jsx    # Oran değişim göstergesi
```

### Veri Akışı

```mermaid
graph LR
    A[LiveScoresWidget] -->|Her 60s| B[API Request]
    B --> C[/fixtures/live endpoint]
    C --> D[Live Matches Data]
    D --> E[State Update]
    E --> F[UI Re-render]
    F -->|Oran değişti mi?| G{Karşılaştır}
    G -->|Evet| H[Animasyon göster]
    G -->|Hayır| I[Normal göster]
```

## 🔌 Backend Entegrasyonu

### API Endpoint'leri

#### 1. Canlı Maçlar Endpoint'i
```
GET /fixtures/live
```

**Yanıt Formatı:**
```json
{
  "items": [
    {
      "fixture_id": 12345,
      "league_name": "Süper Lig",
      "home_team_name": "Galatasaray",
      "away_team_name": "Fenerbahçe",
      "home_team_logo": "https://...",
      "away_team_logo": "https://...",
      "home_score": 2,
      "away_score": 1,
      "minute": 67,
      "status": "LIVE",
      "odds": {
        "home": 1.85,
        "draw": 3.20,
        "away": 4.50
      }
    }
  ],
  "total": 5,
  "updated_at": "2026-02-27T18:50:00Z"
}
```

#### 2. Alternatif: Mevcut Endpoint Kullanımı
Eğer [`/fixtures/board`](../app/fixture_board.py:1339) endpoint'i `is_live` filtresi destekliyorsa:
```
GET /fixtures/board?is_live=true&limit=10
```

## 💻 Frontend Implementasyonu

### 1. LiveScoresWidget Bileşeni

**Özellikler:**
- ✅ Her 60 saniyede otomatik güncelleme
- ✅ Oran değişikliklerini tespit etme
- ✅ Yükleme ve hata durumları
- ✅ Boş durum (canlı maç yok)
- ✅ Animasyonlu geçişler

**State Yönetimi:**
```javascript
const [liveMatches, setLiveMatches] = useState([]);
const [previousOdds, setPreviousOdds] = useState({});
const [loading, setLoading] = useState(true);
const [lastUpdate, setLastUpdate] = useState(null);
```

### 2. LiveMatchCard Bileşeni

**Görsel Elemanlar:**
- Takım logoları
- Anlık skor (büyük font)
- Dakika bilgisi (yanıp sönen)
- Lig adı
- 1X2 oranları
- Oran değişim göstergeleri (↑↓)

### 3. OddsChangeIndicator Bileşeni

**Animasyonlar:**
- Oran arttı: Yeşil arka plan + ↑ ok
- Oran düştü: Kırmızı arka plan + ↓ ok
- Değişmedi: Normal görünüm
- Animasyon süresi: 2 saniye

## 🎨 Tasarım Özellikleri

### Renk Paleti (Mevcut Tema ile Uyumlu)

```css
/* Canlı maç vurgusu */
--live-indicator: #EF4444;
--live-glow: rgba(239, 68, 68, 0.3);

/* Oran değişimleri */
--odds-increase: #10B981;
--odds-decrease: #EF4444;
--odds-neutral: var(--text-muted);

/* Widget arka planı */
--widget-bg: var(--glass-bg);
--widget-border: var(--glass-border);
```

### Layout

```
┌─────────────────────────────────────────┐
│  🔴 CANLI SKORLAR                       │
│  Son güncelleme: 18:50                  │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │ Süper Lig • 67'                   │  │
│  │ [Logo] Galatasaray    2 - 1  [Logo]│  │
│  │        Fenerbahçe                 │  │
│  │                                   │  │
│  │  1: 1.85↑  X: 3.20  2: 4.50↓     │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ La Liga • 45+2'                   │  │
│  │ [Logo] Real Madrid    1 - 0  [Logo]│  │
│  │        Barcelona                  │  │
│  │                                   │  │
│  │  1: 2.10  X: 3.40↑  2: 3.20       │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 📱 Responsive Tasarım

### Desktop (>1024px)
- 2-3 maç yan yana
- Tam detay gösterimi
- Büyük takım logoları

### Tablet (768px - 1024px)
- 2 maç yan yana
- Orta boy logolar

### Mobile (<768px)
- Tek sütun
- Kompakt görünüm
- Küçük logolar
- Kaydırılabilir liste

## 🔄 Güncelleme Mekanizması

### Polling Stratejisi

```javascript
useEffect(() => {
  // İlk yükleme
  fetchLiveMatches();
  
  // Her 60 saniyede bir güncelle
  const interval = setInterval(() => {
    fetchLiveMatches();
  }, 60000);
  
  return () => clearInterval(interval);
}, []);
```

### Optimizasyon
- Sayfa görünür değilse güncelleme yapma (Page Visibility API)
- Hata durumunda exponential backoff
- Aynı veri gelirse gereksiz render'ı önle

## 🌐 Çoklu Dil Desteği

### Türkçe Terimler ([`web/src/i18n/terms.tr.ts`](web/src/i18n/terms.tr.ts:1))

```typescript
liveScores: {
  title: "Canlı Skorlar",
  noLiveMatches: "Şu anda canlı maç yok",
  lastUpdate: "Son güncelleme",
  minute: "dk",
  halfTime: "Devre Arası",
  fullTime: "Maç Bitti",
  loading: "Canlı maçlar yükleniyor...",
  error: "Canlı skorlar yüklenemedi",
  retry: "Tekrar Dene",
}
```

## 📍 Anasayfa Entegrasyonu

### Yerleşim Konumu

Widget, anasayfada [`HeroSection`](web/src/components/home/HeroSection.jsx:1) ve [`SliderShowcase`](web/src/components/home/SliderShowcase.jsx:1) arasına yerleştirilecek:

```jsx
// DashboardPage.jsx veya GuestLanding.jsx
<HeroSection />
<LiveScoresWidget apiBase={API_BASE} />
<SliderShowcase apiBase={API_BASE} />
<AiFeaturedHighlights />
```

## 🧪 Test Senaryoları

### Fonksiyonel Testler
1. ✅ Canlı maçlar başarıyla yükleniyor
2. ✅ Her 60 saniyede otomatik güncelleme çalışıyor
3. ✅ Oran değişiklikleri doğru tespit ediliyor
4. ✅ Animasyonlar düzgün çalışıyor
5. ✅ Boş durum mesajı gösteriliyor
6. ✅ Hata durumu yönetiliyor

### UI/UX Testler
1. ✅ Responsive tasarım tüm ekranlarda çalışıyor
2. ✅ Animasyonlar performanslı
3. ✅ Renkler ve fontlar tutarlı
4. ✅ Erişilebilirlik standartlarına uygun

## 🚀 Implementasyon Adımları

### Faz 1: Backend Hazırlık
1. Canlı maç endpoint'ini kontrol et veya oluştur
2. Oran verilerinin dahil edildiğinden emin ol
3. API yanıt formatını doğrula

### Faz 2: Frontend Bileşenler
1. [`LiveScoresWidget.jsx`](web/src/components/home/LiveScoresWidget.jsx) oluştur
2. [`LiveMatchCard.jsx`](web/src/components/home/LiveMatchCard.jsx) oluştur
3. [`OddsChangeIndicator.jsx`](web/src/components/home/OddsChangeIndicator.jsx) oluştur
4. [`LiveScoresWidget.css`](web/src/components/home/LiveScoresWidget.css) stil dosyası

### Faz 3: Entegrasyon
1. Dil dosyasına terimler ekle
2. Anasayfaya widget'ı ekle
3. Otomatik güncelleme mekanizmasını test et

### Faz 4: Optimizasyon
1. Performance optimizasyonu
2. Error handling iyileştirmeleri
3. Accessibility kontrolleri
4. Cross-browser testleri

## 📊 Performans Hedefleri

- **İlk Yükleme**: < 500ms
- **Güncelleme Süresi**: < 300ms
- **Animasyon FPS**: 60fps
- **Bellek Kullanımı**: < 5MB
- **API Yanıt Süresi**: < 1s

## 🔒 Güvenlik Notları

- API endpoint'i public olmalı (giriş gerektirmemeli)
- Rate limiting kontrolü
- XSS koruması (sanitize data)
- CORS ayarları doğru yapılandırılmalı

## 📝 Notlar

- Widget, kullanıcı giriş yapmasa bile görünür olmalı
- Canlı maç yoksa widget gizlenebilir veya "Canlı maç yok" mesajı gösterilebilir
- Oran değişim animasyonları dikkat dağıtıcı olmamalı
- Mobilde performans öncelikli olmalı

## 🎯 Başarı Kriterleri

✅ Widget anasayfada görünüyor
✅ Canlı maçlar doğru gösteriliyor
✅ Her dakika otomatik güncelleniyor
✅ Oran değişimleri vurgulanıyor
✅ Modern tasarımla uyumlu
✅ Responsive çalışıyor
✅ Performans hedeflerine ulaşılıyor
